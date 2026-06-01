'use client';

import { motion } from 'framer-motion';
import {
  ShieldAlert,
  Users,
  Clock,
  Award,
  TrendingUp,
  Fingerprint,
} from 'lucide-react';

/**
 * Anti-Sybil section.
 *
 * Design principles (from spec):
 *   - Not too harsh on real retail
 *   - Focus on stopping multi-account farming on the flat-odds Daily draw
 *   - Easy to verify on-chain, low gas
 *   - Strictness scales with reward tier (Daily < Weekly < Monthly)
 *   - LP rewards require a 24h hold-up after add before counting
 *   - Every draw produces unique winners only
 */
const RULES = [
  {
    icon: Users,
    title: 'Unique users per distribution',
    desc:
      'A single wallet cannot occupy more than one recipient slot in the same distribution. Even if you would have ranked 1st and 2nd, the second slot rolls down to the next eligible wallet.',
    badge: 'All distributions',
  },
  {
    icon: Clock,
    title: '24h LP hold-up',
    desc:
      'Liquidity added to the pool must sit there for at least 24 hours before it counts toward eligibility or weighted volume. Pulling early forfeits eligibility for that period.',
    badge: 'LP rewards',
  },
  {
    icon: Fingerprint,
    title: 'Flat odds, hard gate',
    desc:
      'The daily distribution uses flat odds — splitting wallets dilutes rather than amplifies your edge. Paired with the $100 swap-or-LP gate, multi-account farming costs more than it pays.',
    badge: 'Daily distribution',
  },
  {
    icon: TrendingUp,
    title: 'Volume-weighted odds',
    desc:
      'Weekly and monthly distributions are weighted by total volume. Splitting volume across N wallets gives N wallets 1/N of the odds each — same expected value, more gas paid. Sybil is self-defeating.',
    badge: 'Weekly · Monthly',
  },
  {
    icon: Award,
    title: 'Strictness scales with tier',
    desc:
      'Daily is the lightest filter (flat odds, low gate). Weekly adds a 5-day or $5k threshold. Monthly demands 20 days active or $10k — combined with the 24h LP cooldown, it\'s the hardest to game.',
    badge: 'Daily → Monthly',
  },
  {
    icon: ShieldAlert,
    title: 'On-chain verifiable, low gas',
    desc:
      'Every check is a read against pool & router events emitted on-chain — swap volume, LP add/remove timestamps, hold duration. No off-chain oracle, no extra gas cost on the user.',
    badge: 'Verifiable',
  },
];

export function AntiSybil() {
  return (
    <section id="anti-sybil" className="relative py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-brand-400">
            Anti-sybil &amp; fairness
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            One wallet, <span className="text-gradient-lift">one shot</span>.
          </h2>
          <p className="mt-4 text-ink-muted">
            Sybil farming is the silent killer of every reward protocol.
            LiftUp&apos;s anti-Sybil model is designed to be light on real
            users and heavy on multi-account farms — every rule is verifiable
            on-chain, gated by a 24-hour trust window before any distribution counts.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {RULES.map((r, i) => (
            <motion.div
              key={r.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className="group relative overflow-hidden rounded-2xl border border-border bg-bg-surface/40 p-6 backdrop-blur transition-colors hover:border-brand-400/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-400/30 bg-bg-base text-brand-400">
                  <r.icon size={16} />
                </div>
                <span className="rounded-full border border-border bg-bg-base/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-ink-subtle">
                  {r.badge}
                </span>
              </div>
              <h3 className="mt-4 font-display text-base font-semibold tracking-tight">
                {r.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{r.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
