// Lift Engine v1.1 reward executor — accrual-based distribution.
//
//   MODE=settle           pnpm reward:distribute      # settle any inflow into buckets
//   MODE=trader-instant   EXECUTE=1 pnpm reward:distribute   # ~every 10 min via GH Actions
//   MODE=trader-weekly    EXECUTE=1 pnpm reward:distribute   # Mon 10:00 UTC
//   MODE=trader-monthly   EXECUTE=1 pnpm reward:distribute   # 1st of month 10:00 UTC
//   MODE=lp-daily         EXECUTE=1 pnpm reward:distribute   # 10:00 UTC daily
//   MODE=lp-weekly        EXECUTE=1 pnpm reward:distribute   # Mon 10:00 UTC
//   MODE=lp-monthly       EXECUTE=1 pnpm reward:distribute   # 1st of month 10:00 UTC
//   MODE=status                                              # read-only buckets view
//
// Spec: docs/lift-engine-spec.md §4
//
// Each mode debits its own sub-bucket on LiftEngine.sol (6 sub-buckets:
// 3 cadences × {LP, Trader}). Modes are independent — no order
// dependency. Dry-run by default; EXECUTE=1 to send tx.
//
// State persistence: each mode tracks its last-processed block in
// `data/lift-engine-cursor.json` (committed so reruns are idempotent).
//
// This replaces v0 lottery cron at scripts/distribute-rewards.js. The
// old script targeted LiftupRewardDistributor (random selection); v1.1
// targets LiftEngine (pro-rata accrual). DO NOT run both pointed at
// the same contract.

const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

// ── Config ──────────────────────────────────────────────────────────

const CURSOR_FILE = path.join(__dirname, '..', 'data', 'lift-engine-cursor.json');
const ARC_AVG_BLOCK_SECONDS = 2;
const CHUNK_BLOCKS = 9_500n;
const DEPLOY_FLOOR = 42_750_000n;

// Bucket weights — match LiftEngine.sol constants.
const TRADER_PATH_BPS = 6000;
const LP_PATH_BPS = 4000;
const PATH_TOTAL_BPS = 10000;

// Per-spec eligibility gates.
const TRADER_MIN_SWAP_USD = 1;
const TRADER_WEEKLY_QUALIFY_USD = 1000;
const TRADER_WEEKLY_QUALIFY_DAYS = 5;
const TRADER_MONTHLY_QUALIFY_USD = 5000;
const TRADER_MONTHLY_QUALIFY_DAYS = 20;
const LP_DAILY_MIN_USD = 100;
const LP_WEEKLY_MIN_USD = 100;
const LP_MONTHLY_MIN_USD = 100;
const LP_MONTHLY_MIN_HOLD_DAYS = 20;
const LP_TRUST_GATE_BLOCKS = 43_200n;  // 24h on Arc

// Conviction tier — LP value USD → multiplier ×10000 for bps math.
const TIER_BPS = (lpValueUsd) =>
  lpValueUsd < 100 ? 0
    : lpValueUsd <= 1000 ? 10_000   // Sprout  1.00×
      : lpValueUsd <= 5000 ? 11_500 // Climber 1.15×
        : 13_000;                    // Summit  1.30×

// Tenure multiplier — days since first LP mint → bps.
const TENURE_BPS = (days) =>
  days >= 180 ? 15_000
    : days >= 90 ? 12_500
      : days >= 30 ? 11_000
        : 10_000;

// Reward tokens. cirBTC is supported as an output asset for swaps on
// cirBTC pairs but we accrue cashback in the OTHER side (USDC or EURC)
// to keep claim flow simple — users always claim stablecoins.
const REWARD_TOKENS = ['USDC', 'EURC', 'cirBTC'];

// ── Loaders ─────────────────────────────────────────────────────────

function loadCursors() {
  if (!fs.existsSync(CURSOR_FILE)) {
    fs.mkdirSync(path.dirname(CURSOR_FILE), { recursive: true });
    fs.writeFileSync(CURSOR_FILE, '{}\n');
    return {};
  }
  return JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8'));
}

function saveCursors(c) {
  fs.writeFileSync(CURSOR_FILE, JSON.stringify(c, null, 2) + '\n');
}

