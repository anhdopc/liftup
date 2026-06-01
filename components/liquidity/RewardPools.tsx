'use client';

import { motion } from 'framer-motion';
import {
  Clock,
  CalendarDays,
  CalendarRange,
  Trophy,
  Users,
  CheckCircle2,
  Repeat,
} from 'lucide-react';

type PrizeRow = { place: string; share: string };

type Pool = {
  id: 'daily' | 'weekly' | 'monthly';
  cadence: string;
  icon: typeof Clock;
  tone: 'brand' | 'violet' | 'gold';
  share: string;
  winners: number;
  drawCount: string;
  fairness: string;
  eligibility: string[];
  prizes: PrizeRow[];
  note: string;
};

const POOLS: Pool[] = [
  {
    id: 'daily',
    cadence: 'Daily',
    icon: Clock,
    tone: 'brand',
    share: '31.5%',
    winners: 24,
    drawCount: '1 distribution @ 10:00 UTC · 24 unique users',
    fairness:
      'Flat odds — one entry per qualified wallet. Swapping more does not raise your daily odds.',
    eligibility: [
      'Total swap volume ≥ $100 in the 24h before the 10:00 UTC distribution',
      'USDC / EURC / cirBTC swaps · LiftUp Pool route',
      'New qualification window starts after each daily distribution',
    ],
    prizes: [{ place: 'Per user', share: '~4.17% of daily swap bucket' }],
    note: 'Designed for retail traders. Whether you swap $100 or $100,000, your odds are the same — the daily distribution is where anti-Sybil rules bite hardest.',
  },
  {
    id: 'weekly',
    cadence: 'Weekly',
    icon: CalendarDays,
    tone: 'violet',
    share: '31.5%',
    winners: 7,
    drawCount: '1 distribution / week · 7 unique users',
    fairness:
      'Odds ∝ your weekly swap volume / total weekly swap volume. Higher volume = higher odds.',
    eligibility: [
      'Active swap on ≥ 5 days in the week, OR',
      '≥ $1,000 total swap volume over 7 days',
      'Either condition qualifies — does NOT stack odds',
    ],
    prizes: [
      { place: '1st place', share: '40%' },
      { place: '2nd place', share: '20%' },
      { place: '3rd – 4th', share: '20% (10% each)' },
      { place: '5th – 6th', share: '15% (7.5% each)' },
      { place: '7th place', share: '5%' },
    ],
    note: 'Qualifying gates you in. Total weekly swap volume then determines which of the 7 places you land in — every recipient is a unique wallet.',
  },
  {
    id: 'monthly',
    cadence: 'Monthly',
    icon: CalendarRange,
    tone: 'gold',
    share: '22.5%',
    winners: 5,
    drawCount: '1 distribution / month · 5 unique users',
    fairness:
      'Odds ∝ your monthly swap volume / total monthly swap volume.',
    eligibility: [
      'Active swap on ≥ 20 days in the calendar month, OR',
      '≥ $5,000 total swap volume during the month',
    ],
    prizes: [
      { place: '1st place', share: '50%' },
      { place: '2nd place', share: '20%' },
      { place: '3rd place', share: '15%' },
      { place: '4th place', share: '10%' },
      { place: '5th place', share: '5%' },
    ],
    note: 'Longest qualification window and strictest anti-Sybil tier. The same wallet can earn across daily, weekly and monthly in the same period — but never twice within the same distribution.',
  },
];

export function RewardPools() {
  return (
    <section id="swap-rewards" className="relative py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-brand-400">
            Path 1 · Trader rewards
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Trade and <span className="text-gradient-lift">earn loyalty weight</span>.
          </h2>
          <p className="mt-4 text-ink-muted">
            Every USDC / EURC / cirBTC swap on LiftUp earns loyalty weight in
            the daily, weekly and monthly reward distributions. Daily is
            flat-odds so retail participants are never outgunned; weekly and
            monthly are volume-weighted; every distribution selects unique
            recipients.
          </p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-bg-elevated/40 px-3 py-1 text-xs text-ink-subtle">
            <Repeat size={11} className="text-brand-400" />
            Each pool below splits 60% Trader rewards / 40% LP rewards
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {POOLS.map((p, i) => (
            <PoolCard key={p.id} pool={p} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PoolCard({ pool, index }: { pool: Pool; index: number }) {
  const Icon = pool.icon;
  const tone = {
    brand: {
      border: 'border-brand-400/30',
      glow: 'shadow-glow',
      pill: 'bg-brand-500/10 text-brand-400 border-brand-400/30',
      icon: 'text-brand-400 border-brand-400/30 bg-bg-base',
    },
    violet: {
      border: 'border-violet-500/30',
      glow: '',
      pill: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
      icon: 'text-violet-400 border-violet-500/30 bg-bg-base',
    },
    gold: {
      border: 'border-gold-500/30',
      glow: 'shadow-glow-gold',
      pill: 'bg-gold-500/10 text-gold-500 border-gold-500/30',
      icon: 'text-gold-500 border-gold-500/30 bg-bg-base',
    },
  }[pool.tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, delay: index * 0.08 }}
      className={`relative flex flex-col rounded-3xl border ${tone.border} bg-bg-surface/40 p-6 backdrop-blur`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${tone.icon} ${tone.glow}`}
        >
          <Icon size={20} />
        </div>
        <div
          className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] ${tone.pill}`}
        >
          {pool.share} of total fees
        </div>
      </div>

      <h3 className="mt-5 font-display text-2xl font-semibold tracking-tight">
        {pool.cadence} distribution
      </h3>
      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-ink-subtle">
        {pool.drawCount}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl border border-border bg-bg-base/40 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-ink-subtle">
            <Users size={11} />
            Unique users
          </div>
          <div className="mt-1 font-display text-xl font-semibold text-ink">
            {pool.winners}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-bg-base/40 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-ink-subtle">
            <Trophy size={11} />
            Odds
          </div>
          <div className="mt-1 text-[11px] leading-tight text-ink">
            {pool.fairness}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="text-[10px] uppercase tracking-[0.18em] text-gold-500">
          Eligibility
        </div>
        <ul className="mt-2 space-y-1.5 text-xs text-ink-muted">
          {pool.eligibility.map((e) => (
            <li key={e} className="flex items-start gap-2">
              <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-brand-400" />
              <span>{e}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5">
        <div className="text-[10px] uppercase tracking-[0.18em] text-brand-400">
          Prize distribution
        </div>
        <ul className="mt-2 divide-y divide-border/60 overflow-hidden rounded-xl border border-border">
          {pool.prizes.map((p) => (
            <li
              key={p.place}
              className="flex items-center justify-between bg-bg-base/30 px-3 py-2 text-xs"
            >
              <span className="text-ink-muted">{p.place}</span>
              <span className="font-medium text-ink">{p.share}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-5 text-xs leading-relaxed text-ink-subtle">{pool.note}</p>
    </motion.div>
  );
}
