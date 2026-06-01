// Auto-rebalance every LiftUp pool to track live market rates.
//
//   pnpm pool:rebalance
//   pnpm hh run scripts/auto-rebalance.js --network arcTestnet
//
// Purpose
//   LiftUp's pools are isolated on Arc Testnet — there are no other
//   USDC/EURC, USDC/cirBTC, or EURC/cirBTC venues for arbitrageurs to
//   lean against, so each pool drifts from its spot rate as Circle's
//   prices move. This script is the synthetic arbitrageur for ALL
//   registered pools: every run it reads each pool's reserves, fetches
//   the relevant live spot rate, and performs ONE small swap per pool
//   to nudge the on-chain ratio back toward the target.
//
//   Bot always targets the LIVE rate — original seed ratios are
//   irrelevant. If BTC/USD moves 5%, the USDC/cirBTC pool moves 5%.
//
// Three-tier safety model (applied per-pool independently)
//   tier 1: drift < MIN_DRIFT_BPS              → skip
//   tier 2: drift in [MIN, ALERT]              → rebalance silently
//   tier 3: drift in [ALERT, REFUSE]           → rebalance + alert exit
//   tier 4: drift > REFUSE_DRIFT_BPS           → REFUSE + alert exit
//
// Per-tick size cap
//   • Percentage cap: PCT_CAP_BPS of pool tokenA reserve (default 2%)
//   • Absolute cap: per-pool, defined in POOLS below
//   Take the smaller of (computed-arb, pct-cap, abs-cap).
//
// Environment knobs
//   MIN_DRIFT_BPS=30        ALERT_DRIFT_BPS=1000   REFUSE_DRIFT_BPS=5000
//   PCT_CAP_BPS=200         DRY_RUN=1              REBALANCER_PRIVATE_KEY

const hre = require('hardhat');
const fs = require('fs');
const path = require('path');
const { getTargetRate } = require('./lib/getTargetRate');
const { computeArbSwap } = require('./lib/computeArbSwap');

const MIN_DRIFT_BPS = Number(process.env.MIN_DRIFT_BPS ?? '30');
const ALERT_DRIFT_BPS = Number(process.env.ALERT_DRIFT_BPS ?? '1000');
const REFUSE_DRIFT_BPS = Number(process.env.REFUSE_DRIFT_BPS ?? '5000');
const PCT_CAP_BPS = BigInt(process.env.PCT_CAP_BPS ?? '200');
const DRY_RUN = process.env.DRY_RUN === '1';

function bigMin(a, b) {
  return a < b ? a : b;
}