function loadAddresses() {
  const p = path.join(__dirname, '..', 'public', 'arc-contracts.json');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  return {
    factory: j.LiftupFactory,
    router: j.LiftupRouter,
    liftEngine: j.LiftEngine || j.LiftupRewardDistributor,  // v0 fallback for migration test
    tokens: {
      USDC: j.USDC,
      EURC: j.EURC,
      cirBTC: j.cirBTC,
    },
    pairs: j.pairs,
  };
}

// Per-pair config. Mirrors lib/pools.ts on the frontend.
const PAIR_CONFIGS = {
  'USDC/EURC':   { dec0: 6, dec1: 6, price0: 1, price1: 1.08, sym0: 'USDC', sym1: 'EURC' },
  'USDC/cirBTC': { dec0: 6, dec1: 8, price0: 1, price1: 70000, sym0: 'USDC', sym1: 'cirBTC' },
  'EURC/cirBTC': { dec0: 6, dec1: 8, price0: 1.08, price1: 70000, sym0: 'EURC', sym1: 'cirBTC' },
};

// Token-level decimals + USD price.
const TOKEN_META = {
  USDC:   { dec: 6, price: 1 },
  EURC:   { dec: 6, price: 1.08 },
  cirBTC: { dec: 8, price: 70000 },
};

// ── Helpers ─────────────────────────────────────────────────────────

function fmt(rawAmount, decimals) {
  const s = rawAmount.toString().padStart(decimals + 1, '0');
  const i = s.slice(0, s.length - decimals);
  const f = s.slice(s.length - decimals).replace(/0+$/, '');
  return f ? `${i}.${f}` : i;
}

function toRaw(amountFloat, decimals) {
  const [intPart, fracPart = ''] = amountFloat.toFixed(decimals).split('.');
  return BigInt(intPart + fracPart.padEnd(decimals, '0').slice(0, decimals));
}

async function scanLogsChunked(provider, addresses, eventTopic, fromBlock, toBlock) {
  const logs = [];
  let cursor = toBlock;
  let attempted = 0;
  let failed = 0;
  while (cursor >= fromBlock) {
    const lower = cursor > CHUNK_BLOCKS ? cursor - CHUNK_BLOCKS + 1n : 0n;
    const effFrom = lower < fromBlock ? fromBlock : lower;
    attempted++;
    try {
      const chunk = await provider.send('eth_getLogs', [{
        fromBlock: '0x' + effFrom.toString(16),
        toBlock: '0x' + cursor.toString(16),
        address: Array.isArray(addresses) ? addresses : [addresses],
        topics: [eventTopic],
      }]);
      logs.push(...chunk);
    } catch (e) {
      failed++;
      console.warn(`[scan] chunk ${effFrom}-${cursor} failed:`, e.message);
    }
    if (effFrom === fromBlock) break;
    cursor = effFrom - 1n;
  }
  if (attempted > 0 && failed / attempted > 0.05) {
    throw new Error(`[scan] ${failed}/${attempted} chunks failed — aborting to avoid partial result`);
  }
  return logs;
}

function poolEntries(addresses) {
  return Object.entries(addresses.pairs)
    .map(([key, addr]) => ({ key, addr, cfg: PAIR_CONFIGS[key] }))
    .filter((p) => p.cfg);
}

// ────────────────────────────────────────────────────────────────────
// Mode: trader-instant — per-swap cashback
// ────────────────────────────────────────────────────────────────────

/**
 * Cashback rate for v1.1:
 *   trader instant draws from `dailyTraderBucket` (60% × 31.5% of fee)
 *   cashback_usd = swap_volume_usd × 0.05% × 60% × 31.5%
 *                = swap_volume_usd × 0.0000945
 * i.e. ~$0.0945 per $1,000 swap.
 */
const INSTANT_CASHBACK_RATE = 0.05 * 0.01 * (TRADER_PATH_BPS / PATH_TOTAL_BPS) * (3150 / 10_000);

