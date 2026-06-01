# Lift Engine — Specification

> Stablecoin liquidity & loyalty layer. Fee-redirect distribution model
> with conviction-tier + tenure weighting. Zero protocol token, zero
> random selection, zero governance bribe market.

**Version**: 1.0 (draft for v2 audit)
**Status**: Proposed (replaces `LiftupRewardDistributor` v0 lottery model)
**Last updated**: 2026-05-23

---

## 1. Overview

Lift Engine is the reward layer that sits between a stablecoin AMM
(Uniswap V2-compatible pairs) and end users. It captures 100% of swap
fees from the AMM, splits them into immutable buckets, and returns 90%
to users through two distinct accrual paths:

- **Trader cashback** — instant per-swap accrual, proportional to swap
  volume. No qualification gate, no cadence, no draw.
- **LP rewards** — periodic accrual across three cadences (daily,
  weekly, monthly), each with a different distribution logic that
  rewards a different LP behavior.

Users claim accrued rewards anytime via a single `claim()` call.
Multiple cadences and multiple tokens settle into one balance per
wallet, so a user can claim USDC + EURC + cirBTC from daily + weekly +
monthly + trader cashback in one transaction.

No recipient selection involves randomness. No bucket is paid out by
sampling. Distribution is deterministic per the formulas in §4.

---

## 2. Design goals

1. **Regulatory clarity** — every reward is a deterministic share of
   trading fees the user contributed to. No "draw", no "winner", no
   chance-based payout. Defensible as standard fee-distribution under
   the Clarity Act draft's "rewards for active participation" clause.

2. **Trader incentive parity** — every swap earns visible value
   instantly. Effective fee for a swapper after cashback ≈ 0.023%
   (vs nominal 0.05%), competitive with any DEX on Arc.

3. **LP loyalty premium** — long-term, high-conviction LPs earn
   meaningfully more than transient liquidity. Multiplier ceiling
   ~1.95× (conviction tier × tenure) before launch boost.

4. **Cadence as structure, not gimmick** — daily / weekly / monthly
   buckets each apply a *different* distribution logic, rewarding
   different behaviors:
   - Daily: passive yield by pool share
   - Weekly: activity reward (rewards pools getting actual volume)
   - Monthly: loyalty premium (tier × tenure × launch boost)

5. **Immutable splits, bounded admin** — bucket weights and core
   multipliers are `constant`. Owner can set per-pair launch boosts
   within hard caps; cannot redirect rewards, change splits, or
   pull arbitrary funds.

6. **Registry-driven** — new stablecoin + pair = add one entry to
   `LIFTUP_POOLS`; on-chain logic, off-chain executor, and frontend
   automatically pick up. No hardcoded pair lists.

---

## 3. Architecture

### 3.1 Components

```
                       SWAP (USDC ↔ EURC ↔ cirBTC ↔ …)
                                  │
                          0.05% LP fee
                                  ▼
                    ┌──────────────────────┐
                    │   LiftupPair (V2)    │
                    │   feeTo = LiftEngine │
                    └──────────┬───────────┘
                               ▼
                  ┌────────────────────────────┐
                  │       LiftEngine.sol       │
                  │   (immutable splits +      │
                  │    accrue/claim accounting)│
                  └─────┬──────────────────────┘
                        │
       ┌────────────────┼──────────────────┐
       │                │                  │
       ▼                ▼                  ▼
   10% growth     90% reward bucket    (off-chain bot)
   bucket              │
                       ├─ 60% → Trader cashback
                       │      (instant per swap)
                       │
                       └─ 40% → LP rewards (3 cadences)
                              ├─ Daily   (31.5% of total fees)
                              ├─ Weekly  (31.5% of total fees)
                              └─ Monthly (22.5% of total fees)
                              + 4.5% Bonus reserve

                       ▼
                user.claim(tokens[])
                  → wallet
```

### 3.2 Contract boundary

**Unchanged from v0**:
- `LiftupFactory` — CREATE2 pair deployment
- `LiftupRouter` — V2 swap/add/remove liquidity
- `LiftupPair` — V2 fork, `feeTo` set to new `LiftEngine` address

**New (replaces `LiftupRewardDistributor`)**:
- `LiftEngine.sol` — per-user accrual mappings + `claim()` + bounded
  launch boost storage

### 3.3 Off-chain executor

GitHub Actions cron, three independent workflows + one frequent
trader-accrual job:

