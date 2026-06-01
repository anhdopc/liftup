'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { PoolEntry } from '@/lib/pools';
import { usePoolStats } from '@/hook/usePoolStats';
import { AddLiquidityForm } from './AddLiquidityForm';
import { RemoveLiquidityForm } from './RemoveLiquidityForm';

export type LiquidityMode = 'add' | 'remove';

export function LiquidityModal({
  open,
  mode,
  pool,
  onClose,
}: {
  open: boolean;
  mode: LiquidityMode;
  pool: PoolEntry | null;
  onClose: () => void;
}) {
  const decA = pool ? (pool.tokenA.native ? 6 : pool.tokenA.decimals) : 6;
  const decB = pool ? (pool.tokenB.native ? 6 : pool.tokenB.decimals) : 6;
  const priceA = pool?.tokenA.priceUsd ?? 1;
  const priceB = pool?.tokenB.priceUsd ?? 1;

  const { stats, refetch } = usePoolStats(pool?.pair, {
    decA,
    decB,
    priceA,
    priceB,
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !pool) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'add' ? 'Add liquidity' : 'Remove liquidity'}
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-bg-base/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-bg-surface shadow-card-lift">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="font-display text-base font-semibold tracking-tight">
              {mode === 'add' ? 'Add liquidity' : 'Remove liquidity'}
            </h3>
            <p className="mt-0.5 text-xs text-ink-muted">
              {pool.tokenA.symbol} / {pool.tokenB.symbol} · {pool.version} ·{' '}
              {(pool.feeBps / 100).toFixed(2)}% fee
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-bg-elevated/60 hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[80vh] overflow-y-auto p-5">
          {mode === 'add' ? (
            <AddLiquidityForm pool={pool} stats={stats} onSuccess={refetch} />
          ) : (
            <RemoveLiquidityForm pool={pool} stats={stats} onSuccess={refetch} />
          )}
        </div>
      </div>
    </div>
  );
}