'use client';

import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import {
  parseAbiItem,
  formatUnits,
  hexToString,
  type Log,
  type PublicClient,
} from 'viem';
import { arcTestnet } from '@/lib/chains';
import { LIFTUP_REWARD_DISTRIBUTOR } from '@/lib/liftupAmm';
import { USDC_ON_ARC, EURC_ON_ARC } from '@/lib/tokens';
import {
  DEPLOY_BLOCK_FLOOR,
  CHUNK_BLOCKS,
  computeAllTimeChunks,
  measureBlockTime,
} from './lib/scanWindow';

const DISTRIBUTED_EVENT = parseAbiItem(
  'event Distributed(bytes32 indexed bucket, address indexed token, address indexed recipient, uint256 amount)',
);

const TOKEN_DECIMALS = 6;

export type WinnerBucket = 'daily' | 'weekly' | 'monthly' | 'bonus' | 'growth' | 'unknown';

export interface DistributionEvent {
  bucket: WinnerBucket;
  token: 'USDC' | 'EURC' | 'OTHER';
  recipient: `0x${string}`;
  amount: number;
  txHash: `0x${string}`;
  blockNumber: bigint;
  timestamp: number;
}

export interface TopRecipient {
  recipient: `0x${string}`;
  totalUsd: number;
  payoutCount: number;
  lastWonAt: number;
  lastTxHash: `0x${string}`;
  buckets: WinnerBucket[];
}

interface Options {
  chunks?: number;
  recentLimit?: number;
}

interface ScanResult {
  totalUsd: number;
  recent: DistributionEvent[];
  topRecipients: TopRecipient[];
  uniqueRecipientCount: number;
}

async function scanRewardsDistributed(
  client: PublicClient,
  chunks: number | undefined,
  recentLimit: number,
): Promise<ScanResult> {
  const latestBlock = await client.getBlock();
  const latestNumber = latestBlock.number ?? (await client.getBlockNumber());
  const latestTs = Number(latestBlock.timestamp);
  const blockTimeSec = await measureBlockTime(client);
  const effectiveChunks = chunks ?? (await computeAllTimeChunks(client));

  const tsFor = (bn: bigint): number =>
    latestTs - Number(latestNumber - bn) * blockTimeSec;

  const usdcLc = USDC_ON_ARC.toLowerCase();
  const eurcLc = EURC_ON_ARC.toLowerCase();

  let total = 0;
  const all: DistributionEvent[] = [];
  let attempted = 0;
  let failed = 0;

  let toBlock = latestNumber;
  let scanned = 0;
  while (toBlock > DEPLOY_BLOCK_FLOOR && scanned < effectiveChunks) {
    const fromBlockRaw =
      toBlock > CHUNK_BLOCKS ? toBlock - CHUNK_BLOCKS + 1n : 0n;
    const fromBlock =
      fromBlockRaw < DEPLOY_BLOCK_FLOOR ? DEPLOY_BLOCK_FLOOR : fromBlockRaw;
    attempted++;
    try {
      const evs = (await client.getLogs({
        address: LIFTUP_REWARD_DISTRIBUTOR,
        event: DISTRIBUTED_EVENT,
        fromBlock,
        toBlock,
      })) as (Log & {
        args: {
          bucket: `0x${string}`;
          token: `0x${string}`;
          recipient: `0x${string}`;
          amount: bigint;
        };
      })[];

      for (const e of evs) {
        const tokenLc = e.args.token.toLowerCase();
        const tokenLabel: DistributionEvent['token'] =
          tokenLc === usdcLc ? 'USDC' : tokenLc === eurcLc ? 'EURC' : 'OTHER';
        const amt = parseFloat(formatUnits(e.args.amount, TOKEN_DECIMALS));
        total += amt;
        all.push({
          bucket: decodeBucket(e.args.bucket),
          token: tokenLabel,
          recipient: e.args.recipient,
          amount: amt,
          txHash: e.transactionHash as `0x${string}`,
          blockNumber: e.blockNumber as bigint,
          timestamp: tsFor(e.blockNumber as bigint),
        });
      }
    } catch (err) {
      failed++;
      console.warn('[liftup] useRewardsDistributed chunk failed', err);
    }
    if (fromBlock <= DEPLOY_BLOCK_FLOOR) break;
    toBlock = fromBlock - 1n;
    scanned++;
  }

  // Fail-loud on partial scans — keeps the unique-recipients monotonic.
  if (attempted > 0 && failed / attempted > 0.05) {
    throw new Error(
      `[useRewardsDistributed] ${failed}/${attempted} chunks failed — refusing partial result`,
    );
  }

  const sorted = all.sort((a, b) =>
    a.blockNumber === b.blockNumber ? 0 : a.blockNumber > b.blockNumber ? -1 : 1,
  );
  const recent = sorted.slice(0, recentLimit);

  // Per-recipient aggregation for the leaderboard.
  const byRecipient = new Map<
    string,
    {
      recipient: `0x${string}`;
      totalUsd: number;
      payoutCount: number;
      lastWonAt: number;
      lastTxHash: `0x${string}`;
      buckets: Set<WinnerBucket>;
    }
  >();
  for (const e of all) {
    const key = e.recipient.toLowerCase();
    const cur = byRecipient.get(key);
    if (cur) {
      cur.totalUsd += e.amount;
      cur.payoutCount += 1;
      if (e.timestamp > cur.lastWonAt) {
        cur.lastWonAt = e.timestamp;
        cur.lastTxHash = e.txHash;
      }
      cur.buckets.add(e.bucket);
    } else {
      byRecipient.set(key, {
        recipient: e.recipient,
        totalUsd: e.amount,
        payoutCount: 1,
        lastWonAt: e.timestamp,
        lastTxHash: e.txHash,
        buckets: new Set([e.bucket]),
      });
    }
  }
  const topRecipients: TopRecipient[] = [...byRecipient.values()]
    .map((r) => ({
      recipient: r.recipient,
      totalUsd: r.totalUsd,
      payoutCount: r.payoutCount,
      lastWonAt: r.lastWonAt,
      lastTxHash: r.lastTxHash,
      buckets: [...r.buckets],
    }))
    .sort((a, b) => b.totalUsd - a.totalUsd)
    .slice(0, 10);

  return {
    totalUsd: total,
    recent,
    topRecipients,
    uniqueRecipientCount: byRecipient.size,
  };
}