| Job | Cadence | Function called |
|---|---|---|
| Trader cashback batch | every 10 min | `accrueTrader(token, recipients[], amounts[])` |
| Daily LP accrual | 10:00 UTC daily | `accrueLpDaily(token, recipients[], amounts[])` |
| Weekly LP accrual | Mon 10:00 UTC | `accrueLpWeekly(token, recipients[], amounts[])` |
| Monthly LP accrual | 1st 10:00 UTC | `accrueLpMonthly(token, recipients[], amounts[])` |

Each job is idempotent (records last-processed block per token).
Deterministic — anyone can re-derive `(recipients, amounts)` from
on-chain Swap + Transfer events using the formulas in §4.

---

## 4. Distribution formulas

### 4.1 Fee split (immutable constants)

For every dollar of fee inflow:

```
total fee = 100%
  ├─ 10.0% growth                       (single bucket)
  ├─  4.5% bonus reserve                (single bucket, dormant until activated)
  ├─ 31.5% daily reward bucket
  │       ├─ 60% Trader instant cashback (= 18.9% of total)
  │       └─ 40% LP daily pro-rata       (= 12.6% of total)
  ├─ 31.5% weekly reward bucket
  │       ├─ 60% Trader weekly bonus     (= 18.9% of total)
  │       └─ 40% LP weekly pro-rata      (= 12.6% of total)
  └─ 22.5% monthly reward bucket
          ├─ 60% Trader monthly bonus    (= 13.5% of total)
          └─ 40% LP monthly pro-rata     (=  9.0% of total)
```

| Sub-bucket | Share | Path | Cadence | Drained by |
|---|---|---|---|---|
| growth | 10.0% | (admin) | on-demand | `withdrawGrowth()` |
| bonus | 4.5% | (admin) | on-demand | `sweepBonus()` |
| daily-trader | 18.9% | Trader | Per-swap (instant) | `accrueTraderInstant()` |
| daily-lp | 12.6% | LP | Daily 10:00 UTC | `accrueLpDaily()` |
| weekly-trader | 18.9% | Trader | Mon 10:00 UTC | `accrueTraderWeekly()` |
| weekly-lp | 12.6% | LP | Mon 10:00 UTC | `accrueLpWeekly()` |
| monthly-trader | 13.5% | Trader | 1st 10:00 UTC | `accrueTraderMonthly()` |
| monthly-lp | 9.0% | LP | 1st 10:00 UTC | `accrueLpMonthly()` |
| **Total** | **100.0%** | | | |

Each cadence bucket has a 60/40 trader/LP split that lives in **two
independent sub-buckets** on chain. Trader accruals only debit the
trader sub-bucket; LP accruals only debit the LP sub-bucket. No order
dependency between trader and LP at the contract level.

### 4.2 Trader path — 3 cadences symmetric with LP

The 60% trader portion of each cadence bucket is paid out via a
distinct mechanism per cadence:

#### 4.2.1 Trader instant cashback (daily bucket trader portion)

Sourced from `dailyTraderBucket` (18.9% of total fees). Drained
per-swap (or per cron batch) regardless of trader's cumulative
activity — every swap earns visible cashback immediately.

```
cashback_usd[swapper] += swap_volume_usd × 0.05% × 60% × 31.5%
                       = swap_volume_usd × 0.00945%
                       ≈ $0.0945 per $1,000 swap
```

The bot scans Swap events every 10 minutes and calls
`accrueTraderInstant(token, recipients[], amounts[])`. Same algorithm
as v1 but now debits only `dailyTraderBucket` (not pooled).

**Eligibility**: any swap of ≥ $1 notional. No further gate.

**Anti-Sybil**: cashback is proportional to volume. Splitting volume
across N wallets pays out (vol/N × N) = same total, more gas paid.

#### 4.2.2 Trader weekly bonus (weekly bucket trader portion)

Sourced from `weeklyTraderBucket` (18.9% of total fees). Distributed
once per week (Mon 10:00 UTC) to qualifying traders, weighted by
weekly swap volume.

```
For each qualifying trader t:
  weight[t] = trader_weekly_volume_usd[t]
  bonus[t] = (weight[t] / Σ weight[qualifying_traders]) × weeklyTraderBucket
```

**Eligibility (either condition)**:
- Cumulative swap volume ≥ $1,000 in trailing 7 days, OR
- Active swap on ≥ 5 distinct days in the trailing 7 days

