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

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

const TOKEN_DECIMALS = 6;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

const CHUNK_BLOCKS = 9_500n;
const DEFAULT_CHUNKS = 32; // ~7d window, aligned with the rest of the leaderboard hooks
const ARC_AVG_BLOCK_SECONDS = 2;

export type UserActivityKind = 'swap' | 'add' | 'remove';

export interface UserActivityEvent {
  kind: UserActivityKind;
  txHash: `0x${string}`;
  blockNumber: bigint;
  timestamp: number;
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
 * Per-user activity feed on a LiftupPair.
 *
 * Uses RPC-level indexed-arg filters so we don't pull global pool history
 * just to discard 99% of it:
 *   - Swap events with `to = user` → direct user filter
 *   - Burn events with `to = user` → direct, amounts included
 *   - LP-token Transfer with `from = 0x0` AND `to = user` → user's LP
 *     mints (Transfer is indexed on both legs). We correlate by tx hash
 *     with unfiltered Mint events fetched once per chunk to recover the
 *     underlying USDC + EURC amounts.
 */
export function useUserActivity(
  pairAddress: `0x${string}` | undefined,
  userAddress: `0x${string}` | undefined,
  options?: Options,
): { items: UserActivityEvent[]; loading: boolean; error: string | null } {
  const chunks = options?.chunks ?? DEFAULT_CHUNKS;
  const max = options?.max ?? 15;
  const refreshKey = options?.refreshKey ?? 0;
  const client = usePublicClient({ chainId: arcTestnet.id });

  const [items, setItems] = useState<UserActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !pairAddress || !userAddress) {
      setItems([]);
      return;
    }
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

        const all: UserActivityEvent[] = [];

        for (let i = 0; i < chunks; i++) {
          const toBlock = latestNumber - BigInt(i) * CHUNK_BLOCKS;
          if (toBlock <= 0n) break;
          const fromBlock =
            toBlock > CHUNK_BLOCKS ? toBlock - CHUNK_BLOCKS + 1n : 0n;

          try {
            const [swapLogs, burnLogs, transferMintLogs, mintLogs] =
              await Promise.all([
                client!.getLogs({
                  address: pairAddress!,
                  event: SWAP_EVENT,
                  args: { to: userAddress! },
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
                  event: BURN_EVENT,
                  args: { to: userAddress! },
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
                // LP token mints to the user (Transfer from 0x0 → user).
                client!.getLogs({
                  address: pairAddress!,
                  event: TRANSFER_EVENT,
                  args: { from: ZERO_ADDRESS, to: userAddress! },
                  fromBlock,
                  toBlock,
                }) as Promise<
                  (Log & {
                    args: { from: `0x${string}`; to: `0x${string}`; value: bigint };
                  })[]
                >,
                // All Mints in the chunk — small, one RPC, used to look up
                // underlying USDC/EURC amounts by tx hash.
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
              ]);

            // Build txHash → Mint(amount0, amount1) map for this chunk.
            const mintByTx = new Map<
              string,
              { amount0: bigint; amount1: bigint }
            >();
            for (const m of mintLogs) {
              mintByTx.set(m.transactionHash as string, {
                amount0: m.args.amount0,
                amount1: m.args.amount1,
              });
            }

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
                amount0: token0In ? a0In : a0Out,
                amount1: token0In ? a1Out : a1In,
                swapToken0In: token0In,
              });
            }

            for (const log of burnLogs) {
              all.push({
                kind: 'remove',
                txHash: log.transactionHash as `0x${string}`,
                blockNumber: log.blockNumber as bigint,
                timestamp: tsFor(log.blockNumber as bigint),
                amount0: parseFloat(formatUnits(log.args.amount0, TOKEN_DECIMALS)),
                amount1: parseFloat(formatUnits(log.args.amount1, TOKEN_DECIMALS)),
              });
            }

            for (const log of transferMintLogs) {
              const txHash = log.transactionHash as string;
              const mint = mintByTx.get(txHash);
              if (!mint) continue; // user transfer outside an add-LP — shouldn't happen
              all.push({
                kind: 'add',
                txHash: log.transactionHash as `0x${string}`,
                blockNumber: log.blockNumber as bigint,
                timestamp: tsFor(log.blockNumber as bigint),
                amount0: parseFloat(formatUnits(mint.amount0, TOKEN_DECIMALS)),
                amount1: parseFloat(formatUnits(mint.amount1, TOKEN_DECIMALS)),
              });
            }
          } catch (chunkErr) {
            console.warn('[liftup] useUserActivity chunk failed', chunkErr);
          }

          if (fromBlock === 0n) break;
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
        console.warn('[liftup] useUserActivity failed', err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [client, pairAddress, userAddress, chunks, max, refreshKey]);

  return { items, loading, error };
}
