// One-shot repair of the cirBTC pools when they're stuck far above
// REFUSE_DRIFT_BPS and the regular auto-rebalance bot has tapped out.
//
//   pnpm hh run scripts/repair-cirbtc-pools.js --network arcTestnet
//
// Dry-run (default) — just prints what it would do:
//   node-equivalent prints math + post-state estimate + skips on-chain calls.
//
// Execute for real:
//   set CONFIRM=1 && pnpm hh run scripts/repair-cirbtc-pools.js --network arcTestnet
//
// Optional knobs
//   ONLY=USDC-cirBTC      Only repair one pool.
//   MAX_CIRBTC_IN=0.005   Cap cirBTC budget per pool (raw human units).
//                         If the computed optimal swap exceeds this cap,
//                         the script does a partial repair using the cap.
//   SLIPPAGE_BPS=200      Min-out slippage from quoted getAmountOut (2%).
//
// Background
//   Pool ratios shifted to ~$1M/BTC after a polluted TARGET_RATIO env
//   override drove auto-rebalance to dump USDC into both cirBTC pools.
//   Drift now exceeds REFUSE_DRIFT_BPS=5000, so the regular bot refuses.
//   This script computes the constant-product swap that brings each pool
//   to the live BTC ratio in a single transaction, ignoring the refuse
//   threshold because the operator is making the call explicitly.

const hre = require('hardhat');
const fs = require('fs');
const path = require('path');
const { getTargetRate } = require('./lib/getTargetRate');
const { computeArbSwap } = require('./lib/computeArbSwap');

const CONFIRM = process.env.CONFIRM === '1';
const ONLY = process.env.ONLY || '';
const MAX_CIRBTC_IN_HUMAN = process.env.MAX_CIRBTC_IN
  ? parseFloat(process.env.MAX_CIRBTC_IN)
  : null;
const SLIPPAGE_BPS = BigInt(process.env.SLIPPAGE_BPS ?? '200'); // 2%

function bigMin(a, b) { return a < b ? a : b; }