Non-qualifying traders → 0 from this bucket. Their would-be share is
implicitly redistributed to qualifying traders via the weight-
normalization formula (see §4.6 Rollover).

#### 4.2.3 Trader monthly bonus (monthly bucket trader portion)

Sourced from `monthlyTraderBucket` (13.5% of total fees). Distributed
once per month (1st 10:00 UTC) to qualifying traders, weighted by
monthly swap volume.

```
For each qualifying trader t:
  weight[t] = trader_monthly_volume_usd[t]
  bonus[t] = (weight[t] / Σ weight[qualifying_traders]) × monthlyTraderBucket
```

**Eligibility (either condition)**:
- Cumulative swap volume ≥ $5,000 in the calendar month, OR
- Active swap on ≥ 20 distinct days in the calendar month

Strictest gate of the three trader cadences. Filters down to most
committed traders — biggest per-recipient payout when bucket is
divided among fewer qualifiers.

**Why three trader cadences, not just instant cashback**:
- Mid/whale traders who swap consistently earn meaningful weekly +
  monthly bonuses on top of per-swap cashback → retention loop.
- Rollover concentration: occasional/single-shot traders don't dilute
  the weekly + monthly pools, so committed traders get disproportionate
  upside (mirrors LP loyalty premium on monthly).
- Symmetry with LP path strengthens the "Lift Engine = loyalty layer
  for both sides" narrative.

### 4.3 LP — Daily bucket (passive yield by pool share)

Sourced from `dailyLpBucket` (12.6% of total fees). Distributed once
per day at 10:00 UTC. Logic: pure pro-rata by each wallet's % of
pool, **no multipliers**.

**Eligibility (both required)**:
- LP value ≥ $100 USD-equivalent at snapshot block, AND
- LP held continuously ≥ 24 hours at snapshot block (trust gate)

For each pool `p` and each *qualifying* LP `lp`:

```
qualifying_supply[p] = Σ lp_balance[i, p] for i in qualifying LPs of p
pool_share_of_bucket[p] = (pool_tvl_usd[p] / Σ pool_tvl_usd) × dailyLpBucket[token]

For each qualifying LP `lp` in pool `p`:
  daily_accrual[lp] += (lp_balance[lp, p] / qualifying_supply[p]) × pool_share_of_bucket[p]
```

Then sum across pools and tokens; call `accrueLpDaily(token,
recipients[], amounts[])`. Excluded: zero, dead, factory, router,
distributor, every pair's own LP balance (self-held).

**Why this design**: daily is the "base yield" tier. Every qualifying
LP earns proportionally to capital provided — no advantage for
whales, long-term holders, or active traders. Most retail-friendly
of the three cadences. The $100 minimum is dust-protection; the 24h
trust gate is anti-Sybil (LPs added in the last 24h cannot count).

### 4.4 LP — Weekly bucket (activity-weighted)

Sourced from `weeklyLpBucket` (12.6% of total fees). Distributed once
per week (Mon 10:00 UTC). Logic: pro-rata weighted by the pool's
actual swap activity that week. Rewards LPs in pools that *got used*.

**Eligibility (both required)**:
- LP value ≥ $100 USD-equivalent at snapshot block, AND
- LP held continuously ≥ 24 hours at snapshot block

**Pool weight = trailing-7d swap volume USD**:

```
For each pool p:
  pool_weight[p] = swap_volume_usd_7d[p]
  pool_share_of_bucket[p] = (pool_weight[p] / Σ pool_weight) × weeklyLpBucket[token]
```

**Within each pool, qualifying LPs split pool share proportionally**:

```
qualifying_supply[p] = Σ lp_balance[i, p] for i in qualifying LPs of p
For each qualifying LP `lp` in pool `p`:
  weekly_accrual[lp] += (lp_balance[lp, p] / qualifying_supply[p]) × pool_share_of_bucket[p]
```

A high-volume pool's LPs collectively earn more than a quiet pool's
LPs — which mirrors how Uniswap V2 LPs traditionally benefit from
active pools, but here paid out explicitly from a separate bucket so
the accounting is transparent. Pools with zero swap volume that week
contribute zero to the denominator → their would-be share rolls into
other pools' allocations (see §4.6).

### 4.5 LP — Monthly bucket (loyalty premium)

