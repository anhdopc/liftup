'use client';

import { motion } from 'framer-motion';
import { Banknote, Megaphone, Sparkles, ArrowDown } from 'lucide-react';

/**
 * Visual breakdown of where every protocol fee lands:
 *
 *               100% of swap fees
 *                       │
 *                   Treasury
 *              ┌─────────┴─────────┐
 *           10%                   90%
 *      Growth & mkt            Reward pools
 *                          ┌──────┼───────┬───────┐
 *                       Daily  Weekly  Monthly  Bonus
 *                       31.5%  31.5%   22.5%    4.5%
 *
 * Level 2 + Level 3 numbers are percentages of TOTAL fees so they line up
 * with the contract's hardcoded constants (10 / 31.5 / 31.5 / 22.5 / 4.5).
 * Level 4 (60/40 swap/LP) and Level 5 (50/50 pro-rata/lottery inside LP)
 * are % of the parent pool — they are properties of each daily/weekly/
 * monthly bucket, not of total fees.
 */
export function FeeFlow() {
  return (
    <section className="relative py-20">
      <div className="mx-auto max-w-5xl px-4">
        <Header />

        <div className="mt-12 space-y-4">
          {/* Level 1: total fees */}
          <Row>
            <Bubble
              tone="ink"
              title="Every swap fee"
              value="100%"
              sub="0.05% LP fee on USDC / EURC / cirBTC swaps. 100% skims to the RewardDistributor on every trade."
              wide
            />
          </Row>

          <Arrow />

          {/* Level 2: split into growth + rewards */}
          <Row>
            <Bubble
              tone="gold"
              icon={<Megaphone size={16} />}
              title="Growth &amp; marketing"
              value="10%"
              sub="Listings, partnerships, audits, ecosystem grants. Capped — never inflates over time."
            />
            <Bubble
              tone="brand"
              icon={<Sparkles size={16} />}
              title="Back to users"
              value="90%"
              sub="Funds the three reward pools below. Every dollar splits between swappers and LPs."
              emphasis
            />
          </Row>

          <Arrow label="Split into 3 reward pools + bonus reserve" />

          {/* Level 3: reward pools (% of the 90% bucket) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <PoolBubble title="Daily pool" value="31.5%" sub="One distribution @ 10:00 UTC · 24 users/day" />
            <PoolBubble title="Weekly pool" value="31.5%" sub="7 users every week" />
            <PoolBubble title="Monthly pool" value="22.5%" sub="5 users every month" />
            <PoolBubble
              title="Bonus reserve"
              value="4.5%"
              sub="Folded into growth wallet for now — reactivates when a community event launches."
              muted
            />
          </div>

          <Arrow label="Each pool splits 60 % Swap / 40 % LP" />

          {/* Level 4: Trader rewards + LP (further split into 2 streams). */}
          <Row>
            <Bubble
              tone="brand"
              icon={<Banknote size={16} />}
              title="Path 1 · Trader rewards"
              value="60%"
              sub="Daily 24 recipients · Weekly 7 · Monthly 5. Daily = flat odds. Weekly &amp; monthly = volume-weighted."
            />
            <Bubble
              tone="violet"
              icon={<Banknote size={16} />}
              title="Path 2 · LP rewards"
              value="40%"
              sub="Splits in half again: 20% pro-rata steady yield + 20% loyalty-weighted distribution with conviction tier &amp; tenure multipliers — see below."
            />
          </Row>

          {/* Level 5: LP sub-split (pro-rata + loyalty draw). */}
          <div className="grid grid-cols-2 gap-3">
            <PoolBubble
              title="LP pro-rata"
              value="20%"
              sub="Every qualified LP earns by % of pool. No multipliers, no selection."
            />
            <PoolBubble
              title="LP loyalty distribution"
              value="20%"
              sub="24 / 7 / 5 recipients. Conviction tier &times; tenure multipliers (up to 1.95&times;) concentrate here."
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Header() {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs uppercase tracking-[0.18em] text-gold-500">Fee flow</p>
      <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        100% to treasury. <span className="text-gradient-lift">90% back to you.</span>
      </h2>
      <p className="mt-4 text-ink-muted">
        Every dollar of swap fee is split by a public formula. There is no
        protocol token to inflate, no governance lever to redirect rewards — the
        math is hard-coded and visible on-chain.
      </p>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.4 }}
      className="grid gap-3 md:grid-cols-2"
    >
      {children}
    </motion.div>
  );
}

function Arrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center py-2 text-ink-subtle">
      <ArrowDown size={18} className="text-brand-400/60" />
      {label ? (
        <span className="mt-1 text-[10px] uppercase tracking-[0.18em]">{label}</span>
      ) : null}
    </div>
  );
}

function Bubble({
  tone,
  title,
  value,
  sub,
  icon,
  wide,
  emphasis,
}: {
  tone: 'ink' | 'gold' | 'brand' | 'violet';
  title: string;
  value: string;
  sub: string;
  icon?: React.ReactNode;
  wide?: boolean;
  emphasis?: boolean;
}) {
  const toneCls: Record<typeof tone, string> = {
    ink: 'border-border bg-bg-surface/50',
    gold: 'border-gold-500/30 bg-gold-500/[0.04]',
    brand: 'border-brand-400/30 bg-brand-500/[0.05]',
    violet: 'border-violet-500/30 bg-violet-500/[0.05]',
  };
  const valueCls: Record<typeof tone, string> = {
    ink: 'text-ink',
    gold: 'text-gold-500',
    brand: 'text-brand-400',
    violet: 'text-violet-400',
  };
  return (
    <div
      className={`rounded-3xl border ${toneCls[tone]} p-6 backdrop-blur ${
        wide ? 'md:col-span-2' : ''
      } ${emphasis ? 'shadow-glow' : ''}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-ink-muted">
          {icon}
          <span dangerouslySetInnerHTML={{ __html: title }} />
        </div>
        <span
          className={`font-display text-3xl font-semibold tracking-tight sm:text-4xl ${valueCls[tone]}`}
        >
          {value}
        </span>
      </div>
      <p className="mt-3 text-sm text-ink-muted">{sub}</p>
    </div>
  );
}

function PoolBubble({
  title,
  value,
  sub,
  muted,
}: {
  title: string;
  value: string;
  sub: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border ${
        muted ? 'border-border bg-bg-base/40' : 'border-brand-400/20 bg-brand-500/[0.04]'
      } p-4`}
    >
      <div className="text-[10px] uppercase tracking-[0.16em] text-ink-subtle">{title}</div>
      <div
        className={`mt-1 font-display text-2xl font-semibold tracking-tight ${
          muted ? 'text-ink-muted' : 'text-ink'
        }`}
      >
        {value}
      </div>
      <p
        className="mt-2 text-[11px] leading-snug text-ink-subtle"
        dangerouslySetInnerHTML={{ __html: sub }}
      />
    </div>
  );
}
