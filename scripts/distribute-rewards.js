// On-chain reward distribution from LiftupRewardDistributor.
//
//   pnpm reward:distribute                       # settle + status only
//   BUCKET=daily pnpm reward:distribute          # plan daily payout (dry)
//   BUCKET=daily EXECUTE=1 pnpm reward:distribute # send tx
//
//   Other buckets: weekly, monthly, bonus
//
// Within every daily / weekly / monthly bucket, this script enforces
// the published policy:
//
//      60% Swap lottery  ──  rewards swappers
//      40% LP lottery    ──  rewards LP holders
//
// Selection rules (per the model on /liquidity):
//
//   DAILY  — equal odds on both sides. Random pick from qualified set:
//       Swap  : wallets with daily volume ≥ $100
//       LP    : wallets with current LP ≥ $100 held continuously 24h+
//     24 winners (10 for bonus), each receives 1/N of their path's budget.
//
//   WEEKLY — volume-weighted random. Pick 7 unique winners by weighted
//       sampling without replacement. Weight per wallet:
//         Swap  : their swap volume in the 7-day window
//         LP    : their LP USDC value × tier_mult (Sprout 1.00× /
//                  Climber 1.15× / Summit 1.30×). Lock multiplier is
//                  reserved for v2 once on-chain lock tracking ships.
//     Prize split: 1st 40 / 2nd 20 / 3-4 20 (10 each) / 5-6 15 (7.5 each) / 7 5.
//
//   MONTHLY — same model as weekly but 30-day window, 5 winners, split
//       1st 50 / 2nd 20 / 3rd 15 / 4th 10 / 5th 5.
//
// Randomness on testnet uses the latest block hash + cadence label as a
// public seed so anyone can reproduce the result off the tx receipt.
// Mainnet should swap this for Chainlink VRF or a commit-reveal scheme.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const hre = require('hardhat');

const TOKEN_DECIMALS = 6;
const CHUNK_BLOCKS = 9_500n;
const ARC_AVG_BLOCK_SECONDS = 2;

const ZERO = '0x0000000000000000000000000000000000000000';
const DEAD = '0x000000000000000000000000000000000000dead';

// 60% to Swap path, 40% to LP path of every daily/weekly/monthly bucket.
const SWAP_BPS = 6000;
const LP_BPS = 4000;

// Within the LP 40% bucket: 50% pro-rata to every qualified LP holder
// (steady yield by % of pool), 50% goes to the lottery (random / tier-
// weighted picks). Net effect on a bucket: 20% pro-rata + 20% lottery.
// LPs who never win the lottery still earn from the pro-rata stream —
// effectively a classic AMM-style yield AND a lottery upside.
const LP_PRORATA_BPS = 5000;
const LP_LOTTERY_BPS = 5000;

// Eligibility thresholds in USDC notional.
const DAILY_MIN_USDC = 100;     // ≥ $100 daily swap volume OR LP held 24h+
const WEEKLY_MIN_USDC = 1000;   // ≥ $1k weekly volume OR 5+ active days (v1: volume gate only)
const MONTHLY_MIN_USDC = 5000;  // ≥ $5k monthly volume OR 20+ active days (v1: volume gate only)
const LP_MIN_HOLD_SECONDS = 24 * 60 * 60; // anti-Sybil cooldown

// LP tier multipliers (weekly/monthly only).
const TIER = (usdcVal) =>
  usdcVal < 100 ? 0 : usdcVal <= 1000 ? 1.0 : usdcVal <= 5000 ? 1.15 : 1.3;

// Passive lock multiplier — how long the wallet has held LP CONTINUOUSLY
// since its first mint (Transfer from 0x0). Removing all LP resets the
// clock; partial removes leave the timestamp untouched. No on-chain lock
// contract needed — script just reads first-mint block from event logs.
const LOCK_MULTIPLIER = (holdingDays) =>
  holdingDays >= 180 ? 1.5
    : holdingDays >= 90 ? 1.25
      : holdingDays >= 30 ? 1.1
        : 1.0;

