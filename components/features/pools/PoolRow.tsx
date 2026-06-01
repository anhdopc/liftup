'use client';

import { ExternalLink, Star } from 'lucide-react';
import Link from 'next/link';
import { arcTestnet } from '@/lib/chains';
import { cn, formatNumber } from '@/lib/utils';
import { TokenIcon } from '@/components/features/swap/TokenIcon';
import { usePoolStats } from '@/hook/usePoolStats';
import { useVolume24h } from '@/hook/useVolume24h';
import { LIFTUP_PAIR_USDC_EURC } from '@/lib/liftupAmm';
import type { PoolEntry } from '@/lib/pools';

export interface PoolRowData {
  pool: PoolEntry;
  hasPosition: boolean;
}

export function PoolRow({
  pool,
  onAdd,
  onRemove,
  onStatsLoaded,
}: {
  pool: PoolEntry;
  onAdd: (pool: PoolEntry) => void;
  onRemove: (pool: PoolEntry) => void;
  onStatsLoaded?: (data: PoolRowData) => void;
}) {
  const deployed = pool.deployed !== false;
  const decA = pool.tokenA.native ? 6 : pool.tokenA.decimals;
  const decB = pool.tokenB.native ? 6 : pool.tokenB.decimals;

  const { stats } = usePoolStats(deployed ? pool.pair : LIFTUP_PAIR_USDC_EURC, {
    decA,
    decB,
    priceA: pool.tokenA.priceUsd ?? 1,
    priceB: pool.tokenB.priceUsd ?? 1,
  });

  const { volumeUsd, loading: volLoading } = useVolume24h(
    deployed ? (pool.pair as `0x${string}`) : LIFTUP_PAIR_USDC_EURC,
    { includeCircle: false },
  );

  const hasPosition = deployed && !!stats && stats.userLp > 0n;

  if (typeof onStatsLoaded === 'function') {
    queueMicrotask(() => onStatsLoaded({ pool, hasPosition }));
  }

  const explorer = `${arcTestnet.blockExplorers.default.url}/address/${pool.pair}`;

  return (
    <div className="grid grid-cols-[2fr_1fr_1fr_1.4fr_minmax(180px,1.4fr)] items-center gap-4 rounded-2xl border border-border bg-bg-surface/40 px-4 py-3 backdrop-blur transition-colors hover:border-brand-400/30">
      {/* Pool */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative flex shrink-0">
          <TokenIcon token={pool.tokenA} size={28} />
          <TokenIcon
            token={pool.tokenB}
            size={28}
            className="-ml-2 ring-2 ring-bg-base"
          />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-display text-sm font-semibold tracking-tight text-ink">
              {pool.tokenA.symbol} / {pool.tokenB.symbol}
            </span>
            <VersionChip version={pool.version} />
            {pool.pinned && (
              <span className="inline-flex items-center gap-1 rounded-md border border-gold-500/30 bg-gold-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-gold-500">
                <Star size={8} className="fill-current" />
                Pinned
              </span>
            )}
            {!deployed && (
              <span className="inline-flex items-center gap-1 rounded-md border border-violet-400/40 bg-violet-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-violet-400">
                Circle route only
              </span>
            )}
          </div>
          <div className="text-[11px] text-ink-subtle">
            {deployed
              ? `${(pool.feeBps / 100).toFixed(2)}% LP fee · Arc Testnet`
              : 'No LiftUp pool yet · swaps route through Circle App Kit'}
          </div>
        </div>
      </div>

      {/* TVL */}
      <div className="font-display text-sm tabular-nums text-ink">
        {!deployed ? (
          <span className="text-ink-subtle">—</span>
        ) : stats ? (
          `$${formatNumber(stats.tvlUsdc, stats.tvlUsdc < 1 ? 4 : 2)}`
        ) : (
          <span className="text-ink-subtle">—</span>
        )}
      </div>

      {/* 7d Volume */}
      <div className="font-display text-sm tabular-nums text-ink">
        {!deployed ? (
          <span className="text-ink-subtle">—</span>
        ) : volLoading && volumeUsd === 0 ? (
          <span className="text-ink-subtle">—</span>
        ) : volumeUsd > 0 ? (
          `$${formatNumber(volumeUsd, volumeUsd < 100 ? 2 : 0)}`
        ) : (
          <span className="text-ink-subtle">$0</span>
        )}
      </div>

      {/* Price */}
          <div className="text-xs leading-relaxed text-ink-muted">
              {!deployed ? (
                  <span className="text-ink-subtle">live via Circle App Kit</span>
              ) : stats && stats.priceEurcPerUsdc > 0 ? (
                  <>
                      {/* 1 TokenA = ? TokenB */}
                      <div className="tabular-nums">
                          1 {pool.tokenA.symbol} ={' '}
                          {formatNumber(stats.priceEurcPerUsdc, decB >= 8 ? 8 : 6)}{' '}
                          {pool.tokenB.symbol}
                      </div>
                      {/* 1 TokenB = ? TokenA */}
                      <div className="tabular-nums text-ink-subtle">
                          1 {pool.tokenB.symbol} ={' '}
                          {formatNumber(
                              1 / stats.priceEurcPerUsdc,
                              decA >= 8 ? 8 : 6
                          )}{' '}
                          {pool.tokenA.symbol}
                      </div>
                  </>
              ) : (
                  <span className="text-ink-subtle">—</span>
              )}
          </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => onAdd(pool)}
          className="rounded-lg border border-brand-400/40 bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-400 transition-colors hover:bg-brand-500/20"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => onRemove(pool)}
          disabled={!hasPosition}
          className={cn(
            'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
            hasPosition
              ? 'border-border text-ink hover:border-border-strong hover:bg-bg-elevated/40'
              : 'border-border text-ink-subtle cursor-not-allowed opacity-50',
          )}
        >
          Remove
        </button>
        {deployed && (
          <Link
            href={explorer}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle hover:text-brand-400"
            aria-label="View on ArcScan"
          >
            <ExternalLink size={13} />
          </Link>
        )}
      </div>
    </div>
  );
}

function VersionChip({ version }: { version: 'V2' | 'V3' }) {
  return (
    <span
      className={cn(
        'rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        version === 'V2'
          ? 'border-brand-400/40 bg-brand-500/10 text-brand-400'
          : 'border-violet-400/40 bg-violet-500/10 text-violet-400',
      )}
    >
      {version}
    </span>
  );
}