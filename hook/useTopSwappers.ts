'use client';

import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { parseAbiItem, formatUnits, type Log, type PublicClient } from 'viem';
import { arcTestnet } from '@/lib/chains';
import {
  DEPLOYED_PAIR_ADDRESSES,
  PAIR_CONFIGS_BY_ADDRESS,
} from '@/lib/pools';
import {
  DEPLOY_BLOCK_FLOOR,
  CHUNK_BLOCKS,
  computeAllTimeChunks,
} from './lib/scanWindow';

const SWAP_EVENT = parseAbiItem(
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
);

export interface TopSwapper {
  address: `0x${string}`;
  /** USD-equivalent volume summed across all 3 pairs. */
  volumeUsd: number;
  /** Total swap count across all pairs. */
  swapCount: number;
}

interface Options {
  /** Number of 9.5k-block chunks to scan back. Default 1200. */
  chunks?: number;
  /** Cap on returned rows. */
  limit?: number;
}

interface ScanArgs {
  client: PublicClient;
  chunks?: number;
}

async function scanTopSwappers(args: ScanArgs): Promise<TopSwapper[]> {
  const { client } = args;
  const latest = await client.getBlockNumber();
  const chunks = args.chunks ?? (await computeAllTimeChunks(client));
  const tally = new Map<string, { vol: number; count: number }>();
  let attempted = 0;
  let failed = 0;

  for (let i = 0; i < chunks; i++) {
    const toBlock = latest - BigInt(i) * CHUNK_BLOCKS;
    if (toBlock <= DEPLOY_BLOCK_FLOOR) break;
    const fromBlockRaw =
      toBlock > CHUNK_BLOCKS ? toBlock - CHUNK_BLOCKS + 1n : 0n;
    const fromBlock =
      fromBlockRaw < DEPLOY_BLOCK_FLOOR ? DEPLOY_BLOCK_FLOOR : fromBlockRaw;

    attempted++;
    try {
      const logs = (await client.getLogs({
        address: DEPLOYED_PAIR_ADDRESSES,
        event: SWAP_EVENT,
        fromBlock,
        toBlock,
      })) as (Log & {
        address: `0x${string}`;
        args: {
          sender: `0x${string}`;
          to: `0x${string}`;
          amount0In: bigint;
          amount1In: bigint;
          amount0Out: bigint;
          amount1Out: bigint;
        };
      })[];

      for (const l of logs) {
        const cfg = PAIR_CONFIGS_BY_ADDRESS.get(l.address.toLowerCase());
        if (!cfg) continue;
        const a = l.args;
        const isToken0In = a.amount0In > 0n;
        const rawIn = isToken0In ? a.amount0In : a.amount1In;
        const dec = isToken0In ? cfg.dec0 : cfg.dec1;
        const price = isToken0In ? cfg.price0 : cfg.price1;
        const vol = parseFloat(formatUnits(rawIn, dec)) * price;
        const key = a.to.toLowerCase();
        const prev = tally.get(key);
        if (prev) {
          prev.vol += vol;
          prev.count += 1;
        } else {
          tally.set(key, { vol, count: 1 });
        }
      }
    } catch (err) {
      failed++;
      console.warn('[liftup] useTopSwappers chunk failed', err);
    }
    if (fromBlock === 0n) break;
  }

  if (attempted > 0 && failed / attempted > 0.05) {
    throw new Error(
      `[useTopSwappers] ${failed}/${attempted} chunks failed — refusing partial result`,
    );
  }

  return Array.from(tally.entries())
    .map(([addr, v]) => ({
      address: addr as `0x${string}`,
      volumeUsd: v.vol,
      swapCount: v.count,
    }))
    .sort((a, b) => b.volumeUsd - a.volumeUsd);
}

/**
 * Leaderboard of swappers ranked by USD-equivalent volume across ALL
 * deployed LiftupPair contracts. Registry-driven via DEPLOYED_PAIR_ADDRESSES
 * and PAIR_CONFIGS_BY_ADDRESS in lib/pools.ts — adding a new pool there
 * automatically extends this leaderboard.
 *
 * Deduplicated via TanStack Query — Hero + CommunityStats + any future
 * consumer share a single scan.
 */
export function useTopSwappers(
  options?: Options,
): { rows: TopSwapper[]; loading: boolean } {
  // Undefined chunks → scanTopSwappers auto-sizes via computeAllTimeChunks.
  const chunks = options?.chunks;
  const limit = options?.limit ?? 10;
  const client = usePublicClient({ chainId: arcTestnet.id }) as
    | PublicClient
    | undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['liftup', 'top-swappers', 'v7', chunks ?? 'auto'],
    queryFn: () => scanTopSwappers({ client: client as PublicClient, chunks }),
    enabled: !!client,
    staleTime: 60_000,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });

  return { rows: (data ?? []).slice(0, limit), loading: isLoading };
}
