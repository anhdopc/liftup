// Drain the deployer's LP positions out of the two cirBTC pools, so the
// operator can then re-run scripts/seed-cirbtc-pools.js to re-seed them
// at the live BTC ratio. This is the Plan B for when repair-cirbtc-pools.js
// can't run because the wallet doesn't hold enough cirBTC to do the
// constant-product fix swap.
//
//   pnpm hh run scripts/drain-cirbtc-pools.js --network arcTestnet
//
// Dry-run is the default — prints the LP balance + proportional token
// recovery for each pool and stops. To execute on-chain:
//   set CONFIRM=1 && pnpm hh run scripts/drain-cirbtc-pools.js --network arcTestnet
//
// Notes
//   • Only the SIGNER's LP balance is removed. Other LPs (if any) keep
//     their share. After draining, the pool may have a tiny stuck ratio
//     from non-deployer LP shares — that's fine; the next seed run will
//     just match that ratio rather than locking a new initial price.
//     If you specifically want a fresh-ratio re-seed, follow up with
//     scripts/repair-cirbtc-pools.js to push residual reserves to target.
//   • The seed script (scripts/seed-cirbtc-pools.js) is NOT auto-invoked —
//     run it as a separate step so the operator stays in control.

const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

const CONFIRM = process.env.CONFIRM === '1';
const ONLY = process.env.ONLY || '';
const SLIPPAGE_BPS = BigInt(process.env.SLIPPAGE_BPS ?? '200'); // 2%

const pairAbi = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function totalSupply() view returns (uint256)',
  'function getReserves() view returns (uint112, uint112, uint32)',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address, uint256) returns (bool)',
  'function allowance(address, address) view returns (uint256)',
];

async function main() {
  const cfgPath = path.join(__dirname, '..', 'public', 'arc-contracts.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const { LiftupRouter: routerAddr, USDC, EURC, pairs } = cfg;
  const CIRBTC = '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF';

  let signer;
  if (process.env.REBALANCER_PRIVATE_KEY) {
    signer = new hre.ethers.Wallet(process.env.REBALANCER_PRIVATE_KEY, hre.ethers.provider);
  } else {
    [signer] = await hre.ethers.getSigners();
  }
  const Router = await hre.ethers.getContractAt('LiftupRouter', routerAddr, signer);

  const POOLS = [
    { id: 'USDC-cirBTC', pair: pairs['USDC/cirBTC'], stable: USDC, stableSymbol: 'USDC', stableDec: 6 },
    { id: 'EURC-cirBTC', pair: pairs['EURC/cirBTC'], stable: EURC, stableSymbol: 'EURC', stableDec: 6 },
  ].filter((p) => !ONLY || p.id === ONLY);

  console.log('LiftUp · drain cirBTC pools');
  console.log('───────────────────────────');
  console.log('Signer:', signer.address);
  console.log('Mode:  ', CONFIRM ? 'EXECUTE' : 'DRY-RUN (set CONFIRM=1 to execute)\n');

  const summaries = [];

  for (const p of POOLS) {
    console.log(`─── ${p.id} (${p.pair}) ──`);
    const pair = new hre.ethers.Contract(p.pair, pairAbi, signer);

    const [token0, totalSupply, [r0, r1], userLp] = await Promise.all([
      pair.token0(),
      pair.totalSupply(),
      pair.getReserves(),
      pair.balanceOf(signer.address),
    ]);

    if (userLp === 0n) {
      console.log('  No LP balance — skipping.\n');
      summaries.push({ pool: p.id, action: 'skip-no-lp' });
      continue;
    }

    // Decide which reserve maps to stable vs cirBTC.
    const stableIsToken0 = token0.toLowerCase() === p.stable.toLowerCase();
    const reserveStable = stableIsToken0 ? r0 : r1;
    const reserveCirbtc = stableIsToken0 ? r1 : r0;

    // Pro-rata amounts the signer would receive at the current reserves.
    const shareBps = (userLp * 10_000n) / totalSupply;
    const recoverStable = (reserveStable * userLp) / totalSupply;
    const recoverCirbtc = (reserveCirbtc * userLp) / totalSupply;
    const minStable = (recoverStable * (10_000n - SLIPPAGE_BPS)) / 10_000n;
    const minCirbtc = (recoverCirbtc * (10_000n - SLIPPAGE_BPS)) / 10_000n;

    console.log(`  LP balance:    ${userLp} (share ${(Number(shareBps) / 100).toFixed(2)}%)`);
    console.log(`  Total supply:  ${totalSupply}`);
    console.log(`  Reserves:      ${hre.ethers.formatUnits(reserveStable, p.stableDec)} ${p.stableSymbol} + ${hre.ethers.formatUnits(reserveCirbtc, 8)} cirBTC`);
    console.log(`  Would recover: ${hre.ethers.formatUnits(recoverStable, p.stableDec)} ${p.stableSymbol} + ${hre.ethers.formatUnits(recoverCirbtc, 8)} cirBTC`);
    console.log(`  Min out (slippage ${SLIPPAGE_BPS} bps): ${hre.ethers.formatUnits(minStable, p.stableDec)} ${p.stableSymbol} + ${hre.ethers.formatUnits(minCirbtc, 8)} cirBTC`);

    if (!CONFIRM) {
      console.log('  → DRY-RUN: skipping on-chain calls.\n');
      summaries.push({
        pool: p.id, action: 'dry-run',
        userLp: userLp.toString(),
        recoverStable: hre.ethers.formatUnits(recoverStable, p.stableDec),
        recoverCirbtc: hre.ethers.formatUnits(recoverCirbtc, 8),
      });
      continue;
    }

    // Approve LP-token to the router (needed for removeLiquidity).
    const allow = await pair.allowance(signer.address, routerAddr);
    if (allow < userLp) {
      console.log('  → approving LP token…');
      const apTx = await pair.approve(routerAddr, userLp);
      await apTx.wait();
      console.log(`    tx ${apTx.hash}`);
    }

    const deadline = Math.floor(Date.now() / 1000) + 600;
    console.log('  → removeLiquidity…');
    // The router takes (tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline).
    // tokenA = stable, tokenB = cirBTC, with min* aligned the same way.
    const tx = await Router.removeLiquidity(
      p.stable, CIRBTC, userLp, minStable, minCirbtc, signer.address, deadline,
    );
    const rcpt = await tx.wait();
    console.log(`    tx ${rcpt.hash}`);

    // Verify post-state.
    const [postR0, postR1] = await pair.getReserves();
    const postStable = stableIsToken0 ? postR0 : postR1;
    const postCirbtc = stableIsToken0 ? postR1 : postR0;
    console.log(`  Post reserves: ${hre.ethers.formatUnits(postStable, p.stableDec)} ${p.stableSymbol} + ${hre.ethers.formatUnits(postCirbtc, 8)} cirBTC\n`);
    summaries.push({ pool: p.id, action: 'drained', tx: rcpt.hash });
  }

  console.log('────────────────────────────');
  console.log(JSON.stringify({ mode: CONFIRM ? 'execute' : 'dry-run', pools: summaries }, null, 2));
  if (CONFIRM) {
    console.log('\nNext step: re-seed at live ratio:');
    console.log('  pnpm hh run scripts/seed-cirbtc-pools.js --network arcTestnet');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
