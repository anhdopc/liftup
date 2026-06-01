'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Clock,
  CalendarDays,
  CalendarRange,
  Trophy,
  Users,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Container } from '@/components/common/Container';

/**
 * Landing-page teaser for the loyalty-weighted reward mechanism. The full
 * mechanics live on /reward — this section is the hook that pulls users
 * there.
 *
 * Three compact cards (Daily / Weekly / Monthly) carrying just enough
 * detail to make the value prop concrete:
 *   - recipient count (the big number — eye-catcher)
 *   - pool share + cadence
 *   - one-line eligibility hint
 *   - one-line top-prize hook
 */
const DRAWS = [
  {
    id: 'daily',
    icon: Clock,
    tone: 'brand',
    cadence: 'Daily',
    frequency: '1 distribution / day @ 10:00 UTC',
    winners: 24,
    share: '31.5%',
    eligibility: '≥ $100 daily volume',
    headline: 'Flat odds — retail wins as often as whales',
    accent: 'from-brand-500/20 to-brand-500/0',
  },
  {
    id: 'weekly',
    icon: CalendarDays,
    tone: 'violet',
    cadence: 'Weekly',
    frequency: '1 distribution / week',
    winners: 7,
    share: '31.5%',
    eligibility: '5 days active OR $5k vol',
    headline: '1st place takes 40% — volume-weighted',
    accent: 'from-violet-500/20 to-violet-500/0',
  },
  {
    id: 'monthly',
    icon: CalendarRange,
    tone: 'gold',
    cadence: 'Monthly',
    frequency: '1 distribution / month',
    winners: 5,
    share: '22.5%',
    eligibility: '20 days active OR $10k vol',
    headline: 'Top prize = 50% of monthly pool',
    accent: 'from-gold-500/20 to-gold-500/0',
  },
] as const;

export function EarnRealYield() {
  return (
    <section id="earn" className="relative py-24 sm:py-32">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-gold-500">
            Earn real yield
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-5xl">
            <span className="text-gradient-lift">90% of every fee</span>
            <span className="block text-ink">flows back as rewards.</span>
          </h2>
          <p className="mt-4 text-ink-muted">
            Not emissions. Not a token to dump. Real USDC, EURC and cirBTC
            from real swap fees, split across{' '}
            <span className="text-ink">three on-chain reward distributions</span>{' '}
            — daily, weekly, monthly. Two parallel paths: trade to earn
            loyalty weight, or provide liquidity to earn it. Both select
            unique recipients on schedule.
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {DRAWS.map((l, i) => (
            <DrawCard key={l.id} lot={l} index={i} />
          ))}
        </div>

        {/* Bottom callout — reinforces the 2 paths + drives to /liquidity */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
          className="mt-10 flex flex-col items-center justify-between gap-4 rounded-3xl border border-border bg-bg-surface/40 px-6 py-5 backdrop-blur md:flex-row md:px-8"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-brand-400/30 bg-bg-base text-brand-400 shadow-glow">
              <Sparkles size={16} />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">
                Both swappers and LPs run their own parallel distributions.
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                Same cadence, same recipient counts. LP conviction tier &amp;
                tenure stack a loyalty multiplier on weekly + monthly only.
              </p>
            </div>
          </div>
          <Link
            href="/reward#swap-rewards"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-brand-400/30 bg-brand-500/[0.06] px-4 py-2.5 text-sm font-medium text-brand-400 transition-colors hover:bg-brand-500/[0.1]"
          >
            See full reward model
            <ArrowRight size={14} />
          </Link>
        </motion.div>
      </Container>
    </section>
  );
}

function DrawCard({
  lot,
  index,
}: {
  lot: (typeof DRAWS)[number];
  index: number;
}) {
  const Icon = lot.icon;
  const tone = {
    brand: {
      border: 'border-brand-400/30',
      iconWrap: 'text-brand-400 border-brand-400/30 bg-bg-base shadow-glow',
      pill: 'border-brand-400/30 bg-brand-500/10 text-brand-400',
      value: 'text-brand-400',
    },
    violet: {
      border: 'border-violet-500/30',
      iconWrap: 'text-violet-400 border-violet-500/30 bg-bg-base',
      pill: 'border-violet-500/30 bg-violet-500/10 text-violet-400',
      value: 'text-violet-400',
    },
    gold: {
      border: 'border-gold-500/30',
      iconWrap: 'text-gold-500 border-gold-500/30 bg-bg-base shadow-glow-gold',
      pill: 'border-gold-500/30 bg-gold-500/10 text-gold-500',
      value: 'text-gold-500',
    },
  }[lot.tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, delay: index * 0.08 }}
      className={`group relative overflow-hidden rounded-3xl border ${tone.border} bg-bg-surface/40 p-7 backdrop-blur transition-all hover:-translate-y-1`}
    >
      {/* Decorative orb */}
      <div
        className={`pointer-events-none absolute -top-24 -right-16 h-48 w-48 rounded-full bg-gradient-to-br ${lot.accent} blur-3xl opacity-60 transition-opacity group-hover:opacity-90`}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${tone.iconWrap}`}
        >
          <Icon size={20} />
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.16em] ${tone.pill}`}
        >
          {lot.share} of pool
        </span>
      </div>

      <h3 className="relative mt-6 font-display text-2xl font-semibold tracking-tight">
        {lot.cadence} distribution
      </h3>
      <p className="relative mt-1 text-xs uppercase tracking-[0.14em] text-ink-subtle">
        {lot.frequency}
      </p>

      {/* The big number — recipient count */}
      <div className="relative mt-7 flex items-baseline gap-3">
        <span
          className={`font-display text-6xl font-semibold tracking-tight ${tone.value}`}
        >
          {lot.winners}
        </span>
        <span className="text-xs uppercase tracking-[0.16em] text-ink-muted">
          unique
          <br />
          users
        </span>
      </div>

      {/* Detail rows */}
      <div className="relative mt-7 space-y-2.5 text-xs">
        <div className="flex items-start gap-2">
          <Users size={12} className="mt-0.5 shrink-0 text-ink-subtle" />
          <span className="text-ink-muted">{lot.eligibility}</span>
        </div>
        <div className="flex items-start gap-2">
          <Trophy size={12} className="mt-0.5 shrink-0 text-ink-subtle" />
          <span className="text-ink">{lot.headline}</span>
        </div>
      </div>
    </motion.div>
  );
}