// Cadence config.
//
// `budgetDivisor` slices the bucket into N draws — every cadence today
// uses `budgetDivisor = 1`, so each cron run drains the entire frozen
// snapshot in one tx. Daily fires ONCE per day at 10:00 UTC, draining
// yesterday's frozen
// snapshot in a single tx: 24 swap winners + 24 LP-lottery winners +
// pro-rata to every qualified LP. weekly + monthly follow the same
// "one tx, N winners" shape, just on weekly / monthly cadence and with
// volume × tier × lock weighting.
const CADENCES = {
  daily: {
    distFn: 'distributeDaily',
    windowBlocks: 43_200n,   // ~24h on Arc (2s/block)
    winners: 24,             // 24 swap + 24 LP-lottery winners per daily run
    budgetDivisor: 1,        // drain dailyYesterday in one tx
    mode: 'equal',           // flat odds + equal payout per winner
    swapGate: DAILY_MIN_USDC,
    lpRequireHold: true,
  },
  weekly: {
    distFn: 'distributeWeekly',
    windowBlocks: 302_400n,  // ~7d
    winners: 7,
    budgetDivisor: 1,
    mode: 'weighted',
    weights: [4000, 2000, 1000, 1000, 750, 750, 500], // sum 10000
    swapGate: WEEKLY_MIN_USDC,
    lpRequireHold: true,
  },
  monthly: {
    distFn: 'distributeMonthly',
    windowBlocks: 1_296_000n, // ~30d
    winners: 5,
    budgetDivisor: 1,
    mode: 'weighted',
    weights: [5000, 2000, 1500, 1000, 500], // sum 10000
    swapGate: MONTHLY_MIN_USDC,
    lpRequireHold: true,
  },
  // Bonus is NOT auto-distributed — the 4.5% sits in the distributor
  // until owner manually sweeps it (scripts/sweep-growth.js) for a
  // community event or campaign. Kept here for the rare case where we
  // explicitly want to fire `BUCKET=bonus pnpm reward:distribute`.
  bonus: {
    distFn: 'distributeBonus',
    windowBlocks: 43_200n,
    winners: 10,
    budgetDivisor: 1,
    mode: 'equal',
    swapGate: DAILY_MIN_USDC,
    lpRequireHold: true,
  },
};

const PAIR_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
  'function balanceOf(address) external view returns (uint256)',
  'function totalSupply() external view returns (uint256)',
  'function token0() external view returns (address)',
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 ts)',
];

const DISTRIBUTOR_ABI = [
  'function settle(address token) external',
  'function rolloverDaily(address token) external',
  'function rolloverDue(address token) external view returns (bool)',
  'function getBuckets(address token) external view returns (uint256 growth_, uint256 dailyToday_, uint256 dailyYesterday_, uint256 weekly_, uint256 monthly_, uint256 bonus_, uint256 unsettled_)',
  'function distributeDaily(address token, address[] winners, uint256[] amounts) external',
  'function distributeWeekly(address token, address[] winners, uint256[] amounts) external',
  'function distributeMonthly(address token, address[] winners, uint256[] amounts) external',
  'function distributeBonus(address token, address[] winners, uint256[] amounts) external',
];

