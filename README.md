# LiftUp Money

> Stablecoin liquidity & loyalty layer on Arc Network — USDC, EURC,
> cirBTC pairs with CCTP-native bridging. No protocol token. 90% of
> every swap fee returns to users via deterministic pro-rata rewards.

🌐 **Live**: <https://liftup.money>
📜 **Lift Engine spec (v1.1)**: [`docs/lift-engine-spec.md`](docs/lift-engine-spec.md)
🔁 **Migration plan (v0 → v1.1)**: [`docs/lift-engine-migration.md`](docs/lift-engine-migration.md)

---

## What is LiftUp?

A Uniswap V2-compatible AMM optimized for stablecoins on Arc Network,
paired with **Lift Engine** — a reward layer that splits every swap
fee through immutable buckets and pays users via:

- **Instant cashback per swap** for traders (~0.027% of volume)
- **Pro-rata accrual** for LPs, weighted by conviction tier × tenure
- **User-pulled `claim()`** mechanism — no random selection, no
  governance, no inflation

Three pairs live on Arc Testnet:

| Pair | Address |
|---|---|
| USDC / EURC | `0xc36B6B7f9F35A145E2E34c9452E99E57379aEBfF` |
| USDC / cirBTC | `0x5A15E9bcF7f18B4A0F93739d9C9035c4D6Bfa9C5` |
| EURC / cirBTC | `0xd86D2d75e5b21727F585b4CDdF631d6b9A4655f5` |

See [`public/arc-contracts.json`](public/arc-contracts.json) for the
full deployed address list.

---

## Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Wallet / RPC**: Reown AppKit + wagmi v2 + viem + TanStack Query
- **Swap engine**: Hybrid router — LiftUp V2 pool first, Circle App Kit
  (`@circle-fin/adapter-viem-v2`) fallback for best execution
- **Bridge**: Circle Bridge Kit + CCTP v1 / v2 (USDC across Arc ↔ ETH /
  Base / Arbitrum)
- **Contracts**: Solidity 0.8.24, Uniswap V2 fork (MIT, from ChordSwap)
- **Off-chain executor**: Hardhat scripts + GitHub Actions cron

---

## Getting started

```bash
pnpm install

# Create .env.local with:
#   NEXT_PUBLIC_REOWN_PROJECT_ID  — from https://cloud.reown.com
#   NEXT_PUBLIC_CIRCLE_KIT_KEY    — from https://console.circle.com (testnet Kit Key)
# Optional (for contract ops / cron):
#   DEPLOYER_PRIVATE_KEY          — wallet that pays gas in USDC
#   REBALANCER_PRIVATE_KEY        — separate wallet for auto-rebalance bot

pnpm dev
```

Open <http://localhost:3000>.

