// Re-seed USDC/EURC pool at a target price ratio.
//
//   pnpm hh run scripts/reseed-pool.js --network arcTestnet
//
//   TARGET_RATIO=0.98 USDC_AMOUNT=40 EURC_AMOUNT=39.2 \
//     pnpm hh run scripts/reseed-pool.js --network arcTestnet
//
// Why this exists
//   After fully removing liquidity from a Uniswap-V2 pair, the contract
//   keeps `MINIMUM_LIQUIDITY` (1000 wei of LP) permanently locked. That
//   locked dust pins the reserve ratio — every subsequent addLiquidity
//   matches the existing ratio rather than the one you supply.
//
//   So to actually shift the pool's price, we must perform a small swap
//   that pushes the dust reserves to the target ratio, THEN add fresh
//   liquidity at the matching amounts.
//
// Target ratio source
//   1. process.env.TARGET_RATIO (manual override) wins.
//   2. Otherwise CoinGecko EURC live price → 1 USDC = (1/eurcUsd) EURC.
//   3. Falls back through exchangerate.host → hardcoded 0.98.
//   See scripts/lib/getTargetRate.js for the full pipeline.
//
// EURC amount auto-derivation
//   If only USDC_AMOUNT is set, EURC_AMOUNT = USDC_AMOUNT × targetRatio.
//   Pass both env vars to override.
//
// Sequence
//   1. Resolve target ratio (live fetch, with fallbacks).
//   2. Read live reserves via router.getPairInfo.
//   3. Compute ΔU/ΔE that pushes the dust ratio to target via constant
//      product (see scripts/lib/computeArbSwap.js).
//   4. Execute the dust-arb swap.
//   5. Approve + addLiquidity at the resolved amounts.

const hre = require('hardhat');
const fs = require('fs');
const path = require('path');
const { getTargetRate } = require('./lib/getTargetRate');
const { computeArbSwap, TOKEN_DECIMALS } = require('./lib/computeArbSwap');

const SLIPPAGE_BPS = 1000; // 10% — wider than seed-liquidity so the
// post-swap ratio can drift slightly from TARGET_RATIO without bricking
// the add.

function fmt(n) {
  return hre.ethers.formatUnits(n, TOKEN_DECIMALS).slice(0, 14);
}