async function modeTraderInstant(ctx) {
  const { engine, provider, addresses, latestBlock, cursors, dryRun } = ctx;
  const pools = poolEntries(addresses);
  const pairAddrs = pools.map((p) => p.addr);

  // Default: process from the last cursor (or 6h ago on first run).
  const fallback = latestBlock - BigInt(Math.floor(6 * 60 * 60 / ARC_AVG_BLOCK_SECONDS));
  const lastBlock = cursors['trader-instant']
    ? BigInt(cursors['trader-instant'])
    : (fallback < DEPLOY_FLOOR ? DEPLOY_FLOOR : fallback);

  console.log(`[trader-instant] scanning Swap events on ${pools.length} pairs`);
  console.log(`[trader-instant] blocks ${lastBlock} → ${latestBlock} (rate ${(INSTANT_CASHBACK_RATE * 100).toFixed(5)}%)`);

  const swapTopic = hre.ethers.id('Swap(address,uint256,uint256,uint256,uint256,address)');
  const iface = new hre.ethers.Interface([
    'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
  ]);
  const logs = await scanLogsChunked(provider, pairAddrs, swapTopic, lastBlock + 1n, latestBlock);

  // Tally cashback per (recipient, reward_token).
  // Reward token = stablecoin side of the swapped pair (USDC or EURC).
  // cirBTC is never used as the reward token; we always pay cashback in
  // the stablecoin half so users claim something fungible.
  const tally = { USDC: {}, EURC: {} };
  for (const log of logs) {
    const decoded = iface.decodeEventLog('Swap', log.data, log.topics);
    const pool = pools.find((p) => p.addr.toLowerCase() === log.address.toLowerCase());
    if (!pool) continue;
    const cfg = pool.cfg;

    const isToken0In = decoded.amount0In > 0n;
    const rawIn = isToken0In ? decoded.amount0In : decoded.amount1In;
    const dec = isToken0In ? cfg.dec0 : cfg.dec1;
    const price = isToken0In ? cfg.price0 : cfg.price1;
    const volUsd = Number(rawIn) / 10 ** dec * price;
    if (volUsd < TRADER_MIN_SWAP_USD) continue;

    const cashbackUsd = volUsd * INSTANT_CASHBACK_RATE;
    const rewardSym = cfg.sym0 === 'USDC' || cfg.sym1 === 'USDC' ? 'USDC' : 'EURC';
    const tokenPriceUsd = TOKEN_META[rewardSym].price;
    const cashbackInToken = cashbackUsd / tokenPriceUsd;
    const to = decoded.to.toLowerCase();
    tally[rewardSym][to] = (tally[rewardSym][to] || 0) + cashbackInToken;
  }

  for (const sym of ['USDC', 'EURC']) {
    const entries = Object.entries(tally[sym]).filter(([, amt]) => amt >= 0.000001);
    if (entries.length === 0) {
      console.log(`[trader-instant/${sym}] no accruals to submit`);
      continue;
    }
    const dec = TOKEN_META[sym].dec;
    const recipients = entries.map(([a]) => a);
    const amounts = entries.map(([, amt]) => toRaw(amt, dec).toString());
    const totalUsd = entries.reduce((s, [, a]) => s + a * TOKEN_META[sym].price, 0);

    console.log(`\n[trader-instant/${sym}] ${entries.length} recipients · total ~$${totalUsd.toFixed(4)}`);
    previewBatch(entries.map(([a, amt]) => [a, `${amt.toFixed(6)} ${sym}`]));

    if (dryRun) continue;
    const tx = await engine.accrueTraderInstant(addresses.tokens[sym], recipients, amounts);
    console.log(`  ↑ tx ${tx.hash}`);
    await tx.wait();
    console.log(`  ✓ confirmed`);
  }

  cursors['trader-instant'] = latestBlock.toString();
  saveCursors(cursors);
}

// ────────────────────────────────────────────────────────────────────
// Mode: trader-weekly / trader-monthly — qualifying trader bonus
// ────────────────────────────────────────────────────────────────────

