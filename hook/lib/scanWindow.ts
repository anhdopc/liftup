// Single source of truth for log-scan window sizing on Arc Testnet.
//
// Why this exists
//   Every stats hook (useRewardsDistributed, useVolume24h, useTopLps,
//   useTopSwappers) needs to know:
//     • how far back the contracts were deployed,
//     • how many blocks per chunk eth_getLogs accepts,
//     • how many chunks are needed to cover "all-time" or "7 days",
//     • how to convert blocks ↔ seconds (for relative timestamps).
//
//   Hardcoding "MAX_ALL_TIME_CHUNKS = 96" + "ARC_AVG_BLOCK_SECONDS = 2"
//   used to bite us every time the testnet grew or Arc tuned its
//   consensus rate. This module makes both quantities self-measuring
//   so the hooks stop needing manual re-tuning.
//
// Lifecycle
//   • DEPLOY_BLOCK_FLOOR is the only true constant — update it once
//     when contracts are redeployed (changes in arc-contracts.json
//     should remind you).
//   • measureBlockTime samples 50 000 blocks of recent history live,
//     caches per-client for 10 minutes. Re-measures automatically.
//   • computeAllTimeChunks sizes the scan window to exactly cover
//     (latest - DEPLOY_BLOCK_FLOOR), plus a small cushion. Page load
//     time scales linearly with testnet age — fine up to ~2 000 chunks
//     (~4 months of Arc history). Past that, migrate to an indexer
//     (Goldsky / Envio); this module logs a console.warn when the
//     ceiling is hit.
//
// What it doesn't do
//   • No retries — chunk failures are handled per-hook (5 % budget).
//   • No indexer integration — that's Tier 3, planned for mainnet.

import { type PublicClient } from 'viem';

/** First block at or BEFORE the LiftupFactory deploy. Update on redeploy. */
export const DEPLOY_BLOCK_FLOOR = 42_750_000n;

/** Per-chunk window size for eth_getLogs. 9 500 blocks fits Arc RPC limits. */
export const CHUNK_BLOCKS = 9_500n;

/** Safety ceiling — anything above this is a sign to move to an indexer. */
export const MAX_REASONABLE_CHUNKS = 2_000;

const SAMPLE_BLOCKS = 50_000n;
const BLOCK_TIME_TTL_MS = 10 * 60_000;

const blockTimeCache = new WeakMap<object, { value: number; expiresAt: number }>();

/**
 * Sec/block, measured live across SAMPLE_BLOCKS of recent history.
 * Cached per PublicClient instance for BLOCK_TIME_TTL_MS.
 */
export async function measureBlockTime(client: PublicClient): Promise<number> {
  const cached = blockTimeCache.get(client as unknown as object);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const latest = await client.getBlock({ blockTag: 'latest' });
  const latestNum = latest.number ?? 0n;
  if (latestNum <= SAMPLE_BLOCKS) {
    const fallback = 1; // chain too young to sample
    blockTimeCache.set(client as unknown as object, {
      value: fallback,
      expiresAt: Date.now() + BLOCK_TIME_TTL_MS,
    });
    return fallback;
  }

  const earlier = await client.getBlock({ blockNumber: latestNum - SAMPLE_BLOCKS });
  const spanSec = Number(latest.timestamp - earlier.timestamp);
  const spanBlocks = Number(SAMPLE_BLOCKS);
  const value = spanSec > 0 ? spanSec / spanBlocks : 1;

  blockTimeCache.set(client as unknown as object, {
    value,
    expiresAt: Date.now() + BLOCK_TIME_TTL_MS,
  });
  return value;
}

/** Number of chunks needed to scan from `latest` back to DEPLOY_BLOCK_FLOOR. */
export async function computeAllTimeChunks(client: PublicClient): Promise<number> {
  const latest = await client.getBlockNumber();
  if (latest <= DEPLOY_BLOCK_FLOOR) return 1;
  const span = latest - DEPLOY_BLOCK_FLOOR;
  const needed = Number(span / CHUNK_BLOCKS) + 5; // +5 cushion for partial chunks
  if (needed > MAX_REASONABLE_CHUNKS) {
    console.warn(
      `[scanWindow] all-time scan needs ${needed} chunks (> ${MAX_REASONABLE_CHUNKS} ` +
      `ceiling) — capping. Migrate to an indexer (Goldsky / Envio) before ` +
      `this becomes the dominant page-load cost.`,
    );
    return MAX_REASONABLE_CHUNKS;
  }
  return needed;
}

/** Block-count for a rolling N-day window at the measured block rate. */
export function computeWindowBlocks(blockTimeSec: number, days: number): bigint {
  return BigInt(Math.ceil((days * 86_400) / Math.max(blockTimeSec, 0.001)));
}

/** Number of chunks to cover a windowBlocks-sized range. */
export function computeWindowChunks(windowBlocks: bigint): number {
  return Number(windowBlocks / CHUNK_BLOCKS) + 5;
}
