'use client';

import Link from 'next/link';
import { Droplets } from 'lucide-react';
import { LIFTUP_POOLS } from '@/lib/pools';
import { cn, formatNumber } from '@/lib/utils';
import { TokenIcon } from '@/components/features/swap/TokenIcon';
import { usePoolStats } from '@/hook/usePoolStats';
import type { PoolEntry } from '@/lib/pools';

export function PositionsCard() {
  // For now LIFTUP_POOLS has a single entry. When that grows we can map.
  return (
    <div className="rounded-2xl border border-border bg-bg-surface/40 p-5 backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Droplets size={14} className="text-brand-400" />
          <h2 className="font-display text-sm font-semibold tracking-tight">
            Your LP positions
          </h2>
        </div>
        <Link
          href="/liquidity"
          className="text-[11px] uppercase tracking-wider text-brand-400 hover:underline"
        >
          Manage on /liquidity ↗
        </Link>
      </div>

      <div className="mt-4 space-y-2">
        {LIFTUP_POOLS.map((pool) => (
          <PositionRow key={pool.id} pool={pool} />
        ))}
      </div>
    </div>
  );
}

function PositionRow({ pool }: { pool: PoolEntry }) {
  const { stats } = usePoolStats(pool.pair);
  const hasPosition = !!stats && stats.userLp > 0n;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-xl border bg-bg-base/40 px-3 py-3',
        hasPosition ? 'border-brand-400/30' : 'border-border',
      )}
    >
      <div className="flex items-center gap-3">
        <div className="relative flex shrink-0">
          <TokenIcon token={pool.tokenA} size={26} />
          <TokenIcon
            token={pool.tokenB}
            size={26}
            className="-ml-2 ring-2 ring-bg-base"
          />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-display text-sm font-medium text-ink">
              {pool.tokenA.symbol} / {pool.tokenB.symbol}
            </span>
            <span className="rounded-md border border-brand-400/40 bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-400">
              {pool.version}
            </span>
          </div>
          <div className="text-[11px] text-ink-subtle">
            {(pool.feeBps / 100).toFixed(2)}% LP fee
          </div>
        </div>
      </div>
      <div className="text-right text-xs">
        {hasPosition ? (
          <>
            <div className="font-display text-sm font-medium text-ink">
              {formatNumber(stats!.userUsdc, 4)} {pool.tokenA.symbol}
              <span className="text-ink-subtle"> + </span>
              {formatNumber(stats!.userEurc, 4)} {pool.tokenB.symbol}
            </div>
            <div className="text-ink-subtle">
              {(stats!.userShare * 100).toFixed(4)}% of pool
            </div>
          </>
        ) : (
          <span className="text-ink-subtle">No position</span>
        )}
      </div>
    </div>
  );
}
