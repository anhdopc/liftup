'use client';

import { motion } from 'framer-motion';
import { Sprout, Mountain, Crown, Lock, Timer } from 'lucide-react';

type Tier = {
  id: 'sprout' | 'climber' | 'summit';
  name: string;
  audience: string;
  range: string;
  multiplier: string;
  perks: string[];
  icon: typeof Sprout;
  tone: 'brand' | 'violet' | 'gold';
};

const TIERS: Tier[] = [
  {
    id: 'sprout',
    name: 'Sprout',
    audience: 'New users + retail LPs',
    range: '$100 – $1,000 in pool',
    multiplier: '1.00× base win-rate',
    icon: Sprout,
    tone: 'brand',
    perks: [
      'Enters all three LP reward distributions — daily flat-odds + weekly &amp; monthly volume-weighted',
      'No multiplier penalty; the same odds-per-dollar as everyone else',
      'First in line for the bonus reserve once a community-event program launches',
    ],
  },
  {
    id: 'climber',
    name: 'Climber',
    audience: 'Mid-tier + light whales',
    range: '$1,001 – $5,000 in pool',
    multiplier: '1.15× weekly &amp; monthly',
    icon: Mountain,
    tone: 'violet',
    perks: [
      '1.15× weight on weekly &amp; monthly LP reward distributions (daily stays flat)',
      'Unlocks weekly "consistency bonus" after holding liquidity 4+ weeks',
      'Eligible for early-access airdrops from partner protocols on Arc',
    ],
  },
  {
    id: 'summit',
    name: 'Summit',
    audience: 'True whales + loyal LPs',
    range: '$5,001+ in pool',
    multiplier: '1.30× weekly &amp; monthly',
    icon: Crown,
    tone: 'gold',
    perks: [
      '1.30× weight on weekly &amp; monthly, stacks with tenure multiplier',
      'Direct line to a governance seat before mainnet launch',
      'Eligible for monthly partner-token allocations on top of LiftUp rewards',
    ],
  },
];

export function LPTiers() {
  return (
    <section id="lp-rewards" className="relative py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-brand-400">
            LP rewards · conviction tiers
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Earn together, <span className="text-gradient-lift">scale with loyalty</span>.
          </h2>
          <p className="mt-4 text-ink-muted">
            Conviction tier &amp; tenure multipliers apply to the{' '}
            <span className="text-ink">LP loyalty distribution half</span>{' '}
            (20% of each pool) on <span className="text-ink">weekly and
            monthly</span> distributions — daily is flat-odds for fairness.
            The other half of the LP bucket (20% pro-rata) pays out by{' '}
            <span className="text-ink">% of pool</span> alone, no
            multipliers — so every qualified LP always earns.
          </p>
          <p className="mt-3 text-xs text-ink-subtle">
            <span className="text-gold-500">Passive tenure:</span> there&apos;s
            no "lock" button — the bot counts your holding duration from the
            block of your first LP mint. Remove all your LP and add again →
            the clock restarts. Partial removes leave the timestamp untouched.
            24h minimum hold before any distribution counts (trust gate / anti-Sybil).
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {TIERS.map((t, i) => (
            <TierCard key={t.id} tier={t} index={i} />
          ))}
        </div>

        {/* Time-lock multiplier strip — now framed as win-rate, not yield */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
          className="mt-8 overflow-hidden rounded-3xl border border-border bg-bg-surface/40 backdrop-blur"
        >
          <div className="grid gap-0 lg:grid-cols-[1fr_2fr]">
            <div className="border-b border-border p-7 lg:border-b-0 lg:border-r">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-gold-500">
                <Lock size={14} />
                Tenure multiplier
              </div>
              <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight">
                Stay longer, earn more weight.
              </h3>
              <p className="mt-3 text-sm text-ink-muted">
                <span className="text-ink">Holding-based</span>, not an
                explicit lock action — your multiplier grows as you keep
                LP in the pool past 30 / 90 / 180 days. Applied to the
                weekly &amp; monthly LP loyalty distribution half only.
                Pro-rata 20% pays everyone by % of pool regardless of
                tenure — so even a fresh LP earns from day 0.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 p-7 sm:grid-cols-4">
              <LockRow days="No tenure" mult="1.00×" />
              <LockRow days="30 days" mult="1.10×" />
              <LockRow days="90 days" mult="1.25×" />
              <LockRow days="180 days" mult="1.50×" featured />
            </div>
          </div>
        </motion.div>

        {/* Worked example */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
          className="mt-6 rounded-3xl border border-border bg-bg-surface/30 p-7 backdrop-blur"
        >
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-brand-400">
            <Timer size={14} />
            Worked example
          </div>
          <p className="mt-3 text-sm text-ink-muted">
            A <span className="text-ink">Climber</span> LP with{' '}
            <span className="text-ink">$3,000</span> in the pool and{' '}
            <span className="text-ink">90 days of tenure</span> enters the
            weekly distribution with a loyalty multiplier of{' '}
            <span className="font-display text-ink">1.15× × 1.25× = 1.4375×</span>{' '}
            on top of their base volume weighting — applied to every LP
            reward distribution they qualify for.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

function TierCard({ tier, index }: { tier: Tier; index: number }) {
  const Icon = tier.icon;
  const tone = {
    brand: {
      border: 'border-brand-400/30',
      pill: 'bg-brand-500/10 text-brand-400 border-brand-400/30',
      icon: 'text-brand-400 border-brand-400/30',
    },
    violet: {
      border: 'border-violet-500/30',
      pill: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
      icon: 'text-violet-400 border-violet-500/30',
    },
    gold: {
      border: 'border-gold-500/30',
      pill: 'bg-gold-500/10 text-gold-500 border-gold-500/30',
      icon: 'text-gold-500 border-gold-500/30',
    },
  }[tier.tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, delay: index * 0.08 }}
      className={`flex flex-col rounded-3xl border ${tone.border} bg-bg-surface/40 p-6 backdrop-blur`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-2xl border bg-bg-base ${tone.icon}`}
        >
          <Icon size={20} />
        </div>
        <div
          className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] ${tone.pill}`}
        >
          {tier.multiplier}
        </div>
      </div>
      <h3 className="mt-5 font-display text-2xl font-semibold tracking-tight">{tier.name}</h3>
      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-ink-subtle">
        {tier.audience}
      </p>
      <p className="mt-3 text-sm text-ink-muted">{tier.range}</p>

      <ul className="mt-5 space-y-2.5 text-sm text-ink-muted">
        {tier.perks.map((perk) => (
          <li key={perk} className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-400" />
            <span dangerouslySetInnerHTML={{ __html: perk }} />
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

function LockRow({ days, mult, featured }: { days: string; mult: string; featured?: boolean }) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        featured ? 'border-gold-500/30 bg-gold-500/[0.04]' : 'border-border bg-bg-base/40'
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.16em] text-ink-subtle">{days}</div>
      <div
        className={`mt-1 font-display text-2xl font-semibold ${
          featured ? 'text-gold-500' : 'text-ink'
        }`}
      >
        {mult}
      </div>
    </div>
  );
}
