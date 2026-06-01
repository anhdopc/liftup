'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Wallet, Repeat, Layers, Trophy, ArrowRight } from 'lucide-react';
import { Container } from '@/components/common/Container';

const STEPS = [
  {
    icon: Wallet,
    title: 'Connect to Arc',
    desc: 'One click adds Arc Testnet to your wallet. No private RPC tweaks, no custom chain config — Reown handles the add-and-switch.',
    href: '/swap',
    cta: 'Open swap',
  },
  {
    icon: Repeat,
    title: 'Swap → earn loyalty weight',
    desc: 'Every USDC / EURC / cirBTC trade above $100/day earns loyalty weight in the daily reward distribution. Active 5+ days a week? You also qualify for the weekly distribution.',
    href: '/swap',
    cta: 'Make a swap',
  },
  {
    icon: Layers,
    title: 'Add liquidity → earn yield',
    desc: 'Provide USDC/EURC into the LiftUp pool and earn a share of 90% of all protocol fees — paid weekly, scaled by your tier and time-locked share.',
    href: '/liquidity',
    cta: 'Add liquidity',
  },
  {
    icon: Trophy,
    title: 'Claim your rewards',
    desc: 'Daily recipients settle in one tx at 10:00 UTC. Weekly + monthly recipients by volume × conviction tier × tenure. LP pro-rata yield streams to every qualified wallet — no claim button, no gas.',
    href: '/reward',
    cta: 'See full reward model',
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative py-24 sm:py-32">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[1fr_2fr] lg:items-start">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-gold-500">How it works</p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Four steps. <span className="text-gradient-lift">Real rewards.</span>
            </h2>
            <p className="mt-4 max-w-md text-ink-muted">
              LiftUp turns every swap and every dollar of liquidity into a reward stream.
              90% of protocol fees flow back to traders and LPs — paid out on-chain, on
              schedule, with no governance vote required.
            </p>
            <Link
              href="/reward"
              className="mt-6 inline-flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300"
            >
              Read the full reward model
              <ArrowRight size={14} />
            </Link>
          </div>

          <ol className="relative space-y-6">
            <div
              aria-hidden
              className="pointer-events-none absolute left-[27px] top-2 bottom-2 w-px bg-gradient-to-b from-brand-400/60 via-violet-500/40 to-gold-500/40"
            />
            {STEPS.map((s, i) => (
              <motion.li
                key={s.title}
                initial={{ opacity: 0, x: 16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="group relative flex gap-5 rounded-2xl border border-border bg-bg-surface/40 p-6 backdrop-blur transition-colors hover:border-brand-400/30"
              >
                <div className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-brand-400/30 bg-bg-base text-brand-400 shadow-glow">
                  <s.icon size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-xs uppercase tracking-[0.18em] text-ink-subtle">
                      Step {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <h3 className="mt-1 font-display text-xl font-semibold tracking-tight">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm text-ink-muted">{s.desc}</p>
                  <Link
                    href={s.href}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-400 transition-colors hover:text-brand-300"
                  >
                    {s.cta}
                    <ArrowRight
                      size={12}
                      className="transition-transform group-hover:translate-x-0.5"
                    />
                  </Link>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
