'use client';

import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { parseAbiItem, formatUnits, type Log, type PublicClient } from 'viem';
import { arcTestnet } from '@/lib/chains';
import {
  LIFTUP_FACTORY,
  LIFTUP_ROUTER,
  LIFTUP_REWARD_DISTRIBUTOR,
} from '@/lib/liftupAmm';
import { DEPLOYED_PAIRS, DEPLOYED_PAIR_ADDRESSES } from '@/lib/pools';
import {
  DEPLOY_BLOCK_FLOOR,
  CHUNK_BLOCKS,
  computeAllTimeChunks,
} from './lib/scanWindow';

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

const PAIR_BALANCE_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalSupply',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getReserves',
    inputs: [],
    outputs: [
      { name: 'reserve0', type: 'uint112' },
      { name: 'reserve1', type: 'uint112' },
      { name: 'ts', type: 'uint32' },
    ],
    stateMutability: 'view',
  },
] as const;

const ZERO = '0x0000000000000000000000000000000000000000';
const DEAD = '0x000000000000000000000000000000000000dead';

export type LpTier = 'Sprout' | 'Climber' | 'Summit' | 'Below';

export interface TopLp {
  address: `0x${string}`;
  /** Aggregate LP balance summed across pools (NOT comparable across pairs). */
  lpBalance: bigint;
  /** Aggregate share weighted by pool TVL. 0-100. */
  lpShare: number;
  /** USD value of LP across ALL pools. */
  usdcValue: number;
  tier: LpTier;
}

function tierFromUsdc(usdc: number): LpTier {
  if (usdc < 100) return 'Below';
  if (usdc <= 1000) return 'Sprout';
  if (usdc <= 5000) return 'Climber';
  return 'Summit';
}

interface Options {
  chunks?: number;
  limit?: number;
}

interface ScanArgs {
  client: PublicClient;
  chunks?: number;
}

async function scanTopLps(args: ScanArgs): Promise<TopLp[]> {
  const { client } = args;
  const latest = await client.getBlockNumber();
  const chunks = args.chunks ?? (await computeAllTimeChunks(client));

  // 1. Read pool state for each deployed pool — gives us per-pool USD TVL
  //    and totalSupply for share math.
  const poolStates = await Promise.all(
    DEPLOYED_PAIRS.map(async (p) => {
      const [r0, r1] = (await client.readContract({
        address: p.pair,
        abi: PAIR_BALANCE_ABI,
        functionName: 'getReserves',
      })) as readonly [bigint, bigint, number];
      const totalSupply = (await client.readContract({
        address: p.pair,
        abi: PAIR_BALANCE_ABI,
        functionName: 'totalSupply',
      })) as bigint;
      const r0Float = parseFloat(formatUnits(r0, p.dec0));
      const r1Float = parseFloat(formatUnits(r1, p.dec1));
      const tvlUsd = r0Float * p.price0 + r1Float * p.price1;
      return { ...p, totalSupply, tvlUsd };
    }),
  );

  // 2. Multi-address Transfer scan to collect candidate addresses that
  //    ever held LP in ANY deployed pool.
  const candidates = new Set<string>();
  let toBlock = latest;
  let scanned = 0;
  let attempted = 0;
  let failed = 0;
  while (toBlock > DEPLOY_BLOCK_FLOOR && scanned < chunks) {
    const fromBlockRaw =
      toBlock > CHUNK_BLOCKS ? toBlock - CHUNK_BLOCKS + 1n : 0n;
    const fromBlock =
      fromBlockRaw < DEPLOY_BLOCK_FLOOR ? DEPLOY_BLOCK_FLOOR : fromBlockRaw;
    attempted++;
    try {
      const evs = (await client.getLogs({
        address: DEPLOYED_PAIR_ADDRESSES,
        event: TRANSFER_EVENT,
        fromBlock,
        toBlock,
      })) as (Log & {
        args: { from: `0x${string}`; to: `0x${string}`; value: bigint };
      })[];
      for (const e of evs) {
        candidates.add(e.args.from.toLowerCase());
        candidates.add(e.args.to.toLowerCase());
      }
    } catch (err) {
      failed++;
      console.warn('[liftup] useTopLps Transfer chunk failed', err);
    }
    if (fromBlock <= DEPLOY_BLOCK_FLOOR) break;
    toBlock = fromBlock - 1n;
    scanned++;
  }

  if (attempted > 0 && failed / attempted > 0.05) {
    throw new Error(
      `[useTopLps] ${failed}/${attempted} Transfer chunks failed — refusing partial result`,
    );
  }

  // 3. Strip infra addresses.
  const infra = new Set<string>([
    ZERO,
    DEAD,
    LIFTUP_FACTORY.toLowerCase(),
    LIFTUP_ROUTER.toLowerCase(),
    LIFTUP_REWARD_DISTRIBUTOR.toLowerCase(),
    ...DEPLOYED_PAIR_ADDRESSES.map((a) => a.toLowerCase()),
  ]);
  const eligible = [...candidates].filter((a) => !infra.has(a));

  // 4. For each candidate, read balanceOf on each pool. Aggregate USD
  //    value across pools. Share % weighted by pool TVL so a 50% holder
  //    in a $1 pool doesn't dominate a 1% holder in a $1M pool.
  const rowsRaw: TopLp[] = [];
  for (const addr of eligible) {
    let totalUsd = 0;
    let totalLpRaw = 0n;
    let weightedSharePctSum = 0;
    let weightSum = 0;
    for (const ps of poolStates) {
      if (ps.totalSupply === 0n) continue;
      const lp = (await client.readContract({
        address: ps.pair,
        abi: PAIR_BALANCE_ABI,
        functionName: 'balanceOf',
        args: [addr as `0x${string}`],
      })) as bigint;
      if (lp === 0n) continue;
      const sharePct = Number((lp * 1_000_000n) / ps.totalSupply) / 10_000;
      const usdVal = (ps.tvlUsd * sharePct) / 100;
      totalUsd += usdVal;
      totalLpRaw += lp;
      weightedSharePctSum += sharePct * ps.tvlUsd;
      weightSum += ps.tvlUsd;
    }
    if (totalUsd === 0) continue;
    const aggregateShare = weightSum > 0 ? weightedSharePctSum / weightSum : 0;
    rowsRaw.push({
      address: addr as `0x${string}`,
      lpBalance: totalLpRaw,
      lpShare: aggregateShare,
      usdcValue: totalUsd,
      tier: tierFromUsdc(totalUsd),
    });
  }

  return rowsRaw.sort((a, b) => b.usdcValue - a.usdcValue);
}

/**
 * Leaderboard of LP holders ranked by USD-equivalent value across ALL
 * deployed pools. Registry-driven via DEPLOYED_PAIRS in lib/pools.ts —
 * adding a new pool there automatically extends the scan.
 *
 * Deduplicated via TanStack Query.
 */
export function useTopLps(options?: Options): {
  rows: TopLp[];
  loading: boolean;
} {
  // Undefined chunks → scanTopLps auto-sizes via computeAllTimeChunks.
  const chunks = options?.chunks;
  const limit = options?.limit ?? 10;
  const client = usePublicClient({ chainId: arcTestnet.id }) as
    | PublicClient
    | undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['liftup', 'top-lps', 'v7', chunks ?? 'auto'],
    queryFn: () => scanTopLps({ client: client as PublicClient, chunks }),
    enabled: !!client,
    staleTime: 60_000,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });

  return { rows: (data ?? []).slice(0, limit), loading: isLoading };
}
