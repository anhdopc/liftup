# Lift Engine — Migration Plan (v0 → v1)

> How to transition from the current `LiftupRewardDistributor` (lottery
> model) to `LiftEngine` (pro-rata + cashback model) without breaking
> existing pairs, frontend, or user balances.

**Audience**: operator + audit reviewer
**Pre-req**: read [`lift-engine-spec.md`](./lift-engine-spec.md) for the new model

---

## 1. What stays the same

| Component | Status | Notes |
|---|---|---|
| `LiftupFactory.sol` | **UNCHANGED** | No source change; existing deploy keeps working |
| `LiftupRouter.sol` | **UNCHANGED** | Same |
| `LiftupPair.sol` (all 3 instances) | **UNCHANGED** | Pair already sends fees to whatever `factory.feeTo()` returns |
| Token contracts (USDC, EURC, cirBTC) | **UNCHANGED** | Circle infrastructure |
| GitHub Actions cron infrastructure | **UNCHANGED** | Same workflow files; only the script name and env vars change |
| Off-chain workflows (auto-rebalance, sweep-growth) | **UNCHANGED** | Operate independently of distributor |

→ **No re-audit needed for pair/router/factory.** Only the new
`LiftEngine.sol` enters the audit scope. $15k grant ask unchanged.

## 2. What changes

| Component | Change |
|---|---|
| `LiftupRewardDistributor.sol` | **DEPRECATED** — stays deployed for historical record but no new inflow after switch-over |
| `LiftEngine.sol` | **NEW** — replaces v0 distributor |
| `scripts/distribute-rewards.js` | **DEPRECATED** — replaced by `distribute-rewards-v2.js` |
| `.github/workflows/reward-*.yml` | Update script invocation: `pnpm reward:distribute` → call v2 |
| Frontend hooks | Update `LIFTUP_REWARD_DISTRIBUTOR` address; add new `useClaim` + `usePendingRewards` hooks |
| Frontend UI | Add "Claim rewards" button; replace "Top earners" with realized leaderboard; show APR |

## 3. Switch-over sequence

### Phase 1 — Pre-switch (testnet first)

1. **Audit `LiftEngine.sol`** (Sherlock / Trail of Bits Lite, $15k from grant).
2. **Deploy `LiftEngine` to Arc Testnet**:
   ```
   pnpm hh run scripts/deploy-lift-engine.js --network arcTestnet
   ```
   (TODO: write `deploy-lift-engine.js` — analogous to existing
   `deploy-pool.js` pattern.)
3. **Record new address** in `public/arc-contracts.json` under
   `LiftEngine` key. Keep `LiftupRewardDistributor` for historical
   reference.
4. **Update frontend** with new address + new hooks; deploy to Vercel
   preview branch for QA.

### Phase 2 — Drain v0 distributor

Before switching `feeTo()`, drain v0's outstanding buckets so no
testnet funds are stranded:

1. **Final v0 cron run** for each cadence (daily/weekly/monthly/bonus)
   to settle pending distributions.
2. **Withdraw growth** from v0 distributor:
   ```
   v0.withdrawGrowth(USDC, growth[USDC])
   v0.withdrawGrowth(EURC, growth[EURC])
   ```
3. **Verify v0 balance ≈ 0** on ArcScan. Any residual is acceptable
   dust (sub-cent) and stays in v0 contract permanently.

### Phase 3 — Switch fee routing

```
LiftupFactory.setFeeTo(LIFT_ENGINE_ADDR)
```

From this block onward, all new pair swaps send fees to LiftEngine
instead of v0 distributor. v0 distributor stops receiving inflow.

### Phase 4 — Frontend cutover

1. Deploy frontend with new contract address to production.
2. Update GitHub Actions workflows to call `distribute-rewards-v2.js`
   with appropriate `MODE` env vars:
   - `MODE=trader-instant` — every 10 minutes (per-swap cashback)
   - `MODE=trader-weekly`  — Monday 10:00 UTC (qualifying-trader bonus)
   - `MODE=trader-monthly` — 1st of month 10:00 UTC (qualifying-trader bonus)
   - `MODE=lp-daily`       — 10:00 UTC daily
   - `MODE=lp-weekly`      — Monday 10:00 UTC
   - `MODE=lp-monthly`     — 1st of month 10:00 UTC
   - `MODE=settle`         — included as a pre-step inside each cron
     (optional; v2 internally calls `settle()` before any accrue)

### Phase 5 — Mainnet (post-audit)

Same sequence as testnet, executed on Arc Mainnet. Coordinate with:
- Audit firm signs off on v1.0 of `LiftEngine.sol`
- Multi-sig wallet ready for ownership transfer
- DefiLlama / GeckoTerminal listing requests reference NEW address

## 4. User-facing communication

Before switch-over, publish a short notice on `liftup.money/blog` (or
Twitter):