/**
 * Reads Distributed events from the on-chain RewardDistributor. Returns
 * total USD distributed, recent events, top-10 recipients leaderboard,
 * and unique-recipient count.
 *
 * Single distributor contract → no per-pair config needed (all 3 pairs
 * settle to this one contract). Deduplicated via TanStack Query so
 * Hero + CommunityStats share a single scan instead of running
 * independent polls that produce inconsistent recipient counts.
 */
export function useRewardsDistributed(options?: Options): {
  totalUsd: number;
  recent: DistributionEvent[];
  topRecipients: TopRecipient[];
  uniqueRecipientCount: number;
  loading: boolean;
} {
  // No default for chunks — undefined → scanRewardsDistributed auto-sizes
  // to the full deploy-to-latest range via computeAllTimeChunks.
  const chunks = options?.chunks;
  const recentLimit = options?.recentLimit ?? 15;
  const client = usePublicClient({ chainId: arcTestnet.id }) as
    | PublicClient
    | undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['liftup', 'rewards-distributed', 'v7', chunks ?? 'auto', recentLimit],
    queryFn: () =>
      scanRewardsDistributed(client as PublicClient, chunks, recentLimit),
    enabled: !!client,
    staleTime: 60_000,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });

  return {
    totalUsd: data?.totalUsd ?? 0,
    recent: data?.recent ?? [],
    topRecipients: data?.topRecipients ?? [],
    uniqueRecipientCount: data?.uniqueRecipientCount ?? 0,
    loading: isLoading,
  };
}

function decodeBucket(raw: `0x${string}`): WinnerBucket {
  try {
    const s = hexToString(raw, { size: 32 }).replace(/ +$/, '');
    if (s === 'daily' || s === 'weekly' || s === 'monthly' || s === 'bonus' || s === 'growth') {
      return s;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