async function main() {
  const cfgPath = path.join(__dirname, '..', 'public', 'arc-contracts.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const { LiftupRouter: routerAddr, USDC, EURC } = cfg;
  const CIRBTC = '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF';

  let signer;
  if (process.env.REBALANCER_PRIVATE_KEY) {
    signer = new hre.ethers.Wallet(process.env.REBALANCER_PRIVATE_KEY, hre.ethers.provider);
  } else {
    [signer] = await hre.ethers.getSigners();
  }

  const Router = await hre.ethers.getContractAt('LiftupRouter', routerAddr, signer);
  const erc20Abi = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function balanceOf(address) external view returns (uint256)',
    'function allowance(address owner, address spender) external view returns (uint256)',
  ];

  // Both cirBTC pools share the same shape: tokenA = stable (6dp), tokenB = cirBTC (8dp).
  const POOLS = [
    { id: 'USDC-cirBTC',  stable: USDC, stableSymbol: 'USDC', stableDec: 6 },
    { id: 'EURC-cirBTC',  stable: EURC, stableSymbol: 'EURC', stableDec: 6 },
  ].filter((p) => !ONLY || p.id === ONLY);

  console.log('LiftUp · repair cirBTC pools');
  console.log('────────────────────────────');
  console.log('Signer:    ', signer.address);
  console.log('Router:    ', routerAddr);
  console.log('Mode:      ', CONFIRM ? 'EXECUTE' : 'DRY-RUN (set CONFIRM=1 to execute)');
  if (MAX_CIRBTC_IN_HUMAN !== null) {
    console.log(`Budget cap: ${MAX_CIRBTC_IN_HUMAN} cirBTC per pool`);
  }
  if (ONLY) console.log(`Only pool: ${ONLY}`);

  const cirbtcC = new hre.ethers.Contract(CIRBTC, erc20Abi, signer);
  const balCirbtc = await cirbtcC.balanceOf(signer.address);
  console.log(`Wallet cirBTC: ${hre.ethers.formatUnits(balCirbtc, 8)}\n`);

  let totalCirbtcNeeded = 0n;
  const summaries = [];

  for (const p of POOLS) {
    console.log(`─── ${p.id} ────────────────────────────`);

    // 1. Live target rate + current reserves.
    const { rate: targetRate, source } = await getTargetRate({ pair: p.id });
    const [, reserveStable, reserveCirbtc] = await Router.getPairInfo(p.stable, CIRBTC);

    // Normalise target into raw-units ratio: cirBTC_raw / stable_raw.
    // p.stableDec = 6, cirBTC = 8 → shift by 10^(8-6) = 100.
    const decimalShift = 10 ** (8 - p.stableDec);
    const targetRaw = targetRate * decimalShift;
    const currentRaw = Number(reserveCirbtc) / Number(reserveStable);

    console.log(`  Target rate (live):  ${targetRate.toExponential(4)} cirBTC/${p.stableSymbol} (source: ${source})`);
    console.log(`  Reserves:            ${hre.ethers.formatUnits(reserveStable, p.stableDec)} ${p.stableSymbol} + ${hre.ethers.formatUnits(reserveCirbtc, 8)} cirBTC`);
    console.log(`  Current raw ratio:   ${currentRaw.toExponential(4)}`);
    console.log(`  Target  raw ratio:   ${targetRaw.toExponential(4)}`);
    console.log(`  Pool says BTC ≈      $${(Number(reserveStable) / Number(reserveCirbtc) * 100).toFixed(0)}`);
    console.log(`  Market BTC ≈         $${(1 / targetRate).toFixed(0)}`);

    // 2. Solve for the swap that lands the pool at the target (no-fee math).
    // computeArbSwap was written for USDC/EURC but its math is generic on
    // (reserveA, reserveB, target). Our pool's tokenA = stable, tokenB = cirBTC.
    const arb = computeArbSwap(reserveStable, reserveCirbtc, targetRaw);
    console.log(`  Drift: ${arb.driftBps} bps (${(arb.driftBps / 100).toFixed(2)}%)`);

    if (arb.amountIn === 0n) {
      console.log('  → No swap needed.\n');
      summaries.push({ pool: p.id, action: 'skip' });
      continue;
    }

    // Direction translation: 'usdc-to-eurc' = stable IN, 'eurc-to-usdc' = cirBTC IN.
    const cirbtcIn = arb.direction === 'eurc-to-usdc';
    const tokenIn = cirbtcIn ? CIRBTC : p.stable;
    const symIn = cirbtcIn ? 'cirBTC' : p.stableSymbol;
    const decIn = cirbtcIn ? 8 : p.stableDec;
    const tokenOut = cirbtcIn ? p.stable : CIRBTC;
    const symOut = cirbtcIn ? p.stableSymbol : 'cirBTC';
    const decOut = cirbtcIn ? p.stableDec : 8;

    // 3. Apply optional budget cap (only meaningful when input is cirBTC).
    let amountIn = arb.amountIn;
    let capped = false;
    if (cirbtcIn && MAX_CIRBTC_IN_HUMAN !== null) {
      const cap = hre.ethers.parseUnits(MAX_CIRBTC_IN_HUMAN.toString(), 8);
      if (amountIn > cap) { amountIn = cap; capped = true; }
    }

    // 4. Quote and slippage.
    const amountOutQuoted = await Router.getAmountOut(amountIn, tokenIn, tokenOut);
    const minOut = (amountOutQuoted * (10_000n - SLIPPAGE_BPS)) / 10_000n;

    console.log(`  Swap plan: ${hre.ethers.formatUnits(amountIn, decIn)} ${symIn} → ~${hre.ethers.formatUnits(amountOutQuoted, decOut)} ${symOut}${capped ? ' (CAPPED)' : ''}`);
    console.log(`  Min out:   ${hre.ethers.formatUnits(minOut, decOut)} ${symOut} (slippage ${SLIPPAGE_BPS} bps)`);

    if (cirbtcIn) totalCirbtcNeeded += amountIn;

    // 5. Balance check.
    const inC = new hre.ethers.Contract(tokenIn, erc20Abi, signer);
    const bal = await inC.balanceOf(signer.address);
    if (bal < amountIn) {
      const have = hre.ethers.formatUnits(bal, decIn);
      const need = hre.ethers.formatUnits(amountIn, decIn);
      console.log(`  ✗ INSUFFICIENT ${symIn}: have ${have}, need ${need}\n`);
      summaries.push({ pool: p.id, action: 'insufficient', need, have, token: symIn });
      continue;
    }

    if (!CONFIRM) {
      console.log('  → DRY-RUN: skipping on-chain calls.\n');
      summaries.push({ pool: p.id, action: 'dry-run', amountIn: hre.ethers.formatUnits(amountIn, decIn) });
      continue;
    }

    // 6. Approve + swap.
    const allowance = await inC.allowance(signer.address, routerAddr);
    if (allowance < amountIn) {
      console.log(`  → approving ${symIn}…`);
      const apTx = await inC.approve(routerAddr, amountIn);
      await apTx.wait();
      console.log(`    tx ${apTx.hash}`);
    }
    const deadline = Math.floor(Date.now() / 1000) + 600;
    console.log('  → swapping…');
    const tx = await Router.swapExactTokensForTokens(
      amountIn, minOut, [tokenIn, tokenOut], signer.address, deadline,
    );
    const rcpt = await tx.wait();
    console.log(`    tx ${rcpt.hash}`);

    // 7. Verify post-state.
    const [, postStable, postCirbtc] = await Router.getPairInfo(p.stable, CIRBTC);
    const postCurrentRaw = Number(postCirbtc) / Number(postStable);
    const postDriftBps = Math.round(Math.abs(postCurrentRaw - targetRaw) / targetRaw * 10_000);
    console.log(`  Post-state: ${hre.ethers.formatUnits(postStable, p.stableDec)} ${p.stableSymbol} + ${hre.ethers.formatUnits(postCirbtc, 8)} cirBTC`);
    console.log(`  Post raw ratio: ${postCurrentRaw.toExponential(4)}  (drift ${postDriftBps} bps)\n`);
    summaries.push({ pool: p.id, action: 'repaired', tx: rcpt.hash, postDriftBps });
  }

  console.log('────────────────────────────');
  console.log(`Total cirBTC required across pools: ${hre.ethers.formatUnits(totalCirbtcNeeded, 8)}`);
  console.log(JSON.stringify({ mode: CONFIRM ? 'execute' : 'dry-run', pools: summaries }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