> **LiftUp v1 — moving from lottery to pro-rata rewards**
>
> On [DATE], we're upgrading the reward layer from the v0 lottery model
> to v1 Lift Engine — pure pro-rata distribution weighted by loyalty
> tier and tenure, plus instant cashback per swap. No more "win the
> draw" mechanics — every contribution earns a deterministic share.
>
> What this means for existing users:
> - **LP token balances**: unchanged. Your LP position is unaffected.
> - **Past rewards**: any rewards already paid out stay in your wallet.
> - **Unclaimed v0 rewards**: none — v0 paid winners directly, no claim
>   pattern.
> - **New rewards**: start accruing automatically from [BLOCK] in the
>   new `LiftEngine` contract at [ADDRESS]. Use the new "Claim" button
>   on your dashboard.

## 5. Rollback plan

Improbable scenario: post-deploy, a critical bug is discovered in
`LiftEngine` BEFORE significant funds accrue.

1. **`factory.setFeeTo(LIFTUP_REWARD_DISTRIBUTOR)`** — revert to v0
   instantly. New fees route back to v0.
2. **Recover funds from LiftEngine**:
   - `withdrawGrowth` callable for `growth[token]`.
   - `sweepBonus` callable for `bonus[token]`.
   - User-accrued balances stay claimable by users via `claim()`.
   - Buckets (daily/weekly/monthly) remain in contract; can be
     `accrue`d to users normally, then claimed.
3. **Frontend reverts** to v0 hooks. Users continue to see distributions
   on v0 cron.

If LiftEngine's owner is compromised: owner can:
- Withdraw growth → `growthWallet` (not arbitrary recipient)
- Sweep bonus → `growthWallet` (same)
- Cannot drain user-accrued balances or buckets
- Cannot change bucket weights or path splits

Pre-mainnet, ownership migrates to 3-of-5 multi-sig.

## 6. Testing checklist (pre-mainnet)

- [ ] Deploy `LiftEngine` to fresh Arc Testnet instance
- [ ] Fund with mock USDC (e.g., 1000 USDC into contract directly)
- [ ] Call `settle(USDC)` → verify buckets split per immutable weights
- [ ] Call `accrueTraderInstant(USDC, [3 test wallets], [amts])` → verify
      `dailyTraderBucket` debits exactly + emit Accrued("trader-instant", …)
- [ ] Call `accrueTraderWeekly(USDC, [wallets], [amts])` → verify
      `weeklyTraderBucket` debits + emit Accrued("trader-weekly", …)
- [ ] Call `accrueTraderMonthly(USDC, [wallets], [amts])` → verify
      `monthlyTraderBucket` debits + emit Accrued("trader-monthly", …)
- [ ] Call `accrueLpDaily(USDC, [3 wallets], [amts])` with sum > LP
      bucket balance → expect revert "LE: exceeds bucket"
- [ ] Verify trader + LP can both drain their respective sub-buckets
      to zero independently (no order dependency)
- [ ] Call `claim(USDC)` from test wallet → verify transfer + reset
      accrued to 0 + decrement pendingClaims
- [ ] Call `setLaunchBoost(pair, ...)` once → verify finalized=true
- [ ] Call `setLaunchBoost(pair, ...)` again → expect revert "already set"
- [ ] Try `multiplierBps = 25000` (> cap) → expect revert "boost > cap"
- [ ] Try non-owner accrue → expect revert "forbidden"
- [ ] `withdrawGrowth(USDC, > growth balance)` → expect revert
- [ ] Slither / Mythril / Echidna pass before submitting to audit firm

## 7. Open implementation TODOs

(Tracked as follow-up work; not blocking spec finalization)

- [ ] `scripts/deploy-lift-engine.js` — deployment script analogous to
      `deploy-pool.js`
- [ ] `hook/useClaim.ts` — frontend hook calling `engine.claim(tokens)`
- [ ] `hook/usePendingRewards.ts` — read `accrued[user][token]` for each
      deployed reward token, plus aggregate "Total pending" UI
- [ ] `components/dashboard/ClaimCard.tsx` — UI surface for claim
- [ ] `components/features/swap/CashbackToast.tsx` — post-swap success
      toast showing "+$X cashback earned"
- [ ] `components/features/pools/PoolRow.tsx` — add "APR" column,
      computed from `(last 7d LP accrual to this pool) × 52 / pool TVL`
- [ ] `useLpAccrualHistory.ts` — scan Accrued events to compute realized
      APR per pool
- [ ] GitHub Actions workflow `reward-trader.yml` — `*/10 * * * *`
      schedule for trader cashback batch
- [ ] Update `useRewardsDistributed.ts` to scan `Claimed` events (v1
      semantic — money distributed = money claimed by users)

---

*Migration is non-destructive. v0 contract stays deployed and verifiable
forever; v1 starts a fresh accounting from switch-over block.*
