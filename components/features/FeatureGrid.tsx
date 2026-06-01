'use client';

import { motion } from 'framer-motion';
import {
  ArrowLeftRight,
  Layers,
  Coins,
  Globe,
  Zap,
  ShieldCheck,
} from 'lucide-react';
import { Container } from '@/components/common/Container';

const FEATURES = [
  {
    icon: ArrowLeftRight,
    title: 'Stablecoin-native swaps',
    desc: 'USDC, EURC and cirBTC (Circle Wrapped BTC) — priced from on-chain reserves with predictable slippage, no exotic-pair surprises.',
    accent: 'from-brand-500/30 to-brand-500/0',
  },
  {
    icon: Zap,
    title: 'Sub-second finality',
    desc: 'Arc is engineered for stablecoin throughput. Confirmations land in under a second so your swap feels like Venmo, not L1 Ethereum.',
    accent: 'from-violet-500/30 to-violet-500/0',
  },
  {
    icon: Coins,
    title: 'Gas in dollars',
    desc: "USDC is Arc's native gas token. Quote your trade in USD, pay your gas in USD — no juggling a separate ETH balance to move money.",
    accent: 'from-gold-500/30 to-gold-500/0',
  },
  {
    icon: Globe,
    title: 'Cross-chain via CCTP',
    desc: 'Move USDC in and out of Arc using Circle Cross-Chain Transfer Protocol. Burn-and-mint, no wrapped IOUs, settlement-grade.',
    accent: 'from-brand-500/30 to-violet-500/0',
  },
  {
    icon: Layers,
    title: 'FX-grade pricing',
    desc: 'USDC ↔ EURC rates updated by an on-chain oracle. The same fair value treasuries use to settle billions in payment flows.',
    accent: 'from-violet-500/30 to-gold-500/0',
  },
  {
    icon: ShieldCheck,
    title: 'Non-custodial by design',
    desc: 'Your keys, your coins. Contracts are small, single-purpose, and reviewable in one sitting — no governance lever to drain you.',
    accent: 'from-gold-500/30 to-brand-500/0',
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="relative py-24 sm:py-32">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-gold-500">Why LiftUp</p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-5xl">
            Stablecoin DeFi, <span className="text-gradient-lift">finally usable</span>.
          </h2>
          <p className="mt-4 text-ink-muted">
            Built on Arc Network — the L1 where dollars and euros move at network speed and
            cost you cents in the same currency you're trading.
          </p>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className="group relative overflow-hidden rounded-2xl border border-border bg-bg-surface/40 p-6 backdrop-blur transition-all hover:-translate-y-1 hover:border-brand-400/30"
            >
              <div
                className={`pointer-events-none absolute -top-32 -right-20 h-48 w-48 rounded-full bg-gradient-to-br ${f.accent} blur-3xl opacity-50 transition-opacity group-hover:opacity-80`}
              />
              <f.icon size={20} className="text-brand-400" />
              <h3 className="mt-5 font-display text-lg font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
}