async function main() {
  const cfgPath = path.join(__dirname, '..', 'public', 'arc-contracts.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

  const distAddr = cfg.LiftupRewardDistributor;
  const usdcEurcPair = cfg.pairs && cfg.pairs['USDC/EURC'];
  const usdcCirbtcPair = cfg.pairs && cfg.pairs['USDC/cirBTC'];
  const eurcCirbtcPair = cfg.pairs && cfg.pairs['EURC/cirBTC'];
  const factoryAddr = cfg.LiftupFactory;
  const routerAddr = cfg.LiftupRouter;
  const usdcAddr = cfg.USDC;
  const eurcAddr = cfg.EURC;
  const cirbtcAddr = cfg.cirBTC || '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF';

  if (!distAddr || !usdcEurcPair || !factoryAddr || !routerAddr || !usdcAddr || !eurcAddr) {
    throw new Error('arc-contracts.json missing addresses. Re-run pnpm deploy:pool.');
  }

  const bucket = (process.env.BUCKET || '').toLowerCase();
  if (bucket && !CADENCES[bucket]) {
    throw new Error(`BUCKET must be one of ${Object.keys(CADENCES).join(', ')}`);
  }
  const execute = process.env.EXECUTE === '1';

  const [signer] = await hre.ethers.getSigners();
  console.log('Signer (owner):   ', signer.address);
  console.log('Distributor:      ', distAddr);
  console.log('Mode:             ', execute ? 'EXECUTE (will send tx)' : 'DRY RUN');
  console.log('Bucket:           ', bucket || '(none — settle + status only)');
  console.log('Policy split:     ', `${SWAP_BPS / 100}% Swap · ${LP_BPS / 100}% LP per pool`);
  console.log();

  const dist = new hre.ethers.Contract(distAddr, DISTRIBUTOR_ABI, signer);

  // Fetch BTC live price for cirBTC pools — used to convert LP value +
  // swap notional from cirBTC into USDC equivalents so aggregation is
  // dimensionally consistent. Median of CoinGecko + Coinbase; the script
  // refuses to proceed if neither is reachable (we'd otherwise mis-weight
  // cirBTC swaps by a factor of ~80,000).
  const btcUsd = await fetchBtcUsdMedian();
  console.log(`BTC reference:    $${btcUsd.toFixed(2)} (median of CoinGecko + Coinbase)`);

  // Build the pool registry. Each entry knows its on-chain contract,
  // which decimals each side carries, and the USDC reference price per
  // side. Stables get $1; cirBTC gets the live BTC price.
  const PRICE = { USDC: 1, EURC: 1, cirBTC: btcUsd };
  const poolDescriptors = [
    {
      id: 'USDC/EURC',
      address: usdcEurcPair,
      tokenA: { addr: usdcAddr, dec: 6, symbol: 'USDC', price: PRICE.USDC },
      tokenB: { addr: eurcAddr, dec: 6, symbol: 'EURC', price: PRICE.EURC },
    },
    usdcCirbtcPair ? {
      id: 'USDC/cirBTC',
      address: usdcCirbtcPair,
      tokenA: { addr: usdcAddr,   dec: 6, symbol: 'USDC',   price: PRICE.USDC },
      tokenB: { addr: cirbtcAddr, dec: 8, symbol: 'cirBTC', price: PRICE.cirBTC },
    } : null,
    eurcCirbtcPair ? {
      id: 'EURC/cirBTC',
      address: eurcCirbtcPair,
      tokenA: { addr: eurcAddr,   dec: 6, symbol: 'EURC',   price: PRICE.EURC },
      tokenB: { addr: cirbtcAddr, dec: 8, symbol: 'cirBTC', price: PRICE.cirBTC },
    } : null,
  ].filter(Boolean);

  // Hydrate each descriptor with its live contract handle + which side
  // is token0 (factory sorts by address, so we have to ask the pair).
  const pools = await Promise.all(
    poolDescriptors.map(async (d) => {
      const contract = new hre.ethers.Contract(d.address, PAIR_ABI, signer);
      const token0 = (await contract.token0()).toLowerCase();
      const aIsToken0 = token0 === d.tokenA.addr.toLowerCase();
      return { ...d, contract, aIsToken0 };
    }),
  );
  console.log(`Pools tracked:    ${pools.map((p) => p.id).join(', ')}`);
  console.log();

  // Keep `pair` referring to USDC/EURC for legacy log messages further down.
  const pair = pools[0].contract;
  const pairAddr = pools[0].address;
  void pairAddr;

  console.log('→ Settling USDC + EURC into buckets…');
  await (await dist.settle(usdcAddr)).wait();
  await (await dist.settle(eurcAddr)).wait();

  // Rollover today's accruing pot into yesterday's snapshot if due.
  // Anyone can trigger this; the contract enforces the 23h interval.
  if (bucket === 'daily') {
    for (const [token, label] of [[usdcAddr, 'USDC'], [eurcAddr, 'EURC']]) {
      if (await dist.rolloverDue(token)) {
        console.log(`→ Daily rollover due for ${label} — freezing today's bucket…`);
        const tx = await dist.rolloverDaily(token);
        await tx.wait();
        console.log(`  ✓ ${label} rolled over · ${tx.hash}`);
      }
    }
  }

  const usdcBuckets = await dist.getBuckets(usdcAddr);
  const eurcBuckets = await dist.getBuckets(eurcAddr);
  console.log();
  printBuckets('USDC', usdcBuckets);
  printBuckets('EURC', eurcBuckets);

  if (!bucket) {
    console.log('\nNo BUCKET selected. Pass BUCKET=daily|weekly|monthly|bonus to plan.');
    return;
  }

  const cadence = CADENCES[bucket];
  const bUsdc = pickBucket(usdcBuckets, bucket);
  const bEurc = pickBucket(eurcBuckets, bucket);
  if (bUsdc === 0n && bEurc === 0n) {
    console.log(`\nBucket "${bucket}" is empty — generate swap volume first.`);
    return;
  }
  console.log(
    `\n→ ${bucket.toUpperCase()} bucket: ${fmt(bUsdc)} USDC + ${fmt(bEurc)} EURC`,
  );

  // budgetDivisor stayed in case we ever go back to a sliced cadence —
  // every cadence today uses divisor=1 (full bucket drain per run).
  const divisor = BigInt(cadence.budgetDivisor || 1);
  const slotUsdc = bUsdc / divisor;
  const slotEurc = bEurc / divisor;
  if (cadence.budgetDivisor > 1) {
    console.log(
      `  Slot (1/${cadence.budgetDivisor} of bucket): ${fmt(slotUsdc)} USDC + ${fmt(slotEurc)} EURC`,
    );
  }

  // 60 / 40 budget split on the slot.
  const swapUsdc = (slotUsdc * BigInt(SWAP_BPS)) / 10000n;
  const lpTotalUsdc = slotUsdc - swapUsdc;
  const swapEurc = (slotEurc * BigInt(SWAP_BPS)) / 10000n;
  const lpTotalEurc = slotEurc - swapEurc;

  // Inside the LP bucket: split into pro-rata + lottery (50/50).
  const lpProRataUsdc = (lpTotalUsdc * BigInt(LP_PRORATA_BPS)) / 10000n;
  const lpLotteryUsdc = lpTotalUsdc - lpProRataUsdc;
  const lpProRataEurc = (lpTotalEurc * BigInt(LP_PRORATA_BPS)) / 10000n;
  const lpLotteryEurc = lpTotalEurc - lpProRataEurc;

  console.log(`  Swap budget       (60%): ${fmt(swapUsdc)} USDC + ${fmt(swapEurc)} EURC`);
  console.log(`  LP pro-rata budget (20%): ${fmt(lpProRataUsdc)} USDC + ${fmt(lpProRataEurc)} EURC`);
  console.log(`  LP lottery budget  (20%): ${fmt(lpLotteryUsdc)} USDC + ${fmt(lpLotteryEurc)} EURC`);

  const latest = BigInt(await hre.ethers.provider.getBlockNumber());
  const latestBlock = await hre.ethers.provider.getBlock(Number(latest));
  const seed = `${latestBlock.hash}:${bucket}`;
  const rng = mulberry32(seedToInt(seed));
  console.log(`\n  Random seed: ${seed.slice(0, 18)}…${seed.slice(-8)} (mulberry32)`);

  // 1. Swap-side selection — aggregate USDC notional across ALL pools.
  console.log(`\n→ Aggregating swap volume across ${pools.length} pool(s) (window ≈ ${windowLabel(cadence.windowBlocks)})…`);
  const swapCandidates = await aggregateSwapVolume(pools, latest, cadence);
  const swapQualified = swapCandidates.filter((c) => c.volume >= cadence.swapGate);
  console.log(`  ${swapCandidates.length} total swappers · ${swapQualified.length} qualified (≥ $${cadence.swapGate})`);

  // 2. LP-side selection — sum USDC value of LP positions across ALL pools.
  console.log(`→ Enumerating LP holders across ${pools.length} pool(s)…`);
  const lpCandidates = await currentLpUsdcValues(pools, latest, {
    factoryAddr,
    routerAddr,
    distAddr,
    requireHold: cadence.lpRequireHold,
  });
  const lpQualified = lpCandidates.filter((c) => c.usdcValue >= DAILY_MIN_USDC);
  console.log(`  ${lpCandidates.length} total LP wallets · ${lpQualified.length} qualified (LP ≥ $${DAILY_MIN_USDC}, held ${LP_MIN_HOLD_SECONDS / 3600}h+)`);

  // 3. Pick lottery winners (Swap + LP).
  const swapWinners =
    cadence.mode === 'equal'
      ? pickEqual(swapQualified, cadence.winners, rng)
      : pickWeighted(swapQualified, (c) => c.volume, cadence.winners, rng);
  const lpLotteryWinners =
    cadence.mode === 'equal'
      ? pickEqual(lpQualified, cadence.winners, rng)
      : pickWeighted(
          lpQualified,
          // Weekly + monthly only: weight by LP USDC value × tier × lock
          // multiplier. Daily LP stays equal-odds (handled in pickEqual
          // branch above) so retail with a tiny LP keeps a fair shot.
          (c) =>
            c.usdcValue * TIER(c.usdcValue) * LOCK_MULTIPLIER(c.holdingDays),
          cadence.winners,
          rng,
        );

  // 4. Compute amounts.
  const swapU = computeAmounts(swapUsdc, swapWinners.length, cadence);
  const swapE = computeAmounts(swapEurc, swapWinners.length, cadence);

  // LP lottery uses the same cadence prize-tier logic as before.
  const lpLotteryU = computeAmounts(lpLotteryUsdc, lpLotteryWinners.length, cadence);
  const lpLotteryE = computeAmounts(lpLotteryEurc, lpLotteryWinners.length, cadence);

  // LP pro-rata: every qualified LP gets `lp_share × budget` for both
  // tokens. No tier multiplier — flat % of pool, classic AMM-style yield.
  const lpProRataU = computeProRataLpAmounts(lpProRataUsdc, lpQualified);
  const lpProRataE = computeProRataLpAmounts(lpProRataEurc, lpQualified);

  // 5. Print plan.
  printSwapPlan(swapWinners, swapU, swapE, cadence);
  printLpProRataPlan(lpQualified, lpProRataU, lpProRataE);
  printLpLotteryPlan(lpLotteryWinners, lpLotteryU, lpLotteryE, cadence);

  // 6. Combine + dedupe across all three paths.
  const winnersAll = [
    ...swapWinners.map((w) => w.addr),
    ...lpQualified.map((w) => w.addr),
    ...lpLotteryWinners.map((w) => w.addr),
  ];
  const usdcAll = [...swapU, ...lpProRataU, ...lpLotteryU];
  const eurcAll = [...swapE, ...lpProRataE, ...lpLotteryE];
  const { winners, usdc, eurc } = dedupe(winnersAll, usdcAll, eurcAll);
  console.log(`\nCombined plan: ${winners.length} unique recipients (post-dedupe)`);

  if (!execute) {
    console.log('\n(DRY RUN — pass EXECUTE=1 to call distributor on chain.)');
    return;
  }

  if (winners.length === 0) {
    console.log('\nNothing to send (no qualified winners).');
    return;
  }

  console.log(`\n→ Submitting ${cadence.distFn} …`);
  if (sumBigInt(usdc) > 0n) {
    const tx = await dist[cadence.distFn](usdcAddr, winners, usdc);
    const rcpt = await tx.wait();
    console.log(`  ✓ USDC · ${rcpt.hash}`);
  }
  if (sumBigInt(eurc) > 0n) {
    const tx = await dist[cadence.distFn](eurcAddr, winners, eurc);
    const rcpt = await tx.wait();
    console.log(`  ✓ EURC · ${rcpt.hash}`);
  }
  console.log('\n✓ Done.');
}

// ─────────────────────────────────────────────────────────────
// Data aggregation
// ─────────────────────────────────────────────────────────────

/**
 * Aggregate swap volume across one or many LiftupPair contracts.
 *
 * Returns an array of `{ addr, volume }` rows where `volume` is the
 * total USDC-equivalent the wallet has spent OR received across every
 * pool inside the cadence window. We use the INPUT side of each swap
 * (whichever amountN_In > 0) and convert with the relevant token's
 * USDC reference price — USDC/EURC = $1 (close to peg), cirBTC = live
 * BTC/USD. A swap of 0.0001 cirBTC therefore counts as ~$7-8 of
 * volume, not 0.0001.
 *
 * `pools` is the registry built in main() — each entry knows its
 * decimals + reference price per side.
 */
async function aggregateSwapVolume(pools, latest, cadence) {
  const windowFloor =
    latest > cadence.windowBlocks ? latest - cadence.windowBlocks : 0n;
  const tally = new Map();

  for (const pool of pools) {
    let toBlock = latest;
    let chunks = 0;
    while (toBlock >= windowFloor && chunks < 200) {
      const fromBlock =
        toBlock > CHUNK_BLOCKS ? toBlock - CHUNK_BLOCKS + 1n : 0n;
      const effFrom = fromBlock > windowFloor ? fromBlock : windowFloor;
      try {
        const evs = await pool.contract.queryFilter(
          pool.contract.filters.Swap(),
          effFrom,
          toBlock,
        );
        for (const e of evs) {
          const a = e.args;
          // Pick the side that has non-zero amountIn (the token being
          // spent by the trader). If for some reason both are non-zero
          // we use the larger one — never matters in practice.
          let rawIn;
          let sideToken;
          const a0In = a.amount0In ?? 0n;
          const a1In = a.amount1In ?? 0n;
          if (a0In > 0n) {
            rawIn = a0In;
            sideToken = pool.aIsToken0 ? pool.tokenA : pool.tokenB;
          } else if (a1In > 0n) {
            rawIn = a1In;
            sideToken = pool.aIsToken0 ? pool.tokenB : pool.tokenA;
          } else {
            continue;
          }
          const inHuman = parseFloat(hre.ethers.formatUnits(rawIn, sideToken.dec));
          const usdEquiv = inHuman * sideToken.price;
          const key = a.to.toLowerCase();
          tally.set(key, (tally.get(key) || 0) + usdEquiv);
        }
      } catch {
        /* skip */
      }
      if (effFrom === 0n || effFrom <= windowFloor) break;
      toBlock = effFrom - 1n;
      chunks++;
    }
  }

  return [...tally.entries()]
    .map(([addr, volume]) => ({ addr, volume }))
    .sort((a, b) => b.volume - a.volume);
}

/**
 * Sum every wallet's LP position value across all registered pools.
 *
 * Per pool we compute pool TVL in USD (= reserve0 × price0 + reserve1 ×
 * price1), then attribute `tvl × lp_balance / total_supply` to each LP
 * holder. The result is a flat list of `{ addr, lp, usdcValue,
 * holdingDays }` rows where the lp / holdingDays fields are aggregated
 * across pools:
 *
 *   lp           = sum of LP token balances across all pools (cosmetic;
 *                  the lottery weight uses usdcValue, not raw LP units)
 *   usdcValue    = sum of per-pool usdcValue contributions
 *   holdingDays  = LONGEST hold across any pool — a wallet that minted
 *                  on USDC/EURC 90 days ago counts as 90 days, even if
 *                  they just opened a cirBTC LP today.
 *
 * `requireHold` enforces a 24h gate against the wallet's longest hold:
 * a brand-new LP across all pools is filtered out, but a wallet that has
 * held LP somewhere for ≥ 24h is qualified.
 */
async function currentLpUsdcValues(pools, latest, opts) {
  // Per-wallet aggregate state.
  const acc = new Map(); // addr → { lp: bigint, usdcValue: number, firstMint: bigint|null }

  const minBlocks = Number(LP_MIN_HOLD_SECONDS / ARC_AVG_BLOCK_SECONDS);
  const oldEnough = (firstMint) =>
    firstMint && Number(latest) - Number(firstMint) >= minBlocks;

  for (const pool of pools) {
    // 1. Walk LP-token Transfer events for this pool to enumerate
    //    candidate addresses + earliest first-mint per recipient.
    const candidates = new Set();
    const firstSeen = new Map();
    let toBlock = latest;
    let chunks = 0;
    while (toBlock > 0n && chunks < 50) {
      const fromBlock =
        toBlock > CHUNK_BLOCKS ? toBlock - CHUNK_BLOCKS + 1n : 0n;
      try {
        const evs = await pool.contract.queryFilter(
          pool.contract.filters.Transfer(),
          fromBlock,
          toBlock,
        );
        for (const e of evs) {
          const f = e.args.from.toLowerCase();
          const t = e.args.to.toLowerCase();
          candidates.add(f);
          candidates.add(t);
          if (f === ZERO && !firstSeen.has(t)) {
            firstSeen.set(t, e.blockNumber);
          }
        }
      } catch {
        /* skip */
      }
      if (fromBlock === 0n) break;
      toBlock = fromBlock - 1n;
      chunks++;
    }

    const pairAddr = (await pool.contract.getAddress()).toLowerCase();
    const infra = new Set([
      ZERO, DEAD,
      opts.factoryAddr.toLowerCase(),
      opts.routerAddr.toLowerCase(),
      pairAddr,
      opts.distAddr.toLowerCase(),
    ]);

    // 2. Pool TVL in USD using per-side reference prices.
    const [r0, r1] = await pool.contract.getReserves();
    const reserveA = pool.aIsToken0 ? r0 : r1;
    const reserveB = pool.aIsToken0 ? r1 : r0;
    const reserveAFloat = parseFloat(hre.ethers.formatUnits(reserveA, pool.tokenA.dec));
    const reserveBFloat = parseFloat(hre.ethers.formatUnits(reserveB, pool.tokenB.dec));
    const tvlUsd =
      reserveAFloat * pool.tokenA.price + reserveBFloat * pool.tokenB.price;
    const totalSupply = await pool.contract.totalSupply();
    const totalSupplyFloat = parseFloat(
      hre.ethers.formatUnits(totalSupply, TOKEN_DECIMALS), // LP token is always 6-dp
    );

    // 3. For each candidate, fold its contribution into the cross-pool
    //    accumulator. Skip infra addresses, zero balances, and (when
    //    requireHold is on) wallets that haven't held LP on ANY pool
    //    long enough.
    for (const addr of candidates) {
      if (infra.has(addr)) continue;
      const lp = await pool.contract.balanceOf(addr);
      if (lp === 0n) continue;
      const lpFloat = parseFloat(hre.ethers.formatUnits(lp, TOKEN_DECIMALS));
      const usdcValue =
        totalSupplyFloat > 0 ? (tvlUsd * lpFloat) / totalSupplyFloat : 0;
      const firstBlock = firstSeen.get(addr) ?? null;

      const prev = acc.get(addr);
      if (prev) {
        prev.lp += lp;
        prev.usdcValue += usdcValue;
        // Keep the EARLIEST first-mint block — longer history = bigger
        // lock multiplier on weekly/monthly.
        if (firstBlock !== null) {
          if (prev.firstMint === null || BigInt(firstBlock) < prev.firstMint) {
            prev.firstMint = BigInt(firstBlock);
          }
        }
      } else {
        acc.set(addr, {
          lp,
          usdcValue,
          firstMint: firstBlock !== null ? BigInt(firstBlock) : null,
        });
      }
    }
  }

  // 4. Materialise the per-wallet rows. Apply the hold gate against the
  //    earliest first-mint across pools.
  const rows = [];
  for (const [addr, info] of acc) {
    const firstBlock = info.firstMint;
    if (opts.requireHold && !oldEnough(firstBlock)) continue;
    const lp = info.lp;
    const usdcValue = info.usdcValue;

    // Holding duration since first mint, in days. Used downstream by the
    // lock multiplier — see LOCK_MULTIPLIER constants near the top of
    // the file. If we never saw a mint for this wallet (only Transfer
    // ownership), default to 0 so the multiplier is 1.0×.
    const holdingDays = firstBlock
      ? (Number(latest - BigInt(firstBlock)) * ARC_AVG_BLOCK_SECONDS) / 86400
      : 0;

    rows.push({ addr, lp, usdcValue, holdingDays });
  }
  return rows.sort((a, b) => b.usdcValue - a.usdcValue);
}

// ─────────────────────────────────────────────────────────────
// Winner selection (equal + weighted random, no replacement)
// ─────────────────────────────────────────────────────────────

function pickEqual(items, n, rng) {
  if (items.length === 0 || n === 0) return [];
  const pool = [...items];
  const out = [];
  while (out.length < n && pool.length > 0) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool[i]);
    pool.splice(i, 1);
  }
  return out;
}

