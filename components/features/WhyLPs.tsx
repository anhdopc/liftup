'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Gauge, Banknote, Sparkles, ArrowRight, Trophy } from 'lucide-react';
import { Container } from '@/components/common/Container';

/**
 * "Why Liquidity Providers Choose LiftUp"
 *
 * Three core pillars in a row, plus a small reward-split visual on the
 * right so the LP value prop is concrete (real numbers, not just adjectives):
 *   1. Balanced capital efficiency (V2 pricing, every $ earns)
 *   2. Real yield from protocol fees (not emissions)
 *   3. Loyalty + tenure-weighted rewards (new mechanism)
 */
const PILLARS = [
  {
    icon: Gauge,
    title: 'Capital efficiency you can read in 1 line',
    desc:
      'Constant-product V2 pricing means every dollar of liquidity earns fees on every swap that touches the pool — no concentrated ranges to babysit, no idle capital outside the active band.',
    badge: 'V2 simple',
  },
  {
    icon: Banknote,
    title: 'Real yield from real swap fees',
    desc:
      '0.05% fee on every swap, 100% skims out of the pool into the on-chain RewardDistributor — 10% to growth, 90% back to swappers and LPs through loyalty-weighted reward distributions. Nothing minted, nothing inflated.',
    badge: '90% to users',
  },
  {
    icon: Sparkles,
    title: 'Loyalty tiers + tenure multipliers',
    desc:
      'Active swappers earn loyalty weight in daily / weekly / monthly reward distributions. LPs are stratified into conviction tiers — newcomers earn alongside whales, with bonus multipliers that grow the longer your liquidity stays in the pool.',
    badge: 'New mechanism',
  },
];

export function WhyLPs() {
  return (
    <section id="rewards" className="relative py-24 sm:py-32">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-gold-500">
            Why liquidity providers choose LiftUp
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-5xl">
            Liquidity that <span className="text-gradient-lift">earns itself</span>.
          </h2>
          <p className="mt-4 text-ink-muted">
            Most stablecoin venues ship a passive fee number and hope it
            lifts your APR. LiftUp routes 90% of every fee back to the
            people who put capital and volume into the protocol — and adds
            a loyalty-weighted reward layer on top so every active wallet
            has a fair shot.
          </p>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: i * 0.07 }}
              className="group relative overflow-hidden rounded-3xl border border-border bg-bg-surface/40 p-7 backdrop-blur transition-all hover:-translate-y-1 hover:border-brand-400/30"
            >
              <div className="pointer-events-none absolute -top-32 -right-20 h-48 w-48 rounded-full bg-gradient-to-br from-brand-500/20 to-violet-500/0 blur-3xl opacity-50 transition-opacity group-hover:opacity-80" />
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-brand-400/30 bg-bg-base text-brand-400">
                  <p.icon size={18} />
                </div>
                <span className="rounded-full border border-border bg-bg-base/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-ink-subtle">
                  {p.badge}
                </span>
              </div>
              <h3 className="mt-5 font-display text-lg font-semibold tracking-tight">
                {p.title}
              </h3>
              <p className="mt-2 text-sm text-ink-muted">{p.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Fee split mini-visual */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
          className="mt-10 overflow-hidden rounded-3xl border border-border bg-bg-surface/40 backdrop-blur"
        >
          <div className="grid gap-0 lg:grid-cols-[1fr_1.4fr]">
            <div className="p-7 lg:p-10 border-b border-border lg:border-b-0 lg:border-r">
              <div className="flex items-center gap-2">
                <Trophy size={16} className="text-gold-500" />
                <span className="text-xs uppercase tracking-[0.18em] text-gold-500">
                  Where every fee goes
                </span>
              </div>
              <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                100% of swap fees → public treasury.
              </h3>
              <p className="mt-3 text-sm text-ink-muted">
                Transparent on-chain split, no hidden carve-outs. The treasury
                wallet will be published before mainnet so anyone can audit
                where the dollars land.
              </p>
              <Link
                href="/reward"
                className="mt-5 inline-flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300"
              >
                See full breakdown
                <ArrowRight size={14} />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 p-7 lg:p-10 gap-5">
              <SplitRow
                pct="10%"
                label="Growth &amp; marketing"
                sub="Reserved for ecosystem growth, listings, partnerships."
                color="from-gold-500/40 to-gold-500/0"
                bar={10}
              />
              <SplitRow
                pct="90%"
                label="Back to traders &amp; LPs"
                sub="Funds the three reward pools — daily, weekly, monthly."
                color="from-brand-500/50 to-violet-500/0"
                bar={90}
                emphasis
              />
              <SplitRow
                pct="3 pools"
                label="Daily / Weekly / Monthly"
                sub="31.5% / 31.5% / 22.5% of total fees — plus 4.5% bonus reserve."
                color="from-violet-500/40 to-violet-500/0"
                bar={60}
                small
              />
              <SplitRow
                pct="2 paths"
                label="Trader rewards + LP yield"
                sub="Earn as a trader, earn as an LP — or both."
                color="from-brand-500/40 to-brand-500/0"
                bar={60}
                small
              />
            </div>
          </div>
        </motion.div>
      </Container>
    </section>
  );
}

function SplitRow({
  pct,
  label,
  sub,
  color,
  bar,
  emphasis,
  small,
}: {
  pct: string;
  label: string;
  sub: string;
  color: string;
  bar: number;
  emphasis?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border ${
        emphasis ? 'border-brand-400/30 bg-brand-500/[0.04]' : 'border-border bg-bg-base/40'
      } px-5 py-4`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={`font-display font-semibold tracking-tight ${
            small ? 'text-lg' : 'text-2xl'
          } ${emphasis ? 'text-gradient-lift' : 'text-ink'}`}
        >
          {pct}
        </span>
        <span
          className="text-xs uppercase tracking-[0.14em] text-ink-muted"
          dangerouslySetInnerHTML={{ __html: label }}
        />
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-elevated/60">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color}`}
          style={{ width: `${bar}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-ink-subtle">{sub}</p>
    </div>
  );
}
