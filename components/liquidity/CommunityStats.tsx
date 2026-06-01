'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Coins,
  TrendingUp,
  Users,
  Trophy,
  Loader2,
  ExternalLink,
  Droplets,
} from 'lucide-react';
import { arcTestnet } from '@/lib/chains';
import { formatNumber, formatCompact, shortenAddress } from '@/lib/utils';
import { useLandingStats } from '@/hook/useLandingStats';
import { useActiveUsers } from '@/hook/useActiveUsers';
import { useVolume24h } from '@/hook/useVolume24h';
import { useTopSwappers, type TopSwapper } from '@/hook/useTopSwappers';
import { useTopLps, type TopLp } from '@/hook/useTopLps';
import {
  useRewardsDistributed,
  type DistributionEvent,
  type TopRecipient,
} from '@/hook/useRewardsDistributed';

type Tab = 'swappers' | 'lps' | 'winners';

/**
 * Community stats block.
 *
 * KPI grid : TVL · 7d volume · active users · rewards distributed
 *            (last one reads live from Distributed events)
 * Tabs     : Top swappers · Top LPs · Winners — all three populated
 *            from on-chain events, no placeholder text remaining
 *            now that the distributor + lottery payouts are live.
 */
export function CommunityStats() {
  const [tab, setTab] = useState<Tab>('swappers');

  const { tvlUsd, hasData: tvlReady } = useLandingStats();
  const { count: activeUsers, loading: usersLoading } = useActiveUsers();
  const { volumeUsd, loading: volumeLoading } = useVolume24h();
  // No `chunks` override — both hooks default to a 1200-chunk all-time
  // scan, which is what the footnotes ("scanned from contract deploy",
  // "Top 10 earners all-time") already promise. The previous chunks: 32
  // limit was sized for a 2 sec/block guess and only covered ~2 days at
  // Arc's actual ~0.6 sec block time, so leaderboards were silently
  // truncated to recent activity.
  const { rows: topSwappers, loading: swappersLoading } = useTopSwappers({ limit: 10 });
  const { rows: topLps, loading: lpsLoading } = useTopLps({ limit: 10 });
  const {
    totalUsd: rewardsUsd,
    topRecipients,
    uniqueRecipientCount,
    loading: rewardsLoading,
  } = useRewardsDistributed();

  const stats = [
    {
      label: 'Total TVL',
      value: tvlReady ? `$${formatCompact(tvlUsd)}` : '—',
      icon: Coins,
      tone: 'brand' as const,
    },
    {
      label: '7d swap volume',
      value: volumeLoading ? '—' : `$${formatCompact(volumeUsd)}`,
      icon: TrendingUp,
      tone: 'violet' as const,
    },
    {
      label: 'Active users',
      value: usersLoading ? '—' : formatCompact(activeUsers),
      icon: Users,
      tone: 'brand' as const,
    },
    {
      label: 'Rewards distributed',
      value: rewardsLoading
        ? '—'
        : rewardsUsd > 0
          ? `$${formatCompact(rewardsUsd)}`
          : '$0',
      sub: rewardsLoading
        ? 'reading on-chain'
        : `${uniqueRecipientCount} unique users all-time`,
      icon: Trophy,
      tone: 'gold' as const,
    },
  ];

  return (
    <section id="community" className="relative py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-gold-500">
            Community stats
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            <span className="text-gradient-lift">On-chain leaderboards</span>, in real time.
          </h2>
          <p className="mt-4 text-ink-muted">
            Every swap, every LP add, every distribution — surfaced from the
            same event logs anyone can read on ArcScan. No private dashboards,
            no hidden APR.
          </p>
        </div>

        {/* KPI grid */}
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="rounded-2xl border border-border bg-bg-surface/40 px-5 py-5 backdrop-blur"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-[0.18em] text-ink-muted">
                  {s.label}
                </span>
                <s.icon
                  size={14}
                  className={
                    s.tone === 'brand'
                      ? 'text-brand-400'
                      : s.tone === 'violet'
                        ? 'text-violet-400'
                        : 'text-gold-500'
                  }
                />
              </div>
              <div className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                {s.value}
              </div>
              {s.sub && (
                <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
                  {s.sub}
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Tab bar */}
        <div className="mt-10 flex gap-1 rounded-2xl border border-border bg-bg-surface/40 p-1 backdrop-blur sm:max-w-md">
          <TabBtn
            label="Top swappers"
            active={tab === 'swappers'}
            onClick={() => setTab('swappers')}
          />
          <TabBtn
            label="Top LPs"
            active={tab === 'lps'}
            onClick={() => setTab('lps')}
            small
          />
          <TabBtn
            label="Top earners"
            active={tab === 'winners'}
            onClick={() => setTab('winners')}
            small
          />
        </div>

        {/* Tab content */}
        <div className="mt-4 overflow-hidden rounded-3xl border border-border bg-bg-surface/40 backdrop-blur">
          {tab === 'swappers' && (
            <SwappersTable rows={topSwappers} loading={swappersLoading} />
          )}
          {tab === 'lps' && <LpsTable rows={topLps} loading={lpsLoading} />}
          {tab === 'winners' && (
            <WinnersTable rows={topRecipients} loading={rewardsLoading} />
          )}
        </div>
      </div>
    </section>
  );
}

function TabBtn({
  label,
  active,
  onClick,
  small,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl px-3 py-2 ${small ? 'text-xs' : 'text-sm'} font-medium transition-colors ${
        active
          ? 'bg-bg-elevated text-ink shadow-glow'
          : 'text-ink-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Swappers table
// ─────────────────────────────────────────────────────────────

function SwappersTable({
  rows,
  loading,
}: {
  rows: TopSwapper[];
  loading: boolean;
}) {
  if (loading && rows.length === 0) {
    return (
      <LoadingState label="Loading swap leaderboard…" />
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        label="No swaps tracked on the LiftUp Pool in the recent window."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-base/40 text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
            <th className="py-3 pl-5 pr-2 text-left font-medium">#</th>
            <th className="px-2 py-3 text-left font-medium">Wallet</th>
            <th className="px-2 py-3 text-right font-medium">Swaps</th>
            <th className="px-2 py-3 text-right font-medium">Volume (USD)</th>
            <th className="py-3 pl-2 pr-5 text-right font-medium">Link</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.address}
              className="border-b border-border/40 last:border-b-0 transition-colors hover:bg-bg-base/30"
            >
              <td className="py-3 pl-5 pr-2 text-ink-subtle tabular-nums">
                {String(i + 1).padStart(2, '0')}
              </td>
              <td className="px-2 py-3 font-mono text-xs text-ink">
                {shortenAddress(r.address, 6)}
                {i < 3 && <MedalPill rank={(i + 1) as 1 | 2 | 3} />}
              </td>
              <td className="px-2 py-3 text-right tabular-nums text-ink-muted">
                {r.swapCount}
              </td>
              <td className="px-2 py-3 text-right tabular-nums font-medium text-ink">
                ${formatNumber(r.volumeUsd, r.volumeUsd < 100 ? 2 : 0)}
              </td>
              <td className="py-3 pl-2 pr-5 text-right">
                <ArcScanLink address={r.address} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Footnote text="Ranked by USD-equivalent volume across all 3 LiftupPair contracts (USDC/EURC + USDC/cirBTC + EURC/cirBTC) · LiftUp Pool route only · refreshed every minute." />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LPs table
// ─────────────────────────────────────────────────────────────

function LpsTable({ rows, loading }: { rows: TopLp[]; loading: boolean }) {
  if (loading && rows.length === 0) {
    return <LoadingState label="Loading LP leaderboard…" />;
  }
  if (rows.length === 0) {
    return (
      <EmptyState label="No LP holders across any LiftUp pool yet — be the first." />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-base/40 text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
            <th className="py-3 pl-5 pr-2 text-left font-medium">#</th>
            <th className="px-2 py-3 text-left font-medium">Wallet</th>
            <th className="px-2 py-3 text-right font-medium">Pool %</th>
            <th className="px-2 py-3 text-right font-medium">LP value (USD)</th>
            <th className="px-2 py-3 text-right font-medium">Tier</th>
            <th className="py-3 pl-2 pr-5 text-right font-medium">Link</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.address}
              className="border-b border-border/40 last:border-b-0 transition-colors hover:bg-bg-base/30"
            >
              <td className="py-3 pl-5 pr-2 text-ink-subtle tabular-nums">
                {String(i + 1).padStart(2, '0')}
              </td>
              <td className="px-2 py-3 font-mono text-xs text-ink">
                {shortenAddress(r.address, 6)}
                {i < 3 && <MedalPill rank={(i + 1) as 1 | 2 | 3} />}
              </td>
              <td className="px-2 py-3 text-right tabular-nums text-ink-muted">
                {r.lpShare.toFixed(2)}%
              </td>
              <td className="px-2 py-3 text-right tabular-nums font-medium text-ink">
                ${formatNumber(r.usdcValue, r.usdcValue < 100 ? 2 : 0)}
              </td>
              <td className="px-2 py-3 text-right">
                <TierBadge tier={r.tier} />
              </td>
              <td className="py-3 pl-2 pr-5 text-right">
                <ArcScanLink address={r.address} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Footnote text="Top 10 LPs by aggregate USD value across all 3 pools (TVL × pool share, summed per wallet) · scanned from contract deploy · refreshed every minute." />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Winners table (Distributed events)
// ─────────────────────────────────────────────────────────────

function WinnersTable({
  rows,
  loading,
}: {
  rows: TopRecipient[];
  loading: boolean;
}) {
  // The hook already pre-aggregates by recipient and sorts by totalUsd;
  // we just drop dust totals so the table reflects "real" winners.
  const ranked = rows.filter((r) => r.totalUsd >= 0.0001);

  if (loading && ranked.length === 0) {
    return <LoadingState label="Reading Distributed events…" />;
  }
  if (ranked.length === 0) {
    return (
      <EmptyState label="No rewards distributed yet. Once the daily / weekly / monthly cron fires, top earners land here." />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-base/40 text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
            <th className="py-3 pl-5 pr-2 text-left font-medium">#</th>
            <th className="px-2 py-3 text-left font-medium">Recipient</th>
            <th className="px-2 py-3 text-left font-medium">Buckets earned</th>
            <th className="px-2 py-3 text-right font-medium">Payouts</th>
            <th className="px-2 py-3 text-right font-medium">Total earned</th>
            <th className="px-2 py-3 text-right font-medium">Last earned</th>
            <th className="py-3 pl-2 pr-5 text-right font-medium">Tx</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r, i) => (
            <tr
              key={r.recipient}
              className="border-b border-border/40 last:border-b-0 transition-colors hover:bg-bg-base/30"
            >
              <td className="py-3 pl-5 pr-2 font-display tabular-nums text-ink-subtle">
                {String(i + 1).padStart(2, '0')}
              </td>
              <td className="px-2 py-3 font-mono text-xs text-ink">
                {shortenAddress(r.recipient, 6)}
              </td>
              <td className="px-2 py-3">
                <div className="flex flex-wrap gap-1">
                  {r.buckets.map((b) => (
                    <BucketPill key={b} bucket={b} />
                  ))}
                </div>
              </td>
              <td className="px-2 py-3 text-right tabular-nums text-ink-muted">
                {r.payoutCount}
              </td>
              <td className="px-2 py-3 text-right tabular-nums font-medium text-ink">
                ${formatNumber(r.totalUsd, r.totalUsd < 1 ? 4 : 2)}
              </td>
              <td className="px-2 py-3 text-right tabular-nums text-ink-muted">
                {relativeTime(r.lastWonAt)}
              </td>
              <td className="py-3 pl-2 pr-5 text-right">
                <Link
                  href={`${arcTestnet.blockExplorers.default.url}/tx/${r.lastTxHash}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-base/40 px-2 py-1 text-[11px] text-ink-muted hover:border-brand-400/30 hover:text-ink"
                >
                  <ExternalLink size={10} />
                  ArcScan
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Footnote text="Top 10 earners all-time by total USDC + EURC received · aggregated from on-chain Distributed events · refreshed every minute." />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-ink-muted">
      <Loader2 size={14} className="animate-spin text-brand-400" />
      {label}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="px-6 py-12 text-center text-sm text-ink-muted">{label}</div>
  );
}

function Footnote({ text }: { text: string }) {
  return (
    <p className="border-t border-border bg-bg-base/30 px-5 py-2.5 text-[11px] text-ink-subtle">
      {text}
    </p>
  );
}

function ArcScanLink({ address }: { address: `0x${string}` }) {
  return (
    <Link
      href={`${arcTestnet.blockExplorers.default.url}/address/${address}`}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-base/40 px-2 py-1 text-[11px] text-ink-muted hover:border-brand-400/30 hover:text-ink"
    >
      <ExternalLink size={10} />
      ArcScan
    </Link>
  );
}

/**
 * Top-3 medal pill — Diamond / Gold / Silver — for both swap and LP
 * leaderboards.
 */
function MedalPill({ rank }: { rank: 1 | 2 | 3 }) {
  const v = {
    1: {
      label: 'Diamond',
      cls: 'border-cyan-300/40 bg-cyan-300/10 text-cyan-300',
    },
    2: {
      label: 'Gold',
      cls: 'border-gold-500/30 bg-gold-500/10 text-gold-500',
    },
    3: {
      label: 'Silver',
      cls: 'border-zinc-300/30 bg-zinc-300/10 text-zinc-300',
    },
  }[rank];
  return (
    <span
      className={`ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${v.cls}`}
      title={`Rank ${rank}`}
    >
      <Trophy size={9} />
      {v.label}
    </span>
  );
}

function TierBadge({ tier }: { tier: TopLp['tier'] }) {
  const map = {
    Summit: 'border-gold-500/30 bg-gold-500/10 text-gold-500',
    Climber: 'border-violet-500/30 bg-violet-500/10 text-violet-400',
    Sprout: 'border-brand-400/30 bg-brand-500/10 text-brand-400',
    Below: 'border-border bg-bg-base/40 text-ink-subtle',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${map[tier]}`}
    >
      <Droplets size={9} />
      {tier === 'Below' ? '< $100' : tier}
    </span>
  );
}

function BucketPill({ bucket }: { bucket: DistributionEvent['bucket'] }) {
  const map = {
    daily: 'border-brand-400/30 bg-brand-500/10 text-brand-400',
    weekly: 'border-violet-500/30 bg-violet-500/10 text-violet-400',
    monthly: 'border-gold-500/30 bg-gold-500/10 text-gold-500',
    bonus: 'border-cyan-300/40 bg-cyan-300/10 text-cyan-300',
    growth: 'border-zinc-300/30 bg-zinc-300/10 text-zinc-300',
    unknown: 'border-border bg-bg-base/40 text-ink-subtle',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${map[bucket]}`}
    >
      {bucket}
    </span>
  );
}

function relativeTime(ts: number): string {
  const now = Math.floor(Date.now() / 1000);
  const delta = Math.max(0, now - ts);
  if (delta < 60) return 'just now';
  if (delta < 60 * 60) return `${Math.round(delta / 60)}m ago`;
  if (delta < 60 * 60 * 24) return `${Math.round(delta / 3600)}h ago`;
  if (delta < 60 * 60 * 24 * 30) return `${Math.round(delta / 86400)}d ago`;
  return `${Math.round(delta / (86400 * 30))}mo ago`;
}