async function main() {
  const cfgPath = path.join(__dirname, '..', 'public', 'arc-contracts.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const { LiftupRouter: routerAddr, USDC, EURC } = cfg;
  const CIRBTC = '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF';

  // Prefer the dedicated rebalancer key when present.
  let signer;
  if (process.env.REBALANCER_PRIVATE_KEY) {
    signer = new hre.ethers.Wallet(
      process.env.REBALANCER_PRIVATE_KEY,
      hre.ethers.provider,
    );
  } else {
    [signer] = await hre.ethers.getSigners();
  }

  const Router = await hre.ethers.getContractAt('LiftupRouter', routerAddr, signer);
  const erc20Abi = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function balanceOf(address) external view returns (uint256)',
    'function allowance(address owner, address spender) external view returns (uint256)',
  ];

  // Pool registry — every pool the bot watches. Absolute cap units are
  // RAW (decimal-adjusted) per token; for the cirBTC pools we pick caps
  // sized to ≈ $5 of value at current BTC price.
  const POOLS = [
    {
      id: 'USDC-EURC',
      tokenA: USDC, symbolA: 'USDC', decA: 6,
      tokenB: EURC, symbolB: 'EURC', decB: 6,
      maxRawAtoB: hre.ethers.parseUnits('10', 6),   // 10 USDC
      maxRawBtoA: hre.ethers.parseUnits('10', 6),   // 10 EURC
    },
    {
      id: 'USDC-cirBTC',
      tokenA: USDC, symbolA: 'USDC', decA: 6,
      tokenB: CIRBTC, symbolB: 'cirBTC', decB: 8,
      maxRawAtoB: hre.ethers.parseUnits('5', 6),    // 5 USDC
      maxRawBtoA: hre.ethers.parseUnits('0.0001', 8), // 0.0001 cirBTC (~$7-8)
    },
    {
      id: 'EURC-cirBTC',
      tokenA: EURC, symbolA: 'EURC', decA: 6,
      tokenB: CIRBTC, symbolB: 'cirBTC', decB: 8,
      maxRawAtoB: hre.ethers.parseUnits('5', 6),    // 5 EURC
      maxRawBtoA: hre.ethers.parseUnits('0.0001', 8),
    },
  ];

  const results = [];
  let anyAlert = false;
  let highestExit = 0;

  for (const p of POOLS) {
    const fmtA = (raw) => hre.ethers.formatUnits(raw, p.decA);
    const fmtB = (raw) => hre.ethers.formatUnits(raw, p.decB);

    const summary = {
      pool: p.id,
      action: 'none',
      alert: false,
    };

    try {
      // 1. Fetch reserves + target rate (per-pair sources).
      const [, reserveA, reserveB] = await Router.getPairInfo(p.tokenA, p.tokenB);
      let rateResult;
      try {
        rateResult = await getTargetRate({ pair: p.id });
      } catch (rateErr) {
        summary.action = 'skip-no-rate';
        summary.reason = `target rate fetch failed: ${rateErr.message}`;
        results.push(summary);
        continue;
      }
      const { rate: targetRatio, source: rateSource } = rateResult;

      // computeArbSwap operates on raw integer reserves + decimal-scaled
      // target. Because tokenA and tokenB can have different decimals
      // (e.g. USDC 6, cirBTC 8), we normalise the target by multiplying
      // by 10^(decB - decA) so the raw-unit comparison stays correct.
      const decimalShift = 10 ** (p.decB - p.decA);
      const targetRatioRaw = targetRatio * decimalShift;

      const arb = computeArbSwap(reserveA, reserveB, targetRatioRaw);
      const currentRatioHuman = arb.currentRatio / decimalShift;

      summary.pool = p.id;
      summary.reserves = { a: fmtA(reserveA), b: fmtB(reserveB) };
      summary.target = {
        ratio: targetRatio.toFixed(8),
        source: rateSource,
      };
      summary.current = currentRatioHuman.toFixed(8);
      summary.drift = {
        bps: arb.driftBps,
        percent: (arb.driftBps / 100).toFixed(2) + '%',
      };

      // 2. Tier classification.
      if (arb.driftBps < MIN_DRIFT_BPS) {
        summary.action = 'skip-below-threshold';
        summary.reason = `drift ${arb.driftBps} bps < MIN ${MIN_DRIFT_BPS}`;
        results.push(summary);
        continue;
      }
      if (arb.driftBps > REFUSE_DRIFT_BPS) {
        summary.action = 'refuse-oracle-suspected';
        summary.alert = true;
        summary.reason = `drift > REFUSE ${REFUSE_DRIFT_BPS} bps — likely oracle issue`;
        anyAlert = true;
        highestExit = Math.max(highestExit, 2);
        results.push(summary);
        continue;
      }
      if (arb.driftBps > ALERT_DRIFT_BPS) {
        summary.alert = true;
        summary.reason = `drift > ALERT ${ALERT_DRIFT_BPS} bps — acting with cap`;
        anyAlert = true;
      }

      // 3. Compute capped swap size.
      const aToB = arb.direction === 'a-to-b' || arb.direction === 'usdc-to-eurc';
      // Pct cap based on the reserve of whichever side we're SPENDING.
      const inReserve = aToB ? reserveA : reserveB;
      const pctCapRaw = (inReserve * PCT_CAP_BPS) / 10_000n;
      const absCapRaw = aToB ? p.maxRawAtoB : p.maxRawBtoA;
      const effectiveCap = bigMin(pctCapRaw, absCapRaw);
      let amountIn = bigMin(arb.amountIn, effectiveCap);
      const capped = amountIn < arb.amountIn;

      const tokenIn = aToB ? p.tokenA : p.tokenB;
      const tokenOut = aToB ? p.tokenB : p.tokenA;
      const symbolIn = aToB ? p.symbolA : p.symbolB;
      const symbolOut = aToB ? p.symbolB : p.symbolA;
      const decIn = aToB ? p.decA : p.decB;

      summary.swap = {
        direction: `${symbolIn}→${symbolOut}`,
        idealAmountIn: hre.ethers.formatUnits(arb.amountIn, decIn),
        cappedAmountIn: hre.ethers.formatUnits(amountIn, decIn),
        capped,
      };

      // 4. Balance check on the input token.
      const inC = new hre.ethers.Contract(tokenIn, erc20Abi, signer);
      const balance = await inC.balanceOf(signer.address);
      if (balance < amountIn) {
        summary.action = 'skip-insufficient-balance';
        summary.reason = `balance ${hre.ethers.formatUnits(balance, decIn)} ${symbolIn} < required ${hre.ethers.formatUnits(amountIn, decIn)}`;
        highestExit = Math.max(highestExit, 3);
        results.push(summary);
        continue;
      }

      if (DRY_RUN) {
        summary.action = 'dry-run';
        summary.reason = 'DRY_RUN=1';
        results.push(summary);
        continue;
      }

      // 5. Approve (if needed) + swap.
      const currentAllowance = await inC.allowance(signer.address, routerAddr);
      if (currentAllowance < amountIn) {
        const apTx = await inC.approve(routerAddr, amountIn);
        await apTx.wait();
        summary.approveTxHash = apTx.hash;
      }

      const deadline = Math.floor(Date.now() / 1000) + 600;
      const swapTx = await Router.swapExactTokensForTokens(
        amountIn,
        0n,
        [tokenIn, tokenOut],
        signer.address,
        deadline,
      );
      const rcpt = await swapTx.wait();
      summary.txHash = rcpt.hash;

      // Post-state confirmation.
      const [, postA, postB] = await Router.getPairInfo(p.tokenA, p.tokenB);
      const postRatioHuman =
        Number(postB) / Number(postA) / decimalShift;
      summary.post = {
        a: fmtA(postA),
        b: fmtB(postB),
        ratio: postRatioHuman.toFixed(8),
        residualDriftBps: Math.round(
          (Math.abs(postRatioHuman - targetRatio) / targetRatio) * 10_000,
        ),
      };
      summary.action = capped ? 'rebalanced-partial' : 'rebalanced-full';
    } catch (poolErr) {
      summary.action = 'error';
      summary.error = poolErr && poolErr.message ? poolErr.message : String(poolErr);
      highestExit = Math.max(highestExit, 1);
    }

    results.push(summary);
  }

  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        signer: signer.address,
        dryRun: DRY_RUN,
        thresholds: { min: MIN_DRIFT_BPS, alert: ALERT_DRIFT_BPS, refuse: REFUSE_DRIFT_BPS },
        pctCapBps: Number(PCT_CAP_BPS),
        anyAlert,
        pools: results,
      },
      null,
      2,
    ),
  );

  if (anyAlert) process.exitCode = 2;
  else if (highestExit > 0) process.exitCode = highestExit;
}

main().catch((err) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    action: 'error',
    error: err && err.message ? err.message : String(err),
  }, null, 2));
  process.exit(1);
});
