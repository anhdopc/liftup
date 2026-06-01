'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowUpRight, Sparkles, Trophy } from 'lucide-react';
import { Container } from '@/components/common/Container';
import { GradientButton } from '@/components/common/GradientButton';
import { ParticlesUp } from '@/components/magic/ParticlesUp';
import { useLandingStats } from '@/hook/useLandingStats';
import { useActiveUsers } from '@/hook/useActiveUsers';
import { useVolume24h } from '@/hook/useVolume24h';
import { formatCompact } from '@/lib/utils';

export function Hero() {
  const { tvlUsd, hasData } = useLandingStats();
  const { count: activeUsers, loading: usersLoading } = useActiveUsers();
  const { volumeUsd, loading: volumeLoading } = useVolume24h(undefined, {
    allTime: true,
  });

  const stats: { label: string; value: string }[] = [
    {
      label: 'TVL on Arc Testnet',
      value: hasData ? `$${formatCompact(tvlUsd)}` : '—',
    },
    {
      label: 'All-time swap volume',
      value: volumeLoading ? '—' : `$${formatCompact(volumeUsd)}`,
    },
    {
      label: 'Active users',
      value: usersLoading ? '—' : formatCompact(activeUsers),
    },
  ];

  return (
    <section className="relative isolate pt-32 pb-24 sm:pt-40 sm:pb-32 overflow-hidden">
      <ParticlesUp density={70} />
      <Container className="relative">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto flex max-w-3xl flex-col items-center text-center"
        >
          <Link
            href="/reward"
            className="group inline-flex items-center gap-2 rounded-full border border-border bg-bg-elevated/40 px-3 py-1 text-xs text-ink-muted backdrop-blur hover:border-brand-400/40 hover:text-ink transition-colors"
          >
            <Trophy size={12} className="text-gold-500" />
            <span>90% of protocol fees go back to swappers &amp; LPs</span>
            <Sparkles size={12} className="text-brand-400" />
          </Link>

          <h1 className="mt-6 font-display text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
            <span className="block text-ink">Where loyalty</span>
            <span className="block text-gradient-lift">lifts rewards.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-balance text-base text-ink-muted sm:text-lg">
            LiftUp is the stablecoin liquidity layer on Arc — native markets
            for <span className="text-ink">USDC, EURC and cirBTC</span>,
            CCTP-native bridging, and a loyalty-weighted reward engine that
            returns <span className="text-ink">90% of every fee</span> to the
            people who provide liquidity and use the protocol.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <Link href="/swap">
              <GradientButton rightIcon={<ArrowUpRight size={16} />}>
                Launch the App
              </GradientButton>
            </Link>
            <Link href="/reward">
              <GradientButton variant="outline">How rewards work</GradientButton>
            </Link>
          </div>

          {/* Live KPI cards — TVL · 7d volume · active users.
              Label on top, big number below. Three side-by-side from sm+. */}
          <ul className="mt-12 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
            {stats.map((s, i) => (
              <motion.li
                key={s.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 + i * 0.06 }}
                className="rounded-3xl border border-border bg-bg-surface/50 px-6 py-5 text-left backdrop-blur shadow-card-lift"
              >
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-muted">
                  {s.label}
                </div>
                <div className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                  {s.value}
                </div>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </Container>
    </section>
  );
}