async function modeTraderCadence(ctx, label, opts) {
  const { engine, provider, addresses, latestBlock, dryRun } = ctx;
  const { qualifyUsd, qualifyDays, windowSeconds, bucketFn, accrueFn } = opts;

  const pools = poolEntries(addresses);
  const pairAddrs = pools.map((p) => p.addr);
  const windowBlocks = BigInt(Math.floor(windowSeconds / ARC_AVG_BLOCK_SECONDS));
  const from = latestBlock > windowBlocks ? latestBlock - windowBlocks : 0n;
  const fromClamped = from < DEPLOY_FLOOR ? DEPLOY_FLOOR : from;
  console.log(`[${label}] window ${fromClamped} → ${latestBlock} (${windowSeconds / 86400}d), qualify ≥$${qualifyUsd} OR ${qualifyDays}d active`);

  const swapTopic = hre.ethers.id('Swap(address,uint256,uint256,uint256,uint256,address)');
  const iface = new hre.ethers.Interface([
    'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
  ]);
  const logs = await scanLogsChunked(provider, pairAddrs, swapTopic, fromClamped, latestBlock);

  // Per trader: USD volume + set of distinct active-day buckets.
  const stats = new Map();
  for (const log of logs) {
    const decoded = iface.decodeEventLog('Swap', log.data, log.topics);
    const pool = pools.find((p) => p.addr.toLowerCase() === log.address.toLowerCase());
    if (!pool) continue;
    const cfg = pool.cfg;
    const isToken0In = decoded.amount0In > 0n;
    const rawIn = isToken0In ? decoded.amount0In : decoded.amount1In;
    const dec = isToken0In ? cfg.dec0 : cfg.dec1;
    const price = isToken0In ? cfg.price0 : cfg.price1;
    const volUsd = Number(rawIn) / 10 ** dec * price;
    if (volUsd <= 0) continue;
    const key = decoded.to.toLowerCase();
    const prev = stats.get(key) || { usd: 0, dayBuckets: new Set() };
    prev.usd += volUsd;
    const dayBucket = Math.floor(Number(log.blockNumber) * ARC_AVG_BLOCK_SECONDS / 86400);
    prev.dayBuckets.add(dayBucket);
    stats.set(key, prev);
  }

  const qualifying = [];
  for (const [trader, st] of stats.entries()) {
    if (st.usd >= qualifyUsd || st.dayBuckets.size >= qualifyDays) {
      qualifying.push({ trader, weight: st.usd });
    }
  }
  console.log(`[${label}] ${qualifying.length} qualifying traders (out of ${stats.size} total)`);
  if (qualifying.length === 0) {
    console.log(`[${label}] no qualifiers — bucket rolls forward to next ${label} cycle`);
    return;
  }

  const totalWeight = qualifying.reduce((s, q) => s + q.weight, 0);

  for (const sym of ['USDC', 'EURC']) {
    const tokenAddr = addresses.tokens[sym];
    const bucketBal = BigInt(await bucketFn(tokenAddr));
    if (bucketBal === 0n) {
      console.log(`[${label}/${sym}] bucket empty`);
      continue;
    }
    const dec = TOKEN_META[sym].dec;

    const recipients = [];
    const amounts = [];
    for (const q of qualifying) {
      const frac = q.weight / totalWeight;
      const raw = BigInt(Math.floor(Number(bucketBal) * frac));
      if (raw === 0n) continue;
      recipients.push(q.trader);
      amounts.push(raw.toString());
    }
    const total = amounts.reduce((s, a) => s + BigInt(a), 0n);
    console.log(`\n[${label}/${sym}] ${recipients.length} recipients · bucket ${fmt(bucketBal, dec)} ${sym} · distributing ${fmt(total, dec)}`);
    previewBatch(
      recipients.map((r, i) => [r, `${fmt(BigInt(amounts[i]), dec)} ${sym}`])
    );

    if (dryRun) continue;
    const tx = await engine[accrueFn](tokenAddr, recipients, amounts);
    console.log(`  ↑ tx ${tx.hash}`);
    await tx.wait();
    console.log(`  ✓ confirmed`);
  }
}

