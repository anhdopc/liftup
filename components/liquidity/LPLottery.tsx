'use client';

import { motion } from 'framer-motion';
import {
  Clock,
  CalendarDays,
  CalendarRange,
  Trophy,
  Users,
  CheckCircle2,
  Droplets,
} from 'lucide-react';

type PrizeRow = { place: string; share: string };

type Pool = {
  id: 'daily' | 'weekly' | 'monthly';
  cadence: string;
  icon: typeof Clock;
  tone: 'brand' | 'violet' | 'gold';
  share: string; // % of total fees (this LP path takes 40% of the bucket)
  winners: number;
  drawCount: string;
  fairness: string;
  eligibility: string[];
  prizes: PrizeRow[];
  note: string;
};

const LP_POOLS: Pool[] = [
  {
    id: 'daily',
    cadence: 'Daily',
    icon: Clock,
    tone: 'brand',
    share: '31.5%',
    winners: 24,
    drawCount: '1 distribution @ 10:00 UTC · 24 unique users',
    fairness:
      'Flat odds — one entry per qualified LP wallet. Holding more does not raise daily odds (tier &amp; tenure multipliers do not apply on daily).',
    eligibility: [
      '≥ $100 of LP held continuously for 24h+ at distribution time',
      'Liquidity removed before the 10:00 UTC distribution forfeits that day',
      'Pro-rata yield is split by your LP share — no selection needed',
    ],
    prizes: [{ place: 'Per user', share: '~4.17% of daily LP bucket' }],
    note: 'Daily LP distribution is the most retail-friendly — a Sprout LP with $100 has the same odds as a Summit LP. Anti-Sybil is strictest here; the 24h trust gate neutralizes hot-money farming.',
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
      'Odds ∝ (your LP × conviction tier × tenure multiplier) / total weighted LP. Higher tier and longer tenure = higher odds per distribution.',
    eligibility: [
      'Hold LP ≥ 5 days during the week, OR',
      'Average LP position ≥ $1,000 over the week',
      'Either condition qualifies — does NOT stack odds',
    ],
    prizes: [
      { place: '1st place', share: '40%' },
      { place: '2nd place', share: '20%' },
      { place: '3rd – 4th', share: '20% (10% each)' },
      { place: '5th – 6th', share: '15% (7.5% each)' },
      { place: '7th place', share: '5%' },
    ],
    note: 'Weekly is where Climber and Summit LPs start to pull ahead. Your weighted LP (tier × time-lock × $) buys probability of landing in the top 7.',
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
      'Odds ∝ (your LP × conviction tier × tenure multiplier) / total weighted LP across the month.',
    eligibility: [
      'Hold LP ≥ 20 days in the calendar month, OR',
      'Average LP position ≥ $5,000 over the month',
    ],
    prizes: [
      { place: '1st place', share: '50%' },
      { place: '2nd place', share: '20%' },
      { place: '3rd place', share: '15%' },
      { place: '4th place', share: '10%' },
      { place: '5th place', share: '5%' },
    ],
    note: 'Highest single-prize tier in the entire system. A Summit LP with a 180-day lock has a real shot at the 50% 1st place share each month.',
  },
];

export function LPLottery() {
  return (
    <section id="lp-draws" className="relative py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-violet-400">
            Path 2 · LP loyalty rewards
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Provide liquidity, <span className="text-gradient-lift">enter the same distributions</span>.
          </h2>
          <p className="mt-4 text-ink-muted">
            LPs run in parallel to swappers — same cadence, same recipient
            counts. The LP bucket pays out in <span className="text-ink">two
            streams</span>: a steady <span className="text-ink">pro-rata yield</span>
            so every LP earns by their % of pool (no selection needed) and a{' '}
            <span className="text-ink">loyalty-weighted distribution</span> on
            top, where <span className="text-ink">conviction tier</span> and{' '}
            <span className="text-ink">tenure</span> multipliers concentrate
            the upside.
          </p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-bg-elevated/40 px-3 py-1 text-xs text-ink-subtle">
            <Droplets size={11} className="text-violet-400" />
            LP takes 40% of each pool above — split 20% pro-rata · 20% loyalty distribution
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {LP_POOLS.map((p, i) => (
            <LPCard key={p.id} pool={p} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function LPCard({ pool, index }: { pool: Pool; index: number }) {
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
        {pool.cadence} LP distribution
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
          <div
            className="mt-1 text-[11px] leading-tight text-ink"
            dangerouslySetInnerHTML={{ __html: pool.fairness }}
          />
        </div>
      </div>

      <div className="mt-5">
        <div className="text-[10px] uppercase tracking-[0.18em] text-gold-500">
          Eligibility
        </div>
        <ul className="mt-2 space-y-1.5 text-xs text-ink-muted">
          {pool.eligibility.map((e) => (
            <li key={e} className="flex items-start gap-2">
              <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-violet-400" />
              <span>{e}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5">
        <div className="text-[10px] uppercase tracking-[0.18em] text-violet-400">
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
