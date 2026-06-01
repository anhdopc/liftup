'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Search, Trophy, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LIFTUP_POOLS, type PoolEntry } from '@/lib/pools';
import { PoolRow, type PoolRowData } from './PoolRow';
import { LiquidityModal, type LiquidityMode } from './LiquidityModal';

type Tab = 'all' | 'my';

export function PoolsClient() {
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<{ open: boolean; mode: LiquidityMode; pool: PoolEntry | null }>(
    { open: false, mode: 'add', pool: null },
  );

  // Track which pools have a user position, populated by row-level callbacks.
  const [positionMap, setPositionMap] = useState<Record<string, boolean>>({});
  const onStatsLoaded = useCallback((row: PoolRowData) => {
    setPositionMap((prev) =>
      prev[row.pool.id] === row.hasPosition ? prev : { ...prev, [row.pool.id]: row.hasPosition },
    );
  }, []);

  const myPoolsCount = useMemo(
    () => Object.values(positionMap).filter(Boolean).length,
    [positionMap],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LIFTUP_POOLS.filter((p) => {
      const matchesTab = tab === 'all' ? true : positionMap[p.id] === true;
      if (!matchesTab) return false;
      if (!q) return true;
      return (
        p.tokenA.symbol.toLowerCase().includes(q) ||
        p.tokenB.symbol.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    });
  }, [tab, query, positionMap]);

  const openAdd = (pool: PoolEntry) => setModal({ open: true, mode: 'add', pool });
  const openRemove = (pool: PoolEntry) => setModal({ open: true, mode: 'remove', pool });
  const closeModal = () => setModal((m) => ({ ...m, open: false }));

  return (
    <div className="space-y-4">
      <div className="px-1 pb-1">
        <h1 className="font-display text-xl font-semibold tracking-tight">Pools</h1>
        <p className="text-xs text-ink-muted">
          Provide stablecoin liquidity · 100% of the{' '}
          <span className="text-brand-400">0.05%</span> swap fee flows to the on-chain RewardDistributor
        </p>
      </div>

      {/* Reward callout: adding liquidity here qualifies you for the LiftUp
          LP reward tiers (see /reward for full mechanics). */}
      <Link
        href="/reward#lp-rewards"
        className="group flex items-center justify-between gap-3 rounded-2xl border border-brand-400/30 bg-brand-500/[0.04] px-4 py-3 backdrop-blur transition-colors hover:border-brand-400/50 hover:bg-brand-500/[0.07]"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-400/40 bg-bg-base text-brand-400">
            <Trophy size={15} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-ink">
              Adding liquidity here → you&apos;re in the LP reward tier system
            </div>
            <p className="text-xs text-ink-muted">
              0.05% swap fee → on-chain RewardDistributor → daily / weekly /
              monthly LP loyalty-weighted distributions. Your share of{' '}
              <span className="text-brand-400">90%</span> of protocol fees is
              weighted by your conviction tier and tenure.
            </p>
          </div>
        </div>
        <span className="hidden items-center gap-1 text-xs text-brand-400 sm:inline-flex">
          See reward model
          <ArrowRight
            size={12}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </Link>

      {/* Tabs */}
      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-bg-surface/40 p-1 backdrop-blur sm:max-w-md">
        <TabBtn
          label={`All Pools (${LIFTUP_POOLS.length})`}
          active={tab === 'all'}
          onClick={() => setTab('all')}
        />
        <TabBtn
          label={`My Pools (${myPoolsCount})`}
          active={tab === 'my'}
          onClick={() => setTab('my')}
        />
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-bg-surface/40 px-3 py-2.5 backdrop-blur">
        <Search size={14} className="text-ink-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by pair or token"
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
        />
      </div>

      {/* Table header — column tracks use the SAME minmax() recipe as
          the row below so the auto-sized Actions cluster can't shrink
          the other columns differently between the two rows. With
          identical track widths, header and row content actually align. */}
      <div className="hidden grid-cols-[2fr_1fr_1fr_1.4fr_minmax(180px,1.4fr)] gap-4 px-4 pb-1 font-display text-[11px] font-medium uppercase tracking-wider text-ink-subtle md:grid">
        <div>Pool</div>
        <div>TVL</div>
        <div>7d Volume</div>
        <div>Price</div>
        <div className="text-right">Actions</div>
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-border bg-bg-surface/30 p-10 text-center text-sm text-ink-muted">
            {tab === 'my'
              ? "You haven't provided liquidity to any pool yet."
              : 'No pools match this search.'}
          </div>
        ) : (
          filtered.map((pool) => (
            <PoolRow
              key={pool.id}
              pool={pool}
              onAdd={openAdd}
              onRemove={openRemove}
              onStatsLoaded={onStatsLoaded}
            />
          ))
        )}
      </div>

      <LiquidityModal
        open={modal.open}
        mode={modal.mode}
        pool={modal.pool}
        onClose={closeModal}
      />
    </div>
  );
}

function TabBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-bg-elevated text-ink shadow-glow'
          : 'text-ink-muted hover:text-ink',
      )}
    >
      {label}
    </button>
  );
}
