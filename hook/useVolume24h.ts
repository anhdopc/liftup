'use client';

import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { parseAbiItem, formatUnits, type Log, type PublicClient } from 'viem';
import { arcTestnet } from '@/lib/chains';
import { LIFTUP_REWARD_DISTRIBUTOR } from '@/lib/liftupAmm';
import { USDC_ON_ARC, EURC_ON_ARC, CIRBTC_ON_ARC, findToken } from '@/lib/tokens';
import {
  DEPLOYED_PAIR_ADDRESSES,
  PAIR_CONFIGS_BY_ADDRESS,
} from '@/lib/pools';
import {
  DEPLOY_BLOCK_FLOOR,
  CHUNK_BLOCKS,
  computeAllTimeChunks,
  computeWindowBlocks,
  computeWindowChunks,
  measureBlockTime,
} from './lib/scanWindow';

const CIRCLE_FEE_TO_VOLUME = 1000;
const WINDOW_DAYS = 7;

const SWAP_EVENT = parseAbiItem(
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
);
const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

const USDC = findToken('USDC')!;
const EURC = findToken('EURC')!;
const CIRBTC = findToken('cirBTC')!;

/** USD value of one side of a swap — pick whichever leg actually moved IN. */
function swapUsdValue(
  log: Log & {
    address: `0x${string}`;
    args: {
      amount0In: bigint;
      amount1In: bigint;
      amount0Out: bigint;
      amount1Out: bigint;
    };
  },
): number {
  const cfg = PAIR_CONFIGS_BY_ADDRESS.get(log.address.toLowerCase());
  if (!cfg) return 0;
  const a = log.args;
  const isToken0In = a.amount0In > 0n;
  const rawIn = isToken0In ? a.amount0In : a.amount1In;
  const dec = isToken0In ? cfg.dec0 : cfg.dec1;
  const price = isToken0In ? cfg.price0 : cfg.price1;
  return parseFloat(formatUnits(rawIn, dec)) * price;
}

interface ScanArgs {
  client: PublicClient;
  pairs: `0x${string}`[];
  includeCircle: boolean;
  allTime: boolean;
}

/**
 * Pure scan. Multi-address eth_getLogs collapses the 3-pair scan into
 * one RPC call per chunk. Fail-loud on > 5% chunk failure so React
 * Query doesn't cache partial scans.
 */
