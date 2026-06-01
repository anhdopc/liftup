'use client';

import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { parseAbiItem, type Log, type PublicClient } from 'viem';
import { arcTestnet } from '@/lib/chains';
import { LIFTUP_ROUTER } from '@/lib/liftupAmm';
import { DEPLOYED_PAIR_ADDRESSES } from '@/lib/pools';

const SWAP_EVENT = parseAbiItem(
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
);
const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

const ZERO = '0x0000000000000000000000000000000000000000';
const DEAD = '0x000000000000000000000000000000000000dead';
const CHUNK_BLOCKS = 9_500n;
const MAX_CHUNKS = 1200;
// All-time scan floor. CREATE2 pair addresses are stable across factory
// redeploys, so events from the very first deploy are still on-chain.
const DEPLOY_BLOCK_FLOOR = 42_750_000n;

const PAIR_LCS = new Set(DEPLOYED_PAIR_ADDRESSES.map((p) => p.toLowerCase()));
const ROUTER_LOWER = LIFTUP_ROUTER.toLowerCase();

/**
 * Pure scan function — runs against the supplied viem client and returns
 * a Set of unique active-user addresses across ALL deployed pairs.
 *
 * Fail-loud: if more than 5% of chunks fail, throws so React Query
 * keeps the previous successful result rather than caching a partial
 * scan. (This is what caused the "active users drops from 102 → 91"
 * oscillation before the refactor.)
 */
async function scanActiveUsers(client: PublicClient): Promise<Set<string>> {
  const latest = await client.getBlockNumber();
  const set = new Set<string>();
  let attemptedChunks = 0;
  let failedChunks = 0;

  for (let i = 0; i < MAX_CHUNKS; i++) {
    const toBlock = latest - BigInt(i) * CHUNK_BLOCKS;
    if (toBlock <= DEPLOY_BLOCK_FLOOR) break;
    const fromBlockRaw =
      toBlock > CHUNK_BLOCKS ? toBlock - CHUNK_BLOCKS + 1n : 0n;
    const fromBlock =
      fromBlockRaw < DEPLOY_BLOCK_FLOOR ? DEPLOY_BLOCK_FLOOR : fromBlockRaw;

    attemptedChunks++;
    try {
      const [swapLogs, transferLogs] = await Promise.all([
        client.getLogs({
          address: DEPLOYED_PAIR_ADDRESSES,
          event: SWAP_EVENT,
          fromBlock,
          toBlock,
        }) as Promise<(Log & { args: { to: `0x${string}` } })[]>,
        client.getLogs({
          address: DEPLOYED_PAIR_ADDRESSES,
          event: TRANSFER_EVENT,
          fromBlock,
          toBlock,
        }) as Promise<
          (Log & { args: { from: `0x${string}`; to: `0x${string}` } })[]
        >,
      ]);

      for (const l of swapLogs) {
        const to = l.args.to?.toLowerCase();
        if (to) set.add(to);
      }
      for (const l of transferLogs) {
        const from = l.args.from?.toLowerCase();
        const to = l.args.to?.toLowerCase();
        if (from === ZERO && to) set.add(to);
        else if ((to === ZERO || to === DEAD) && from) set.add(from);
      }
    } catch (err) {
      failedChunks++;
      console.warn('[liftup] useActiveUsers chunk failed', err);
    }
    if (fromBlock <= DEPLOY_BLOCK_FLOOR) break;
  }

  // Strip infra addresses (zero, dead, all pair contracts, router).
  set.delete(ZERO);
  set.delete(DEAD);
  set.delete(ROUTER_LOWER);
  for (const p of PAIR_LCS) set.delete(p);

  // Fail-loud on too-many chunk failures so React Query keeps previous
  // good data instead of caching a partial scan.
  if (attemptedChunks > 0 && failedChunks / attemptedChunks > 0.05) {
    throw new Error(
      `[useActiveUsers] ${failedChunks}/${attemptedChunks} chunks failed — refusing to overwrite cache with partial scan`,
    );
  }

  return set;
}

/**
 * Cumulative count of unique end-users active across ALL deployed
 * LiftupPair contracts (swap + add + remove liquidity), aggregated
 * via TanStack Query so multiple components share a single scan.
 *
 * Architecture:
 *   - One queryKey across the whole app → dedup. Hero and CommunityStats
 *     share the same scan result; no more "Hero says 90, CommunityStats
 *     says 102" race conditions.
 *   - 60s refetchInterval → re-scan once per minute while any consumer
 *     is mounted.
 *   - placeholderData keepPreviousData → never blank during refetch.
 *   - throwOnError preserved → fail-loud guards against partial scans
 *     overwriting good cache.
 */
export function useActiveUsers(): { count: number; loading: boolean } {
  const client = usePublicClient({ chainId: arcTestnet.id }) as
    | PublicClient
    | undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['liftup', 'active-users', 'v6'],
    queryFn: () => scanActiveUsers(client as PublicClient),
    enabled: !!client,
    staleTime: 60_000,
    refetchInterval: 60_000,
    // Keep last good data while refetching so the UI never blinks.
    placeholderData: (prev) => prev,
  });

  return { count: data?.size ?? 0, loading: isLoading };
}