const modeTraderWeekly = (ctx) =>
  modeTraderCadence(ctx, 'trader-weekly', {
    qualifyUsd: TRADER_WEEKLY_QUALIFY_USD,
    qualifyDays: TRADER_WEEKLY_QUALIFY_DAYS,
    windowSeconds: 7 * 86400,
    bucketFn: ctx.engine.weeklyTraderBucket.bind(ctx.engine),
    accrueFn: 'accrueTraderWeekly',
  });

const modeTraderMonthly = (ctx) =>
  modeTraderCadence(ctx, 'trader-monthly', {
    qualifyUsd: TRADER_MONTHLY_QUALIFY_USD,
    qualifyDays: TRADER_MONTHLY_QUALIFY_DAYS,
    windowSeconds: 30 * 86400,
    bucketFn: ctx.engine.monthlyTraderBucket.bind(ctx.engine),
    accrueFn: 'accrueTraderMonthly',
  });

// ────────────────────────────────────────────────────────────────────
// Mode: lp-daily / lp-weekly / lp-monthly
// ────────────────────────────────────────────────────────────────────

async function modeLpCadence(ctx, label, opts) {
  const { engine, provider, addresses, latestBlock, dryRun } = ctx;
  const { minUsd, minHoldDays, poolWeightMode, useTierTenure, useLaunchBoost,
    bucketFn, accrueFn } = opts;

  const pairAbi = [
    'function getReserves() view returns (uint112,uint112,uint32)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
  ];

  const pools = poolEntries(addresses);

  // 1. Read each pool's state — reserves, totalSupply, TVL USD.
  const poolStates = [];
  for (const p of pools) {
    const pair = new hre.ethers.Contract(p.addr, pairAbi, provider);
    const [r0, r1] = await pair.getReserves();
    const totalSupply = await pair.totalSupply();
    if (totalSupply === 0n) continue;
    const r0Usd = Number(r0) / 10 ** p.cfg.dec0 * p.cfg.price0;
    const r1Usd = Number(r1) / 10 ** p.cfg.dec1 * p.cfg.price1;
    const tvlUsd = r0Usd + r1Usd;
    poolStates.push({ ...p, pair, r0, r1, totalSupply, tvlUsd, volumeUsd: 0 });
  }

  // 2. For lp-weekly: per-pool 7d swap volume → pool weight.
  if (poolWeightMode === 'volume7d') {
    const swapTopic = hre.ethers.id('Swap(address,uint256,uint256,uint256,uint256,address)');
    const iface = new hre.ethers.Interface([
      'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
    ]);
    const sevenDayBlocks = BigInt(7 * 86400 / ARC_AVG_BLOCK_SECONDS);
    const from = latestBlock > sevenDayBlocks ? latestBlock - sevenDayBlocks : 0n;
    const fromClamped = from < DEPLOY_FLOOR ? DEPLOY_FLOOR : from;
    for (const ps of poolStates) {
      const logs = await scanLogsChunked(provider, ps.addr, swapTopic, fromClamped, latestBlock);
      let vol = 0;
      for (const log of logs) {
        const d = iface.decodeEventLog('Swap', log.data, log.topics);
        const isToken0In = d.amount0In > 0n;
        const rawIn = isToken0In ? d.amount0In : d.amount1In;
        const dec = isToken0In ? ps.cfg.dec0 : ps.cfg.dec1;
        const price = isToken0In ? ps.cfg.price0 : ps.cfg.price1;
        vol += Number(rawIn) / 10 ** dec * price;
      }
      ps.volumeUsd = vol;
      console.log(`[${label}/${ps.key}] 7d volume: $${vol.toFixed(2)}`);
    }
  }

  // 3. Enumerate LP holders per pool. Track first-mint block per (lp, pair).
  const transferTopic = hre.ethers.id('Transfer(address,address,uint256)');
  const INFRA = new Set([
    '0x0000000000000000000000000000000000000000',
    '0x000000000000000000000000000000000000dead',
    addresses.factory.toLowerCase(),
    addresses.router.toLowerCase(),
    addresses.liftEngine.toLowerCase(),
    ...pools.map((p) => p.addr.toLowerCase()),
  ]);
  const firstMintBlock = new Map();   // `${lp}:${pairLc}` → bigint
  const candidates = new Set();
  for (const ps of poolStates) {
    const logs = await scanLogsChunked(provider, ps.addr, transferTopic, DEPLOY_FLOOR, latestBlock);
    for (const log of logs) {
      const from = '0x' + log.topics[1].slice(26).toLowerCase();
      const to = '0x' + log.topics[2].slice(26).toLowerCase();
      candidates.add(from);
      candidates.add(to);
      if (from === '0x0000000000000000000000000000000000000000' && !INFRA.has(to)) {
        const key = `${to}:${ps.addr.toLowerCase()}`;
        const bn = BigInt(log.blockNumber);
        if (!firstMintBlock.has(key) || bn < firstMintBlock.get(key)) {
          firstMintBlock.set(key, bn);
        }
      }
    }
  }
  const eligible = [...candidates].filter((a) => !INFRA.has(a));

  // 4. For lp-monthly: read each pair's launch boost (if finalized).
  const launchByPair = new Map();
  if (useLaunchBoost) {
    for (const ps of poolStates) {
      const lb = await engine.launchBoosts(ps.addr);
      if (lb.finalized) {
        launchByPair.set(ps.addr.toLowerCase(), {
          startBlock: BigInt(lb.startBlock),
          endBlock: BigInt(lb.endBlock),
          vestBlocks: BigInt(lb.vestBlocks),
          multBps: Number(lb.multiplierBps),
        });
      }
    }
  }

  // 5. Compute per-LP weight + per-pool share of bucket.
  // Pool weight: TVL for daily/monthly; 7d volume for weekly.
  const totalPoolWeight = poolStates.reduce((s, ps) => s + (poolWeightMode === 'volume7d' ? ps.volumeUsd : ps.tvlUsd), 0);
  if (totalPoolWeight === 0) {
    console.log(`[${label}] no pool weight — nothing to accrue`);
    return;
  }

  // Per-pool: per-recipient weighted shares (relative within pool).
  const perPool = [];
  for (const ps of poolStates) {
    const poolW = poolWeightMode === 'volume7d' ? ps.volumeUsd : ps.tvlUsd;
    if (poolW === 0) continue;

    const entries = [];
    for (const addr of eligible) {
      const lp = await ps.pair.balanceOf(addr);
      if (lp === 0n) continue;
      const sharePct = Number(lp * 1_000_000n / ps.totalSupply) / 10_000;  // 0..100
      const lpValueUsd = ps.tvlUsd * sharePct / 100;
      if (lpValueUsd < minUsd) continue;

      // Trust gate: ≥24h held (unless monthly which uses tenure gate)
      const key = `${addr}:${ps.addr.toLowerCase()}`;
      const fmb = firstMintBlock.get(key) || latestBlock;
      const heldBlocks = latestBlock - fmb;
      if (heldBlocks < LP_TRUST_GATE_BLOCKS) continue;

      const heldDays = Number(heldBlocks) * ARC_AVG_BLOCK_SECONDS / 86400;
      if (minHoldDays > 0 && heldDays < minHoldDays) continue;

      let weight = sharePct;
      if (useTierTenure) {
        const tierBps = TIER_BPS(lpValueUsd);
        if (tierBps === 0) continue;
        const tenureBps = TENURE_BPS(heldDays);
        let launchBps = 10_000;
        const lb = launchByPair.get(ps.addr.toLowerCase());
        if (lb) {
          const inWindow = fmb >= lb.startBlock && fmb <= lb.endBlock;
          const vested = heldBlocks >= lb.vestBlocks;
          if (inWindow && vested) launchBps = lb.multBps;
        }
        // weight = base × tier × tenure × launch (each in bps)
        weight = sharePct * (tierBps / 10_000) * (tenureBps / 10_000) * (launchBps / 10_000);
      }
      entries.push({ addr, weight });
    }
    if (entries.length === 0) continue;
    const totalEntryWeight = entries.reduce((s, e) => s + e.weight, 0);
    if (totalEntryWeight === 0) continue;
    perPool.push({ ps, entries, totalEntryWeight, poolW });
  }

  if (perPool.length === 0) {
    console.log(`[${label}] no qualifying LPs in any pool — bucket rolls forward`);
    return;
  }

  // 6. Per-token distribution. Each pool contributes to both token0 and
  //    token1 of the bucket (split by TVL ratio so LP receives in their
  //    natural asset mix).
  for (const sym of REWARD_TOKENS) {
    const tokenAddr = addresses.tokens[sym];
    const bucketBal = BigInt(await bucketFn(tokenAddr));
    if (bucketBal === 0n) {
      console.log(`[${label}/${sym}] bucket empty`);
      continue;
    }
    const dec = TOKEN_META[sym].dec;

    // For each pool: its share of bucket = poolW / totalPoolWeight.
    // For each LP in pool: share of pool's bucket = entry.weight / totalEntryWeight.
    // Accumulate per-recipient amounts.
    const perRecipient = new Map();
    for (const pp of perPool) {
      const poolBucketAmt = (pp.poolW / totalPoolWeight) * Number(bucketBal);
      for (const e of pp.entries) {
        const amt = poolBucketAmt * (e.weight / pp.totalEntryWeight);
        if (amt <= 0) continue;
        perRecipient.set(e.addr, (perRecipient.get(e.addr) || 0) + amt);
      }
    }

    const recipients = [];
    const amounts = [];
    for (const [addr, amt] of perRecipient.entries()) {
      const raw = BigInt(Math.floor(amt));
      if (raw === 0n) continue;
      recipients.push(addr);
      amounts.push(raw.toString());
    }
    if (recipients.length === 0) {
      console.log(`[${label}/${sym}] nothing above dust`);
      continue;
    }

    const total = amounts.reduce((s, a) => s + BigInt(a), 0n);
    console.log(`\n[${label}/${sym}] ${recipients.length} recipients · bucket ${fmt(bucketBal, dec)} ${sym} · distributing ${fmt(total, dec)}`);
    previewBatch(
      recipients.map((r, i) => [r, `${fmt(BigInt(amounts[i]), dec)} ${sym}`])
    );

    if (dryRun) continue;
    const tx = await engine[accrueFn](tokenAddr, recipients, amounts);
    console.log(`  ↑ tx ${tx.hash}`);
    await tx.wait();
    console.log(`  ✓ confirmed`);
  }
}