async function scanVolume(args: ScanArgs): Promise<number> {
  const { client, pairs, includeCircle, allTime } = args;
  const latest = await client.getBlockNumber();
  const distributorLc = LIFTUP_REWARD_DISTRIBUTOR.toLowerCase();
  const pairLcs = new Set(pairs.map((p) => p.toLowerCase()));

  let windowFloor: bigint;
  let maxChunks: number;
  if (allTime) {
    windowFloor = DEPLOY_BLOCK_FLOOR;
    maxChunks = await computeAllTimeChunks(client);
  } else {
    const blockTimeSec = await measureBlockTime(client);
    const windowBlocks = computeWindowBlocks(blockTimeSec, WINDOW_DAYS);
    windowFloor = latest > windowBlocks ? latest - windowBlocks : 0n;
    maxChunks = computeWindowChunks(windowBlocks);
  }

  let total = 0;
  let attempted = 0;
  let failed = 0;

  for (let i = 0; i < maxChunks; i++) {
    const toBlock = latest - BigInt(i) * CHUNK_BLOCKS;
    if (toBlock <= windowFloor) break;
    const fromBlock =
      toBlock > CHUNK_BLOCKS ? toBlock - CHUNK_BLOCKS + 1n : 0n;
    const effectiveFrom = fromBlock > windowFloor ? fromBlock : windowFloor;
    if (effectiveFrom > toBlock) break;

    attempted++;
    try {
      const queries: Promise<unknown>[] = [
        client.getLogs({
          address: pairs,
          event: SWAP_EVENT,
          fromBlock: effectiveFrom,
          toBlock,
        }),
      ];
      if (includeCircle) {
        // Circle App Kit's 10 bps customFee is sent to LIFTUP_REWARD_DISTRIBUTOR
        // as USDC, EURC, or cirBTC (depending on what the user swapped).
        queries.push(
          client.getLogs({
            address: USDC_ON_ARC,
            event: TRANSFER_EVENT,
            args: { to: LIFTUP_REWARD_DISTRIBUTOR },
            fromBlock: effectiveFrom,
            toBlock,
          }),
          client.getLogs({
            address: EURC_ON_ARC,
            event: TRANSFER_EVENT,
            args: { to: LIFTUP_REWARD_DISTRIBUTOR },
            fromBlock: effectiveFrom,
            toBlock,
          }),
          client.getLogs({
            address: CIRBTC_ON_ARC,
            event: TRANSFER_EVENT,
            args: { to: LIFTUP_REWARD_DISTRIBUTOR },
            fromBlock: effectiveFrom,
            toBlock,
          }),
        );
      }
      const results = await Promise.all(queries);

      const poolLogs = results[0] as (Log & {
        address: `0x${string}`;
        args: {
          amount0In: bigint;
          amount1In: bigint;
          amount0Out: bigint;
          amount1Out: bigint;
        };
      })[];
      for (const l of poolLogs) total += swapUsdValue(l);

      if (includeCircle && results.length > 1) {
        const sumFeesUsd = (
          logs: (Log & { args: { from: `0x${string}`; value: bigint } })[],
          dec: number,
          priceUsd: number,
        ) => {
          let s = 0;
          for (const l of logs) {
            const fromLc = l.args.from.toLowerCase();
            // Skip when the fee came from our own pool (would double-count)
            // or from the distributor itself (recursion).
            if (pairLcs.has(fromLc) || fromLc === distributorLc) continue;
            s +=
              parseFloat(formatUnits(l.args.value, dec)) *
              priceUsd *
              CIRCLE_FEE_TO_VOLUME;
          }
          return s;
        };
        const usdcFee = results[1] as (Log & {
          args: { from: `0x${string}`; value: bigint };
        })[];
        const eurcFee = results[2] as (Log & {
          args: { from: `0x${string}`; value: bigint };
        })[];
        const cirbtcFee = results[3] as (Log & {
          args: { from: `0x${string}`; value: bigint };
        })[];
        total += sumFeesUsd(usdcFee, 6, USDC.priceUsd);
        total += sumFeesUsd(eurcFee, 6, EURC.priceUsd);
        total += sumFeesUsd(cirbtcFee, 8, CIRBTC.priceUsd);
      }
    } catch (err) {
      failed++;
      console.warn('[liftup] useVolume24h chunk failed', err);
    }

    if (effectiveFrom === windowFloor) break;
  }

  if (attempted > 0 && failed / attempted > 0.05) {
    throw new Error(
      `[useVolume24h] ${failed}/${attempted} chunks failed — refusing partial result`,
    );
  }

  return total;
}

/**
 * Notional volume in USD. Two modes:
 *   - `pair = undefined` (default) → aggregates across ALL deployed
 *     LiftupPair contracts (registry-driven via DEPLOYED_PAIR_ADDRESSES).
 *   - `pair = 0x…` → restricts to a single pair (PoolRow per-pool stats).
 *
 * Each swap is valued in USD via its pair's decimals + priceUsd, looked
 * up from PAIR_CONFIGS_BY_ADDRESS. Adding a new pool to LIFTUP_POOLS in
 * lib/pools.ts automatically flows through here — no code changes.
 */
export function useVolume24h(
  pair?: `0x${string}`,
  options?: { includeCircle?: boolean; allTime?: boolean },
): { volumeUsd: number; loading: boolean } {
  const includeCircle = options?.includeCircle ?? true;
  const allTime = options?.allTime ?? false;
  const client = usePublicClient({ chainId: arcTestnet.id }) as
    | PublicClient
    | undefined;

  const pairs = pair ? [pair] : DEPLOYED_PAIR_ADDRESSES;

  const { data, isLoading } = useQuery({
    queryKey: [
      'liftup',
      'volume',
      'v7',
      pair?.toLowerCase() ?? 'all',
      allTime ? 'all-time' : `${WINDOW_DAYS}d`,
      includeCircle ? 'with-circle' : 'pool-only',
    ],
    queryFn: () =>
      scanVolume({
        client: client as PublicClient,
        pairs,
        includeCircle,
        allTime,
      }),
    enabled: !!client,
    staleTime: 60_000,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });

  return { volumeUsd: data ?? 0, loading: isLoading };
}