Get testnet USDC + EURC + cirBTC from the [Circle faucet](https://faucet.circle.com)
(select "Arc Testnet" and the token you need).

---

## Lift Engine v1.1 (reward layer)

**Status**: spec finalized, contract drafted at
[`contracts/LiftEngine.sol`](contracts/LiftEngine.sol), pending audit.
Migration from v0 (`LiftupRewardDistributor`) is non-destructive — LP
positions stay intact, only `factory.feeTo()` switches in one tx.

Full spec at [`docs/lift-engine-spec.md`](docs/lift-engine-spec.md).
TL;DR:

```
0.05% LP fee → 100% to Lift Engine
  ├─ 10% growth                      (admin, withdrawable)
  ├─  4.5% bonus reserve             (dormant until activated)
  └─ 90% reward bucket (3 cadences, 60/40 trader/LP split each)
       │
       │ 8 independent sub-buckets:
       ├─ daily-trader   (18.9%)  → instant cashback per swap
       ├─ daily-lp       (12.6%)  → pro-rata by % of pool
       ├─ weekly-trader  (18.9%)  → qualifying-trader weekly bonus
       ├─ weekly-lp      (12.6%)  → activity-weighted (pool volume)
       ├─ monthly-trader (13.5%)  → qualifying-trader monthly bonus
       └─ monthly-lp     ( 9.0%)  → tier × tenure × launch boost
                       │
                       ▼
              user.claim(tokens[]) → wallet
              (sub-cent gas on Arc)
```

Cron schedule (run by GitHub Actions, executor:
[`scripts/distribute-rewards-v2.js`](scripts/distribute-rewards-v2.js)):

| Cadence | Time (UTC) | Mode |
|---|---|---|
| Trader instant | every 10 min | `MODE=trader-instant` |
| Trader weekly | Mon 10:00 | `MODE=trader-weekly` |
| Trader monthly | 1st 10:00 | `MODE=trader-monthly` |
| LP daily | 10:00 | `MODE=lp-daily` |
| LP weekly | Mon 10:00 | `MODE=lp-weekly` |
| LP monthly | 1st 10:00 | `MODE=lp-monthly` |

Every recipient + amount is **deterministically reproducible** from
public Swap + Transfer events using the formulas in spec §4.

---

## Swap engine (hybrid routing)

The swap UI quotes both LiftUp Pool and Circle App Kit on every input,
then picks whichever offers the better effective rate.

- Pool route: `LiftupRouter.swapExactTokensForTokens()` — 0.05% LP fee
  goes to Lift Engine.
- Circle route: `kit.swap()` — Circle handles approval (EIP-2612 permit
  fallback to `approve`); LiftUp adds a 10 bps `customFee` that also
  flows to Lift Engine.

Circle's API does not enable CORS for browser origins, so the app
ships a same-origin proxy at
[`app/api/circle/[host]/[...rest]/route.ts`](app/api/circle/[host]/[...rest]/route.ts).
The client patch in [`lib/circleKit.ts`](lib/circleKit.ts) rewrites
`api.circle.com` / `iris-api.circle.com` / `gateway-api.circle.com`
URLs at the `fetch` boundary so the SDK never knows.

Setup:

1. Sign up at <https://console.circle.com> → **Keys → Kit Keys**
2. Create a Kit Key (testnet) and copy `KIT_KEY:<id>:<secret>`
3. Set either:
   - **Server-only (recommended)** — `CIRCLE_KIT_KEY=KIT_KEY:id:secret`
   - Or, testnet-only — `NEXT_PUBLIC_CIRCLE_KIT_KEY=KIT_KEY:id:secret`
4. Same value in **Vercel → Settings → Environment Variables**

---

## Contracts (Arc Testnet)

```
contracts/
  LiftupFactory.sol               — V2 factory, CREATE2 pairs
  LiftupRouter.sol                — V2 router (swap / add / remove)
  LiftupPair.sol                  — V2 pair with feeTo redirection
  LiftupRewardDistributor.sol     — v0 lottery distributor (deprecated)
  LiftEngine.sol                  — v1.1 reward layer (pending audit)
```

### Deploy

```bash
# Fund deployer wallet with native USDC on Arc Testnet first.
# (Faucet: https://faucet.circle.com → Arc Testnet → USDC)
echo "DEPLOYER_PRIVATE_KEY=0x..." >> .env.local

pnpm compile
pnpm deploy:pool
```

The script deploys Factory + Router, creates the USDC/EURC pair, and
writes the addresses to `public/arc-contracts.json`. Additional pairs
are deployed via `factory.createPair(tokenA, tokenB)`.

### Verify on ArcScan

ArcScan ([testnet.arcscan.app](https://testnet.arcscan.app)) is a
BlockScout-style explorer with Etherscan-compatible verification API.
No API key required.

```bash
npx hardhat verify --network arcTestnet <ADDRESS> [constructor args]
```

See `scripts/verify-all.js` for the full sequence.

---

## Repository layout

```
app/                  — Next.js routes (landing + /swap + /bridge + /liquidity
                        + /reward + /dashboard + /docs + /brand + /faucet)
components/
  features/           — landing sections, swap card, bridge, pools, docs
  liquidity/          — reward page sections (FeeFlow, RewardPools, FAQ, etc.)
  layout/             — Navbar, Footer, Providers (wagmi + react-query)
  common/             — shared UI primitives
  magic/              — decorative background / particles
hook/                 — wagmi + Circle + TanStack-Query hooks
                        (stats hooks are registry-driven via lib/pools.ts)
lib/                  — pools registry, tokens, chains, circleKit, utils
contracts/            — Solidity sources (Uniswap V2 fork + Lift Engine)
scripts/              — Hardhat deploy + GitHub Actions executors
                        (distribute-rewards-v2.js, auto-rebalance.js, ...)
.github/workflows/    — cron workflows (reward distribution, rebalance)
docs/                 — public specs (lift-engine-spec.md, migration plan)
public/               — static assets, brand kit, arc-contracts.json
```

---

## On-chain reproducibility

Every reward distribution is reproducible from public events:

- **Trader instant cashback**: scan `Swap` events on `DEPLOYED_PAIR_ADDRESSES`,
  apply `cashback_usd = volume_usd × 0.0000945` (spec §4.2.1)
- **LP daily/weekly/monthly**: scan `Transfer` events on pair contracts +
  read live `balanceOf` + `getReserves`, apply formulas in spec §4.3-4.5
- **Bot output**: each cron run logs the exact `(token, recipients[],
  amounts[])` submitted — verifiable on ArcScan against the
  `Accrued(cadence, token, recipient, amount)` events emitted by
  `LiftEngine`

Anyone can re-derive the same recipient lists from the same block
ranges using `scripts/distribute-rewards-v2.js` in dry-run mode.

---

## Status

- ✅ **Phase 1 (May 2026)** — Testnet MVP: 6 verified contracts (Factory +
  Router + Distributor + 3 pairs), 6 Circle products live (USDC, EURC,
  cirBTC, App Kit, Bridge Kit, CCTP v1/v2), hybrid swap router, CCTP
  bridge, full LP flow, reward dashboard, multi-pool stats, multi-source
  price safety with 3-tier circuit breaker, auto-rebalance keeper
- 🔄 **Phase 2 (Q3 2026)** — Independent audit of `LiftEngine.sol`,
  migrate `factory.feeTo()` → LiftEngine, Arc Mainnet launch
- 📅 **Phase 3 (Q4 2026)** — EURC cross-border corridor + payroll widget,
  aggregator onboarding (1inch / Paraswap / OpenOcean), Circle Paymaster
- 📅 **Phase 4+** — Circle Wallets, Unified Balance, x402 agentic surface

---

## License

MIT. Built on the [Uniswap V2 fork](https://github.com/Uniswap/v2-core)
pattern (via ChordSwap, also MIT).

---

## Contact

- Site: <https://liftup.money>
- X: [@LiftUpMoney](https://x.com/LiftUpMoney)
- Issues + PRs welcome.
