'use client';

import { useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { parseAbiItem, formatUnits, type Log } from 'viem';
import { arcTestnet } from '@/lib/chains';

const SWAP_EVENT = parseAbiItem(
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
);

const MINT_EVENT = parseAbiItem(
  'event Mint(address indexed sender, uint256 amount0, uint256 amount1)',
);

const BURN_EVENT = parseAbiItem(
  'event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)',
);

const TOKEN_DECIMALS = 6;

// Arc Testnet caps eth_getLogs at a 10k-block window. Each chunk fetches
// Swap + Mint + Burn events in parallel and the merged result is sorted
// by block number descending. Six chunks ≈ 57k blocks ≈ 32 hours.
const CHUNK_BLOCKS = 9_500n;
const DEFAULT_CHUNKS = 6;

const ARC_AVG_BLOCK_SECONDS = 2;

export type ActivityKind = 'swap' | 'add' | 'remove';

export interface ActivityEvent {
  kind: ActivityKind;
  txHash: `0x${string}`;
  blockNumber: bigint;
  /** Approx Unix seconds (computed from block number + Arc avg block time). */
  timestamp: number;
  sender: `0x${string}`;
  to?: `0x${string}`;
  /** Token0 / token1 amounts in human units. Caller maps to USDC/EURC by sort order. */
  amount0: number;
  amount1: number;
  /** Swap-only: which side was the input. */
  swapToken0In?: boolean;
}

interface Options {
  chunks?: number;
  max?: number;
  refreshKey?: number;
}

/**
 * Returns the most recent swap + mint + burn events emitted by a LiftupPair.
 *
 * We paginate within Arc's 10k-block eth_getLogs cap. Default DEFAULT_CHUNKS
 * (6) covers ~32 hours of history at Arc's 2-second blocks, which is
 * enough to surface any LP add the user just made plus their recent swaps.
 *
 * Each event has an approximate timestamp computed from the latest block
 * time + per-block average — no extra getBlock round trips required.
 */
export function useRecentActivity(
  pairAddress: `0x${string}` | undefined,
  options?: Options,
): { items: ActivityEvent[]; loading: boolean; error: string | null } {
  const chunks = options?.chunks ?? DEFAULT_CHUNKS;
  const max = options?.max ?? 15;
  const refreshKey = options?.refreshKey ?? 0;
  const client = usePublicClient({ chainId: arcTestnet.id });

  const [items, setItems] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !pairAddress) return;
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const latestBlock = await client!.getBlock();
        const latestNumber =
          latestBlock.number ?? (await client!.getBlockNumber());
        const latestTs = Number(latestBlock.timestamp);

        const tsFor = (bn: bigint): number =>
          latestTs - Number(latestNumber - bn) * ARC_AVG_BLOCK_SECONDS;

        const all: ActivityEvent[] = [];

        for (let i = 0; i < chunks; i++) {
          const toBlock = latestNumber - BigInt(i) * CHUNK_BLOCKS;
          if (toBlock <= 0n) break;
          const fromBlock =
            toBlock > CHUNK_BLOCKS ? toBlock - CHUNK_BLOCKS + 1n : 0n;

          try {
            const [swapLogs, mintLogs, burnLogs] = await Promise.all([
              client!.getLogs({
                address: pairAddress!,
                event: SWAP_EVENT,
                fromBlock,
                toBlock,
              }) as Promise<
                (Log & {
                  args: {
                    sender: `0x${string}`;
                    to: `0x${string}`;
                    amount0In: bigint;
                    amount1In: bigint;
                    amount0Out: bigint;
                    amount1Out: bigint;
                  };
                })[]
              >,
              client!.getLogs({
                address: pairAddress!,
                event: MINT_EVENT,
                fromBlock,
                toBlock,
              }) as Promise<
                (Log & {
                  args: {
                    sender: `0x${string}`;
                    amount0: bigint;
                    amount1: bigint;
                  };
                })[]
              >,
              client!.getLogs({
                address: pairAddress!,
                event: BURN_EVENT,
                fromBlock,
                toBlock,
              }) as Promise<
                (Log & {
                  args: {
                    sender: `0x${string}`;
                    amount0: bigint;
                    amount1: bigint;
                    to: `0x${string}`;
                  };
                })[]
              >,
            ]);

            for (const log of swapLogs) {
              const a = log.args;
              const a0In = parseFloat(formatUnits(a.amount0In, TOKEN_DECIMALS));
              const a1In = parseFloat(formatUnits(a.amount1In, TOKEN_DECIMALS));
              const a0Out = parseFloat(formatUnits(a.amount0Out, TOKEN_DECIMALS));
              const a1Out = parseFloat(formatUnits(a.amount1Out, TOKEN_DECIMALS));
              const token0In = a0In > 0;
              all.push({
                kind: 'swap',
                txHash: log.transactionHash as `0x${string}`,
                blockNumber: log.blockNumber as bigint,
                timestamp: tsFor(log.blockNumber as bigint),
                sender: a.sender,
                to: a.to,
                amount0: token0In ? a0In : a0Out,
                amount1: token0In ? a1Out : a1In,
                swapToken0In: token0In,
              });
            }

            for (const log of mintLogs) {
              all.push({
                kind: 'add',
                txHash: log.transactionHash as `0x${string}`,
                blockNumber: log.blockNumber as bigint,
                timestamp: tsFor(log.blockNumber as bigint),
                sender: log.args.sender,
                amount0: parseFloat(formatUnits(log.args.amount0, TOKEN_DECIMALS)),
                amount1: parseFloat(formatUnits(log.args.amount1, TOKEN_DECIMALS)),
              });
            }

            for (const log of burnLogs) {
              all.push({
                kind: 'remove',
                txHash: log.transactionHash as `0x${string}`,
                blockNumber: log.blockNumber as bigint,
                timestamp: tsFor(log.blockNumber as bigint),
                sender: log.args.sender,
                to: log.args.to,
                amount0: parseFloat(formatUnits(log.args.amount0, TOKEN_DECIMALS)),
                amount1: parseFloat(formatUnits(log.args.amount1, TOKEN_DECIMALS)),
              });
            }
          } catch (chunkErr) {
            // Most often a chunk near genesis — skip and continue.
            console.warn('[liftup] useRecentActivity chunk failed', chunkErr);
          }

          if (fromBlock === 0n) break;

          // If we already have plenty of recent events, no need to walk
          // deeper into history — saves RPC.
          if (all.length >= max * 2) break;
        }

        if (cancelled) return;

        const merged = all
          .sort((a, b) =>
            a.blockNumber === b.blockNumber ? 0 : a.blockNumber > b.blockNumber ? -1 : 1,
          )
          .slice(0, max);

        setItems(merged);
      } catch (err) {
        if (cancelled) return;
        console.warn('[liftup] useRecentActivity failed', err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [client, pairAddress, chunks, max, refreshKey]);

  return { items, loading, error };
}