async function main() {
  const cfgPath = path.join(__dirname, '..', 'public', 'arc-contracts.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const { LiftupRouter: router, USDC: usdc, EURC: eurc } = cfg;

  const [deployer] = await hre.ethers.getSigners();
  const Router = await hre.ethers.getContractAt('LiftupRouter', router, deployer);

  const erc20Abi = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function balanceOf(address) external view returns (uint256)',
  ];
  const usdcC = new hre.ethers.Contract(usdc, erc20Abi, deployer);
  const eurcC = new hre.ethers.Contract(eurc, erc20Abi, deployer);

  console.log('LiftUp · pool re-seed at target ratio');
  console.log('─────────────────────────────────────');
  console.log('Deployer:        ', deployer.address);

  // -------------------------------------------------------------------
  // 1. Resolve target ratio (live fetch).
  // -------------------------------------------------------------------
  const { rate: targetRatio, source: rateSource } = await getTargetRate();
  console.log(`Target ratio:     ${targetRatio.toFixed(4)} EURC per USDC  (source: ${rateSource})`);

  // Resolve add amounts. USDC defaults to 100; EURC defaults to USDC × targetRatio.
  const usdcAmount = process.env.USDC_AMOUNT ?? '100';
  const eurcAmount =
    process.env.EURC_AMOUNT ?? (parseFloat(usdcAmount) * targetRatio).toFixed(6);
  console.log('Add amounts:     ', `${usdcAmount} USDC + ${eurcAmount} EURC`);
  console.log();

  // -------------------------------------------------------------------
  // 2. Live reserves + arb computation.
  // -------------------------------------------------------------------
  let info = await Router.getPairInfo(usdc, eurc);
  let rU = info[1];
  let rE = info[2];
  console.log('Current reserves:');
  console.log('  USDC:          ', fmt(rU));
  console.log('  EURC:          ', fmt(rE));

  if (rU === 0n && rE === 0n) {
    console.log('  (empty pool — first seed, skipping dust-arb)');
  } else {
    const arb = computeArbSwap(rU, rE, targetRatio);
    console.log('  Ratio (E/U):   ', arb.currentRatio.toFixed(4));
    console.log('  Drift vs target:', arb.driftBps, 'bps');

    if (arb.direction !== 'none' && arb.driftBps > 50) {
      // -------------------------------------------------------------------
      // 3. Execute dust-arb swap.
      // -------------------------------------------------------------------
      const tokenIn = arb.direction === 'usdc-to-eurc' ? usdc : eurc;
      const tokenOut = arb.direction === 'usdc-to-eurc' ? eurc : usdc;
      const inC = arb.direction === 'usdc-to-eurc' ? usdcC : eurcC;
      const label = arb.direction === 'usdc-to-eurc' ? 'USDC→EURC' : 'EURC→USDC';

      console.log(
        `→ Dust-arb: swap ${label}, amountIn = ${arb.amountIn} wei (${fmt(arb.amountIn)})`,
      );

      console.log('→ Approving router on swap-in token…');
      await (await inC.approve(router, arb.amountIn)).wait();

      console.log('→ Swapping…');
      const deadline = Math.floor(Date.now() / 1000) + 600;
      const swapTx = await Router.swapExactTokensForTokens(
        arb.amountIn,
        0n,
        [tokenIn, tokenOut],
        deployer.address,
        deadline,
      );
      const swapRcpt = await swapTx.wait();
      console.log(`  done. tx ${swapRcpt.hash}`);

      info = await Router.getPairInfo(usdc, eurc);
      rU = info[1];
      rE = info[2];
      const newRatio = Number(rE) / Number(rU);
      console.log('  Post-swap reserves:');
      console.log('    USDC:        ', fmt(rU));
      console.log('    EURC:        ', fmt(rE));
      console.log('    Ratio:       ', newRatio.toFixed(4));
    } else {
      console.log('→ Within 50 bps of target — skipping dust-arb.');
    }
  }

  // -------------------------------------------------------------------
  // 4. Add liquidity at resolved amounts.
  // -------------------------------------------------------------------
  const usdcWei = hre.ethers.parseUnits(usdcAmount, TOKEN_DECIMALS);
  const eurcWei = hre.ethers.parseUnits(eurcAmount, TOKEN_DECIMALS);

  const usdcBal = await usdcC.balanceOf(deployer.address);
  const eurcBal = await eurcC.balanceOf(deployer.address);
  console.log('\nDeployer balances:');
  console.log('  USDC:          ', fmt(usdcBal));
  console.log('  EURC:          ', fmt(eurcBal));
  if (usdcBal < usdcWei) throw new Error('Not enough USDC.');
  if (eurcBal < eurcWei) throw new Error('Not enough EURC.');

  console.log('\n→ Approving router on USDC…');
  await (await usdcC.approve(router, usdcWei)).wait();
  console.log('→ Approving router on EURC…');
  await (await eurcC.approve(router, eurcWei)).wait();

  console.log('→ addLiquidity…');
  const minA = (usdcWei * BigInt(10_000 - SLIPPAGE_BPS)) / 10_000n;
  const minB = (eurcWei * BigInt(10_000 - SLIPPAGE_BPS)) / 10_000n;
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const tx = await Router.addLiquidity(
    usdc,
    eurc,
    usdcWei,
    eurcWei,
    minA,
    minB,
    deployer.address,
    deadline,
  );
  const rcpt = await tx.wait();
  console.log(`  done. tx ${rcpt.hash}`);

  info = await Router.getPairInfo(usdc, eurc);
  const finalRatio = Number(info[2]) / Number(info[1]);
  console.log('\n✓ Pool re-seeded.');
  console.log('  Reserves:      ', fmt(info[1]), 'USDC');
  console.log('                 ', fmt(info[2]), 'EURC');
  console.log('  Final ratio:   ', finalRatio.toFixed(4), 'EURC per USDC');
  console.log('  LP supply:     ', info[3].toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
