/**
 * Pool registry — single source of truth for every pair LiftUp exposes.
 *
 * To add a new stablecoin / pair after deployment:
 *   1. Add the token to `ARC_TOKENS` in lib/tokens.ts (decimals + priceUsd)
 *   2. Export the pair address from lib/liftupAmm.ts
 *   3. Append a new entry to `LIFTUP_POOLS` below
 *
 * Every hook (useLandingStats, useVolume24h, useActiveUsers, useTopSwappers,
 * useTopLps) reads from this registry — no code changes needed in the hooks
 * themselves. The `getPairConfig` helper auto-sorts tokenA / tokenB by
 * address so the contract-level "token0 = lower address" invariant holds
 * regardless of how a new entry is authored.
 */
import {
  LIFTUP_PAIR_USDC_EURC,
  LIFTUP_PAIR_USDC_CIRBTC,
  LIFTUP_PAIR_EURC_CIRBTC,
} from './liftupAmm';
import { findToken, type Token } from './tokens';

export type PoolVersion = 'V2' | 'V3';

export interface PoolEntry {
  id: string;
  tokenA: Token;
  tokenB: Token;
  pair: `0x${string}`;
  version: PoolVersion;
  /** Flat fee in basis points (LP fee). 5 = 0.05% for our stable-pair V2 fork. */
  feeBps: number;
  /** Optional pinned flag for the UI to surface a star/highlight. */
  pinned?: boolean;
  /**
   * True when the pair contract is live on-chain with non-zero reserves
   * (`undefined` defaults to true for back-compat). When false, the UI:
   *   - Hides the "Add liquidity" CTA (or labels it "Coming soon")
   *   - Shows TVL / volume as "—" instead of trying to read empty state
   *   - Swap UI auto-routes through Circle App Kit (no LiftUp quote)
   *   - Stats hooks skip the pair in their multi-pool scans
   */
  deployed?: boolean;
}

const usdc = findToken('USDC')!;
const eurc = findToken('EURC')!;
const cirbtc = findToken('cirBTC')!;

export const LIFTUP_POOLS: PoolEntry[] = [
  {
    id: 'USDC-EURC',
    tokenA: usdc,
    tokenB: eurc,
    pair: LIFTUP_PAIR_USDC_EURC,
    version: 'V2',
    feeBps: 5,
    pinned: true,
    deployed: true,
  },
  {
    id: 'USDC-cirBTC',
    tokenA: usdc,
    tokenB: cirbtc,
    pair: LIFTUP_PAIR_USDC_CIRBTC,
    version: 'V2',
    feeBps: 5,
    deployed: true,
  },
  {
    id: 'EURC-cirBTC',
    tokenA: eurc,
    tokenB: cirbtc,
    pair: LIFTUP_PAIR_EURC_CIRBTC,
    version: 'V2',
    feeBps: 5,
    deployed: true,
  },
];

// ─────────────────────────────────────────────────────────────────────
// Derived configs — built from LIFTUP_POOLS, consumed by stats hooks.
// Adding a new pool entry above automatically propagates here.
// ─────────────────────────────────────────────────────────────────────

/**
 * Resolves the on-chain ERC-20 address of a token. Native gas tokens
 * (USDC on Arc) use their `wrappedAddress`; regular ERC-20s use `address`.
 */
function tokenAddress(token: Token): `0x${string}` {
  if (token.native && token.wrappedAddress) return token.wrappedAddress;
  if (token.address) return token.address;
  throw new Error(`Token ${token.symbol} has no on-chain address`);
}

/**
 * On-chain ERC-20 decimals. USDC is "native" 18-dp on Arc but its
 * 6-dp wrapper is what trades through the router.
 */
function onChainDecimals(token: Token): number {
  return token.native ? 6 : token.decimals;
}

/**
 * Resolved per-pair config aligned with the contract's token0 / token1
 * sort order (lower address = token0). All stats hooks consume this
 * shape — it abstracts away which side is USDC vs EURC vs cirBTC.
 */
export interface PairConfig {
  pair: `0x${string}`;
  token0: Token;
  token1: Token;
  /** Decimals of token0 (lower-address side). */
  dec0: number;
  /** Decimals of token1 (higher-address side). */
  dec1: number;
  /** USD price of 1 token0 unit. */
  price0: number;
  /** USD price of 1 token1 unit. */
  price1: number;
}

export function getPairConfig(pool: PoolEntry): PairConfig {
  const a = pool.tokenA;
  const b = pool.tokenB;
  const aAddr = tokenAddress(a).toLowerCase();
  const bAddr = tokenAddress(b).toLowerCase();
  const aIsToken0 = aAddr < bAddr;
  const token0 = aIsToken0 ? a : b;
  const token1 = aIsToken0 ? b : a;
  return {
    pair: pool.pair,
    token0,
    token1,
    dec0: onChainDecimals(token0),
    dec1: onChainDecimals(token1),
    price0: token0.priceUsd,
    price1: token1.priceUsd,
  };
}

/** Array of every deployed pool's resolved config. */
export const DEPLOYED_PAIRS: PairConfig[] = LIFTUP_POOLS.filter(
  (p) => p.deployed !== false,
).map(getPairConfig);

/** Array of just the pair contract addresses (for multi-address eth_getLogs). */
export const DEPLOYED_PAIR_ADDRESSES: `0x${string}`[] = DEPLOYED_PAIRS.map(
  (p) => p.pair,
);

/** Lower-cased pair-address → config lookup, for resolving an event log to its pool. */
export const PAIR_CONFIGS_BY_ADDRESS: Map<string, PairConfig> = new Map(
  DEPLOYED_PAIRS.map((cfg) => [cfg.pair.toLowerCase(), cfg]),
);