function pickWeighted(items, weightFn, n, rng) {
  if (items.length === 0 || n === 0) return [];
  const pool = items.map((c) => ({ ...c, _w: Math.max(weightFn(c), 0) }));
  const out = [];
  while (out.length < n && pool.length > 0) {
    const totalW = pool.reduce((s, c) => s + c._w, 0);
    if (totalW <= 0) break;
    let r = rng() * totalW;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= pool[idx]._w;
      if (r <= 0) break;
    }
    if (idx >= pool.length) idx = pool.length - 1;
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

function computeAmounts(budget, n, cadence) {
  if (n === 0 || budget === 0n) return [];
  if (cadence.mode === 'equal') {
    const per = budget / BigInt(n);
    const out = new Array(n).fill(per);
    out[0] += budget - per * BigInt(n);
    return out;
  }
  const out = [];
  let assigned = 0n;
  for (let i = 0; i < n; i++) {
    const w = BigInt(cadence.weights[i] ?? 0);
    const amt = (budget * w) / 10000n;
    out.push(amt);
    assigned += amt;
  }
  if (out.length > 0) out[0] += budget - assigned; // dust → 1st place
  return out;
}

/**
 * Flat pro-rata distribution by LP share — every qualified holder gets
 * `(their_lp / total_lp) × budget`. No tier multiplier (that's for the
 * lottery half only). Rounding dust falls onto the top holder.
 */
function computeProRataLpAmounts(budget, holders) {
  if (holders.length === 0 || budget === 0n) {
    return new Array(holders.length).fill(0n);
  }
  const totalLp = holders.reduce((acc, h) => acc + h.lp, 0n);
  if (totalLp === 0n) return new Array(holders.length).fill(0n);
  const out = holders.map((h) => (budget * h.lp) / totalLp);
  const assigned = sumBigInt(out);
  if (out.length > 0) out[0] += budget - assigned;
  return out;
}

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

function pickBucket(b, name) {
  // getBuckets returns:
  //   [0] growth
  //   [1] dailyToday      (accruing — not distributable yet)
  //   [2] dailyYesterday  (frozen snapshot — what distributeDaily pays out)
  //   [3] weekly
  //   [4] monthly
  //   [5] bonus
  //   [6] unsettled
  const idx = { daily: 2, weekly: 3, monthly: 4, bonus: 5 }[name];
  return b[idx];
}

function sumBigInt(arr) {
  return arr.reduce((a, b) => a + b, 0n);
}

function fmt(v) {
  return hre.ethers.formatUnits(v, TOKEN_DECIMALS);
}

function windowLabel(blocks) {
  const secs = Number(blocks) * ARC_AVG_BLOCK_SECONDS;
  if (secs >= 86400) return `${Math.round(secs / 86400)}d`;
  if (secs >= 3600) return `${Math.round(secs / 3600)}h`;
  return `${Math.round(secs / 60)}m`;
}

function seedToInt(s) {
  const h = crypto.createHash('sha256').update(s).digest();
  return h.readUInt32BE(0);
}

// Deterministic PRNG so anyone can reproduce winners from the seed.
function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dedupe(winners, usdc, eurc) {
  const map = new Map();
  for (let i = 0; i < winners.length; i++) {
    const k = winners[i].toLowerCase();
    if (map.has(k)) {
      const e = map.get(k);
      e.usdc += usdc[i];
      e.eurc += eurc[i];
    } else {
      map.set(k, { addr: winners[i], usdc: usdc[i], eurc: eurc[i] });
    }
  }
  return {
    winners: [...map.values()].map((e) => e.addr),
    usdc: [...map.values()].map((e) => e.usdc),
    eurc: [...map.values()].map((e) => e.eurc),
  };
}

function printBuckets(symbol, b) {
  console.log(`Buckets · ${symbol}`);
  console.log(`  growth:           ${fmt(b[0])}`);
  console.log(`  dailyToday:       ${fmt(b[1])}    (accruing, NOT yet distributable)`);
  console.log(`  dailyYesterday:   ${fmt(b[2])}    (frozen snapshot, drained at 10:00 UTC)`);
  console.log(`  weekly:           ${fmt(b[3])}`);
  console.log(`  monthly:          ${fmt(b[4])}`);
  console.log(`  bonus:            ${fmt(b[5])}`);
  console.log(`  unsettled:        ${fmt(b[6])}`);
}

function printSwapPlan(winners, usdc, eurc, cadence) {
  console.log(`\nSwap winners (60% bucket · ${cadence.mode === 'equal' ? 'equal odds' : 'volume-weighted'}):`);
  if (winners.length === 0) {
    console.log('  (no qualified swappers)');
    return;
  }
  console.log(' #  | Address                                    | Volume (USDC) | USDC          | EURC');
  console.log('----+--------------------------------------------+---------------+---------------+------');
  winners.forEach((w, i) => {
    console.log(
      ` ${String(i + 1).padStart(2)} | ${w.addr} | ${w.volume.toFixed(2).padStart(13)} | ` +
        `${fmt(usdc[i]).padStart(13)} | ${fmt(eurc[i])}`,
    );
  });
}

function printLpProRataPlan(holders, usdc, eurc) {
  console.log(`\nLP pro-rata (20% bucket · steady yield by % of pool):`);
  if (holders.length === 0) {
    console.log('  (no qualified LP holders)');
    return;
  }
  console.log(' #  | Address                                    | LP value | Pool %  | USDC          | EURC');
  console.log('----+--------------------------------------------+----------+---------+---------------+------');
  const totalLp = holders.reduce((acc, h) => acc + h.lp, 0n);
  holders.forEach((h, i) => {
    const sharePct =
      totalLp > 0n ? Number((h.lp * 10000n) / totalLp) / 100 : 0;
    console.log(
      ` ${String(i + 1).padStart(2)} | ${h.addr} | $${h.usdcValue.toFixed(2).padStart(7)} | ${sharePct.toFixed(2).padStart(5)}% | ` +
        `${fmt(usdc[i]).padStart(13)} | ${fmt(eurc[i])}`,
    );
  });
}

function printLpLotteryPlan(winners, usdc, eurc, cadence) {
  console.log(`\nLP lottery (20% bucket · ${cadence.mode === 'equal' ? 'equal odds' : 'tier × lock weighted'}):`);
  if (winners.length === 0) {
    console.log('  (no qualified LP holders for lottery)');
    return;
  }
  console.log(' #  | Address                                    | LP value | Tier | Hold(d) | Lock  | Effective | USDC          | EURC');
  console.log('----+--------------------------------------------+----------+------+---------+-------+-----------+---------------+------');
  winners.forEach((w, i) => {
    const tier = TIER(w.usdcValue);
    const lock = LOCK_MULTIPLIER(w.holdingDays);
    const effective = tier * lock;
    console.log(
      ` ${String(i + 1).padStart(2)} | ${w.addr} | $${w.usdcValue.toFixed(2).padStart(7)} | ${tier.toFixed(2)}× | ${w.holdingDays.toFixed(1).padStart(7)} | ${lock.toFixed(2)}× | ${effective.toFixed(3)}× | ` +
        `${fmt(usdc[i]).padStart(13)} | ${fmt(eurc[i])}`,
    );
  });
  console.log('\n  Lock tiers: <30d=1.00× · 30d=1.10× · 90d=1.25× · 180d=1.50×');
  console.log('  Holding counted from first LP mint event (passive lock — no explicit lock action).');
}

// ─────────────────────────────────────────────────────────────
// Live BTC price — needed to convert cirBTC swap volume + LP
// values into USDC-equivalent so cross-pool aggregation makes
// sense. Median of CoinGecko + Coinbase; throws if neither
// responds rather than picking a fake value.
// ─────────────────────────────────────────────────────────────
async function fetchBtcUsdMedian() {
  const sources = [];
  try {
    const r = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
      { signal: AbortSignal.timeout(8000) },
    );
    if (r.ok) {
      const j = await r.json();
      const v = j?.bitcoin?.usd;
      if (typeof v === 'number' && v > 0) sources.push(v);
    }
  } catch {
    /* try next */
  }
  try {
    const r = await fetch(
      'https://api.coinbase.com/v2/exchange-rates?currency=BTC',
      { signal: AbortSignal.timeout(8000) },
    );
    if (r.ok) {
      const j = await r.json();
      const v = parseFloat(j?.data?.rates?.USD ?? '0');
      if (Number.isFinite(v) && v > 0) sources.push(v);
    }
  } catch {
    /* skip */
  }
  if (sources.length === 0) {
    throw new Error(
      'Could not fetch BTC/USD from any source — refusing to run with a fake price',
    );
  }
  // Sanity band — anything outside [$10k, $1M] is almost certainly a glitch.
  const med = sources.reduce((s, x) => s + x, 0) / sources.length;
  if (med < 10_000 || med > 1_000_000) {
    throw new Error(`BTC/USD median ${med} outside plausible band — refusing to run`);
  }
  return med;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