const modeLpDaily = (ctx) =>
  modeLpCadence(ctx, 'lp-daily', {
    minUsd: LP_DAILY_MIN_USD,
    minHoldDays: 0,
    poolWeightMode: 'tvl',
    useTierTenure: false,
    useLaunchBoost: false,
    bucketFn: ctx.engine.dailyLpBucket.bind(ctx.engine),
    accrueFn: 'accrueLpDaily',
  });

const modeLpWeekly = (ctx) =>
  modeLpCadence(ctx, 'lp-weekly', {
    minUsd: LP_WEEKLY_MIN_USD,
    minHoldDays: 0,
    poolWeightMode: 'volume7d',
    useTierTenure: false,
    useLaunchBoost: false,
    bucketFn: ctx.engine.weeklyLpBucket.bind(ctx.engine),
    accrueFn: 'accrueLpWeekly',
  });

const modeLpMonthly = (ctx) =>
  modeLpCadence(ctx, 'lp-monthly', {
    minUsd: LP_MONTHLY_MIN_USD,
    minHoldDays: LP_MONTHLY_MIN_HOLD_DAYS,
    poolWeightMode: 'tvl',
    useTierTenure: true,
    useLaunchBoost: true,
    bucketFn: ctx.engine.monthlyLpBucket.bind(ctx.engine),
    accrueFn: 'accrueLpMonthly',
  });