Sourced from `monthlyLpBucket` (9.0% of total fees). Distributed once
per month (1st 10:00 UTC). Logic: pro-rata weighted by conviction
tier × tenure multiplier × launch boost. **Biggest multiplier upside**;
rewards long-term loyal LPs.

**Eligibility (both required, strictest gate)**:
- LP value ≥ $100 USD-equivalent at snapshot block, AND
- LP held continuously **≥ 20 days** in the calendar month, OR
  average LP value ≥ $5,000 over the calendar month

**Weight formula**:

```
For each qualifying LP `lp` in pool `p`:
  base_weight = lp_balance[lp, p] / qualifying_supply[p]
  tier_mult   = CONVICTION_TIER_MULT[ tierOf(lp_value_usd) ]
                // Sprout (<$1k):  1.00
                // Climber ($1k-$5k): 1.15
                // Summit  (≥$5k):  1.30
  tenure_mult = TENURE_MULT[ daysSinceFirstMint[lp, p] ]
                // <30d:   1.00
                // 30-89d: 1.10
                // 90-179d:1.25
                // ≥180d:  1.50
  launch_boost = launchBoosts[p].appliesTo(lp) ? boostMult : 1.00
                 // launchBoosts[p].appliesTo(lp) is true iff:
                 //   lp's first mint block is within [startBlock, endBlock]
                 //   AND current block ≥ first_mint_block + vestBlocks
                 //   AND lp still has non-zero LP balance in pool p

  weight[lp, p] = base_weight × tier_mult × tenure_mult × launch_boost

monthly_accrual[lp] = Σ_p (weight[lp, p] × pool_share_of_bucket[p])
                     ─────────────────────────────────────────────
                              Σ_p (Σ_qualifying_lp weight[lp, p])
```

Where `pool_share_of_bucket[p] = (pool_tvl_usd[p] / Σ pool_tvl_usd) × monthlyLpBucket[token]`.

**Maximum multiplier** without launch boost:
`1.30 × 1.50 = 1.95×`. With launch boost (max 2.0×):
`1.95 × 2.00 = 3.90×`. Hardcoded cap enforced in `LiftEngine.sol`.

**Why this design**: monthly is the loyalty premium tier. New LPs
qualify but earn the base rate; long-term Summit LPs with 180-day
tenure earn nearly 2× the base rate. Combined with the strict
20-day-or-$5k eligibility, monthly concentrates rewards on the
most committed liquidity providers — exactly the behavior the
protocol wants to reinforce.

### 4.6 Rollover behavior — what happens when users don't qualify

Rollover is the mechanism that **concentrates rewards on qualifying
participants** when some would-be participants are excluded by
eligibility gates. It operates at two levels, both **automatic** —
no explicit "rollover" function call is needed.

#### Level A: Implicit redistribution within a cadence (weight normalization)

The denominator of every distribution formula is `Σ weights` over
**qualifying** users only. Non-qualifying users contribute zero
weight → their would-be share is automatically split among
qualifying users in proportion to their weight.

**Example — Weekly LP bucket = $100, USDC/cirBTC pool**:

| Wallet | LP value | Held duration | Qualifying? | Weight |
|---|---|---|---|---|
| LP-A | $500 | 5 days | ✓ | 500 |
| LP-B | $1,200 | 30 days | ✓ | 1200 |
| LP-C | $50 | 10 days | ✗ (< $100 min) | 0 |
| LP-D | $300 | 8 hours | ✗ (< 24h trust gate) | 0 |
| LP-E | $200 | 3 days | ✓ | 200 |

Σ qualifying weights = 500 + 1200 + 200 = 1900

- LP-A receives: (500 / 1900) × $100 = **$26.32**
- LP-B receives: (1200 / 1900) × $100 = **$63.16**
- LP-E receives: (200 / 1900) × $100 = **$10.53**
- LP-C, LP-D receive: $0 each

If LP-C and LP-D had qualified, the same bucket would have been
divided 5 ways → LP-A would have gotten ~$18.52 instead of $26.32.
The 42% upside for LP-A is the **concentration effect** from
non-qualifying users being excluded.

Same mechanism applies to:
- Trader weekly / monthly bonus when traders fail the volume gate
- LP daily / weekly / monthly when LPs fail the value or hold gate
- Pool-level allocation when a pool has zero qualifying LPs (its
  share rolls into other pools)

#### Level B: Contract-level bucket carryover (when no one qualifies)

