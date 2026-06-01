// Same repair flow as scripts/repair-cirbtc-pools.js, but signing through
// a Circle Developer-Controlled wallet instead of a local private key.
//
// Use when you want to fix a pool but keep the bot's key out of CI
// secrets / local .env files.
//
//   pnpm hh run scripts/repair-via-circle.js --network arcTestnet
//
// Required env (see scripts/lib/circleSigner.js for setup notes)
//   CIRCLE_API_KEY=…
//   CIRCLE_ENTITY_SECRET=…
//   CIRCLE_REBALANCER_WALLET_ID=…
//
// Same knobs as the regular repair:
//   ONLY=USDC-cirBTC     repair only one pool
//   MAX_CIRBTC_IN=0.005  cap budget per pool
//   CONFIRM=1            execute (default = dry-run)
//
// Compared to scripts/repair-cirbtc-pools.js, this script:
//   • Uses Circle for approve + swap (writes go through Circle API)
//   • Uses local hardhat provider for read-only state (cheaper, faster)
//   • Otherwise math + plan output is identical

const hre = require('hardhat');
const fs = require('fs');
const path = require('path');
const { getTargetRate } = require('./lib/getTargetRate');
const { computeArbSwap } = require('./lib/computeArbSwap');
const { getCircleAddress, circleExecute } = require('./lib/circleSigner');

const CONFIRM = process.env.CONFIRM === '1';
const ONLY = process.env.ONLY || '';
const MAX_CIRBTC_IN_HUMAN = process.env.MAX_CIRBTC_IN
  ? parseFloat(process.env.MAX_CIRBTC_IN)
  : null;
const SLIPPAGE_BPS = BigInt(process.env.SLIPPAGE_BPS ?? '200');

async function main() {
  const cfgPath = path.join(__dirname, '..', 'public', 'arc-contracts.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const { LiftupRouter: routerAddr, USDC, EURC } = cfg;
  const CIRBTC = '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF';

  // Reads via the standard hardhat provider — no signing needed.
  const provider = hre.ethers.provider;
  const Router = new hre.ethers.Contract(
    routerAddr,
    [
      'function getPairInfo(address tokenA, address tokenB) view returns (address pair, uint256 reserveA, uint256 reserveB, uint256 totalSupply)',
      'function getAmountOut(uint256 amountIn, address tokenIn, address tokenOut) view returns (uint256 amountOut)',
    ],
    provider,
  );
  const erc20 = (addr) =>
    new hre.ethers.Contract(addr, ['function balanceOf(address) view returns (uint256)'], provider);

  const signerAddress = await getCircleAddress();
  console.log('LiftUp · repair via Circle wallet');
  console.log('─────────────────────────────────');
  console.log('Circle wallet:', signerAddress);
  console.log('Router:       ', routerAddr);
  console.log('Mode:         ', CONFIRM ? 'EXECUTE (Circle signs)' : 'DRY-RUN');
  if (ONLY) console.log('Only pool:    ', ONLY);
  if (MAX_CIRBTC_IN_HUMAN !== null) console.log('Budget cap:   ', `${MAX_CIRBTC_IN_HUMAN} cirBTC/pool`);

  const POOLS = [
    { id: 'USDC-cirBTC', stable: USDC, stableSymbol: 'USDC', stableDec: 6 },
    { id: 'EURC-cirBTC', stable: EURC, stableSymbol: 'EURC', stableDec: 6 },
  ].filter((p) => !ONLY || p.id === ONLY);

  const cirbtcBal = await erc20(CIRBTC).balanceOf(signerAddress);
  console.log(`\nCircle wallet cirBTC: ${hre.ethers.formatUnits(cirbtcBal, 8)}\n`);

  for (const p of POOLS) {
    console.log(`─── ${p.id} ───────────────────`);
    const { rate: targetRate } = await getTargetRate({ pair: p.id });
    const [, reserveStable, reserveCirbtc] = await Router.getPairInfo(p.stable, CIRBTC);
    const decimalShift = 10 ** (8 - p.stableDec);
    const targetRaw = targetRate * decimalShift;

    const arb = computeArbSwap(reserveStable, reserveCirbtc, targetRaw);
    if (arb.amountIn === 0n) { console.log('  → no swap needed\n'); continue; }

    const cirbtcIn = arb.direction === 'eurc-to-usdc';
    const tokenIn = cirbtcIn ? CIRBTC : p.stable;
    const symIn = cirbtcIn ? 'cirBTC' : p.stableSymbol;
    const decIn = cirbtcIn ? 8 : p.stableDec;
    const tokenOut = cirbtcIn ? p.stable : CIRBTC;
    const decOut = cirbtcIn ? p.stableDec : 8;

    let amountIn = arb.amountIn;
    if (cirbtcIn && MAX_CIRBTC_IN_HUMAN !== null) {
      const cap = hre.ethers.parseUnits(MAX_CIRBTC_IN_HUMAN.toString(), 8);
      if (amountIn > cap) amountIn = cap;
    }
    const amountOut = await Router.getAmountOut(amountIn, tokenIn, tokenOut);
    const minOut = (amountOut * (10_000n - SLIPPAGE_BPS)) / 10_000n;

    console.log(`  Drift: ${arb.driftBps} bps · plan: ${hre.ethers.formatUnits(amountIn, decIn)} ${symIn} → ~${hre.ethers.formatUnits(amountOut, decOut)} ${cirbtcIn ? p.stableSymbol : 'cirBTC'}`);

    if (!CONFIRM) { console.log('  → DRY-RUN, skipping\n'); continue; }

    // ── Approve via Circle ──
    console.log('  → approve via Circle…');
    const approveTx = await circleExecute({
      contractAddress: tokenIn,
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters: [routerAddr, amountIn.toString()],
    });
    console.log(`    approve tx ${approveTx.txHash}`);

    // ── Swap via Circle ──
    console.log('  → swap via Circle…');
    const deadline = Math.floor(Date.now() / 1000) + 600;
    const swapTx = await circleExecute({
      contractAddress: routerAddr,
      abiFunctionSignature: 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
      abiParameters: [
        amountIn.toString(),
        minOut.toString(),
        [tokenIn, tokenOut],
        signerAddress,
        deadline.toString(),
      ],
    });
    console.log(`    swap tx ${swapTx.txHash}\n`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