// ────────────────────────────────────────────────────────────────────
// Mode: settle / status
// ────────────────────────────────────────────────────────────────────

async function modeSettle(ctx) {
  const { engine, addresses, dryRun } = ctx;
  const tokens = REWARD_TOKENS.map((sym) => addresses.tokens[sym]);
  console.log(`[settle] settleMany(${tokens.join(', ')})`);
  if (dryRun) return;
  const tx = await engine.settleMany(tokens);
  console.log(`  ↑ tx ${tx.hash}`);
  await tx.wait();
  console.log(`  ✓ confirmed`);
}

async function modeStatus(ctx) {
  const { engine, addresses } = ctx;
  console.log(`\nLiftEngine: ${addresses.liftEngine}\n`);
  for (const sym of REWARD_TOKENS) {
    const tokAddr = addresses.tokens[sym];
    const b = await engine.getBuckets(tokAddr);
    const dec = TOKEN_META[sym].dec;
    console.log(`[${sym}]`);
    console.log(`  growth          ${fmt(b[0], dec)}`);
    console.log(`  bonus           ${fmt(b[1], dec)}`);
    console.log(`  daily   lp / tr ${fmt(b[2], dec)} / ${fmt(b[3], dec)}`);
    console.log(`  weekly  lp / tr ${fmt(b[4], dec)} / ${fmt(b[5], dec)}`);
    console.log(`  monthly lp / tr ${fmt(b[6], dec)} / ${fmt(b[7], dec)}`);
    console.log(`  pending claims  ${fmt(b[8], dec)}`);
    console.log(`  unsettled       ${fmt(b[9], dec)}`);
    console.log();
  }
}