If a cadence cron runs and finds **zero qualifying users**, the bot
submits no `accrue*` call — the sub-bucket balance stays untouched.
The next cron cycle for that cadence operates on the accumulated
bucket (prior balance + fresh inflow since last run).

**Example — new pair launched, no one has held LP > 24h yet**:
- Day 1: pair deployed; some LPs add liquidity throughout the day
- Day 1, 10:00 UTC: daily LP cron runs → no LP qualifies (all < 24h)
- `dailyLpBucket` retains its accumulated balance
- Day 2: more LPs add; some from Day 1 now have > 24h
- Day 2, 10:00 UTC: daily LP cron runs → qualifying LPs split the
  2-day accumulated bucket
- Qualifying LPs get **larger payouts** than they would on a
  single-day distribution → reward for being first-movers who held

Same mechanism handles bot downtime (missed cron run rolls the
bucket into the next run) and the natural ramp-up of new pairs.

#### Why this design

- **Rewards committed users** — every excluded user makes the
  remaining qualifying users' payouts proportionally larger
- **Self-correcting** — no manual intervention if a cadence has no
  qualifiers; funds aren't stranded, they accumulate
- **Trust-gate aligned** — the 24h LP hold-up serves dual purpose:
  blocks hot-money farming AND concentrates rewards on patient LPs
- **Algorithmically fair** — no off-chain decision about who gets
  the rollover; the formula handles it automatically

### 4.7 Launch boost (per-pair, owner-config, bounded)

When a new pair launches, owner can set a one-time launch boost to
bootstrap TVL. Boost adds a multiplier to monthly bucket weight for
LPs who mint within the launch window.

```solidity
struct LaunchBoost {
    uint64 startBlock;
    uint64 endBlock;
    uint64 vestBlocks;      // user must hold this long after mint
    uint16 multiplierBps;   // e.g., 1500 = 1.50×
    bool finalized;
}
```

**Constraints (hardcoded)**:
- `multiplierBps ≤ 2000` (max 2.00×)
- `endBlock - startBlock ≤ 30 days`
- `vestBlocks ≤ 7 days`
- Owner can set `LaunchBoost` for a pair **once**. After
  `finalized = true`, never modifiable.

**Example**: new USDC/USDB pair launches at block N.
`setLaunchBoost(pair, N, N+3days, 1days, 1500)` →
LPs minting in first 3 days, holding ≥ 24h, get 1.5× monthly weight
until they fully remove liquidity (timestamp tracking via first-mint
block per LP per pair).

### 4.8 Bonus bucket (4.5%, reserve)

Accrues into `bonus[token]`. No automatic payout. Activated
manually by owner for community programs (event prize pools, partner
co-marketing). Until activated, owner can sweep to `growthWallet`
via `sweepBonus()` — same gating as `withdrawGrowth`.

---

## 5. Claim flow

```solidity
function claim(address[] calldata tokens) external nonReentrant {
    for (uint i = 0; i < tokens.length; i++) {
        uint256 amt = accrued[msg.sender][tokens[i]];
        if (amt == 0) continue;
        accrued[msg.sender][tokens[i]] = 0;
        _safeTransfer(tokens[i], msg.sender, amt);
        emit Claimed(msg.sender, tokens[i], amt);
    }
}
```

**Properties**:
- Accrued balance persists indefinitely until claimed.
- Gas paid by user. Sub-cent on Arc (USDC-native gas).
- Single call drains all listed tokens — UI lets user claim USDC +
  EURC + cirBTC in one tx.
- Reentrancy-guarded; ERC-20 transfer via safeTransfer pattern.
- (v1.1) Optional Circle Paymaster integration: protocol sponsors
  first claim per wallet to remove gas friction.

---

## 6. Trust & immutability assertions

| Property | Enforcement |
|---|---|
| Fee bucket weights (10/31.5/31.5/22.5/4.5) | `constant` — owner cannot change |
| Trader/LP split within buckets (60/40) | `constant` — owner cannot change |
| Conviction tier multipliers (1.0/1.15/1.30) | `constant` — owner cannot change |
| Tenure multipliers (1.0/1.10/1.25/1.50) | `constant` — owner cannot change |
| Per-pair launch boost | Owner can set ONCE per pair, ≤ 2.0×, ≤ 30 days |
| Per-user accrued balance | Only `accrue*()` functions (bot-callable) increment; only `claim()` decrements |
| Owner can withdraw growth | Yes — capped to `growth[token]` balance, never below |
| Owner can pull arbitrary user funds | **No** — no path |
| Owner can drain bonus bucket | Yes — `sweepBonus()`, no user pending claims affected |
| Distributor mint/burn fee tokens | **No** — no mint capability |

Pre-mainnet: ownership migrates to a 3-of-5 multi-sig (founders +
two advisors). Post-audit: timelock added for any future owner ops
beyond what's listed.

---

## 7. Migration from v0

Existing on-chain state:
- `LiftupFactory`, `LiftupRouter`, `LiftupPair` (3 pairs) — KEEP, no
  contract change. Pair already sends fees to `feeTo()` address.
- `LiftupRewardDistributor` (v0) — DEPRECATE. Any remaining bucket
  balance is migrated by:
    1. Off-chain bot runs final v0 distribution for any pending
       buckets (so no funds are stranded).
    2. Owner calls `withdrawGrowth(token, growth_balance)` for any
       remaining growth funds → transfers to `growthWallet`.
    3. Any residual is sent to `growthWallet` manually (acceptable
       since residual is small testnet dust).

Switch-over:
- Deploy `LiftEngine` contract on Arc Mainnet (post-audit).
- Owner calls `factory.setFeeTo(newLiftEngineAddress)`.
- New swap fees flow into LiftEngine from that block onward.
- Off-chain executor switches to v2 cron scripts.
- v0 distributor stays deployed and verifiable on ArcScan as
  historical record. No funds are moved without an owner tx.

Frontend updates simultaneously:
- New contract address in `lib/liftupAmm.ts`
- `usePendingRewards()` hook reads `accrued[wallet][token]` for each
  deployed token
- New "Claim" button on dashboard
- "Top earners" leaderboard → "Top pending claims" or removed in
  favor of "Top realized earners" (sum of historical Claimed events)
- Realized APR display per pool, computed from last 7 days of LP
  accruals × 52 / pool TVL

---

## 8. Verifiability

Every accrual is reproducible from public inputs:

- **Trader cashback**: anyone can re-derive `cashback[trader]` by
  scanning Swap events on `DEPLOYED_PAIRS` and applying the formula
  in §4.2. Bot's `accrueTrader()` calls must match — discrepancies
  publicly detectable.
- **Daily LP**: re-derivable from `(lp_balance, total_supply)` reads
  at the daily-rollover block.
- **Weekly LP**: re-derivable from prior 7 days of Swap events +
  end-of-week LP balances.
- **Monthly LP**: re-derivable from `(lp_balance, first_mint_block,
  lp_value_at_snapshot)` + immutable tier/tenure tables + per-pair
  launch boost storage.

The off-chain bot is open-source. Each cron run logs the exact
`(token, recipients[], amounts[])` parameters it submitted, plus the
block range scanned and the per-pool weight intermediates. Anyone
can re-run the verifier against the same block range and confirm.

---

## 9. Open questions for v1.1+

- **Auto-compound option** for LP path: allow LP to opt-in to
  receiving rewards as additional LP tokens (instead of underlying
  USDC/EURC/cirBTC) — boosts pool TVL automatically.
- **Achievement badges**: ERC-721 milestones (first LP, 30-day
  streak, all-pairs holder) for engagement without lottery.
- **CCTP-native claim**: claim USDC reward directly to a different
  chain via CCTP burn-and-mint in the same tx.
- **Trader tier (cashback boost)**: progressive cashback rate based
  on cumulative volume.
- **Multi-source `tenure` aggregation**: when an LP removes and
  re-adds, optionally keep prior tenure if gap < 7 days (vs current
  hard reset).

---

## 10. References

- v0 lottery model spec: `contracts/LiftupRewardDistributor.sol`
  comments — superseded by this document.
- Uniswap V2 reference: https://docs.uniswap.org/contracts/v2
- Aerodrome gauge incentives: structurally similar pro-rata
  accrual + claim pattern (without our cadence-tiered logic).
- Clarity Act draft: see §2.3 on "rewards for active participation"
  vs interest distinction.

---

*Lift Engine is an open-source primitive. Any V2-compatible AMM on
Arc (or any EVM chain) can adopt the LiftEngine reward layer by
pointing `factory.feeTo()` at a deployed instance and running the
public executor.*