// ── Common ──────────────────────────────────────────────────────────

function previewBatch(rows) {
  if (rows.length <= 5) {
    for (const [a, amt] of rows) console.log(`  ${a}  ${amt}`);
  } else {
    console.log('  (showing top 3)');
    for (const [a, amt] of rows.slice(0, 3)) console.log(`  ${a}  ${amt}`);
    console.log(`  ... + ${rows.length - 3} more`);
  }
}

async function main() {
  const mode = (process.env.MODE || 'status').toLowerCase();
  const dryRun = process.env.EXECUTE !== '1';

  const addresses = loadAddresses();
  if (!addresses.liftEngine) {
    throw new Error('LiftEngine address not in public/arc-contracts.json');
  }

  const [signer] = await hre.ethers.getSigners();
  const engineAbi = [
    'function settle(address) external',
    'function settleMany(address[]) external',
    'function accrueTraderInstant(address,address[],uint256[]) external',
    'function accrueTraderWeekly(address,address[],uint256[]) external',
    'function accrueTraderMonthly(address,address[],uint256[]) external',
    'function accrueLpDaily(address,address[],uint256[]) external',
    'function accrueLpWeekly(address,address[],uint256[]) external',
    'function accrueLpMonthly(address,address[],uint256[]) external',
    'function dailyLpBucket(address) view returns (uint256)',
    'function dailyTraderBucket(address) view returns (uint256)',
    'function weeklyLpBucket(address) view returns (uint256)',
    'function weeklyTraderBucket(address) view returns (uint256)',
    'function monthlyLpBucket(address) view returns (uint256)',
    'function monthlyTraderBucket(address) view returns (uint256)',
    'function launchBoosts(address) view returns (uint64,uint64,uint64,uint16,bool)',
    'function getBuckets(address) view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)',
  ];
  const engine = new hre.ethers.Contract(addresses.liftEngine, engineAbi, signer);
  const provider = signer.provider;
  const latestBlock = BigInt(await provider.getBlockNumber());
  const cursors = loadCursors();
  const ctx = { engine, provider, addresses, latestBlock, cursors, dryRun };

  console.log(`Mode: ${mode}  ${dryRun ? '(DRY RUN — set EXECUTE=1 to send)' : '(EXECUTING)'}`);
  console.log(`Engine: ${addresses.liftEngine}\n`);

  switch (mode) {
    case 'settle':           await modeSettle(ctx);          break;
    case 'status':           await modeStatus(ctx);          break;
    case 'trader-instant':   await modeTraderInstant(ctx);   break;
    case 'trader-weekly':    await modeTraderWeekly(ctx);    break;
    case 'trader-monthly':   await modeTraderMonthly(ctx);   break;
    case 'lp-daily':         await modeLpDaily(ctx);         break;
    case 'lp-weekly':        await modeLpWeekly(ctx);        break;
    case 'lp-monthly':       await modeLpMonthly(ctx);       break;
    default:
      throw new Error(`Unknown MODE=${mode}. Use: settle | status | trader-instant | trader-weekly | trader-monthly | lp-daily | lp-weekly | lp-monthly`);
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
