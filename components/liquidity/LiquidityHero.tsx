'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowUpRight, Trophy, Sparkles } from 'lucide-react';
import { Container } from '@/components/common/Container';
import { GradientButton } from '@/components/common/GradientButton';

export function LiquidityHero() {
  return (
    <section className="relative isolate pt-32 pb-16 sm:pt-40 sm:pb-20">
      <Container>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto flex max-w-3xl flex-col items-center text-center"
        >
          <span className="group inline-flex items-center gap-2 rounded-full border border-border bg-bg-elevated/40 px-3 py-1 text-xs text-ink-muted backdrop-blur">
            <Trophy size={12} className="text-gold-500" />
            <span>LiftUp / Money — protocol &amp; reward model</span>
          </span>

          <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            <span className="block text-ink">Where liquidity</span>
            <span className="block text-gradient-lift">lifts rewards.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-balance text-base text-ink-muted sm:text-lg">
            LiftUp turns every swap fee into transparent yield. 100% of the
            0.05% LP fee skims out of the pool into the on-chain
            RewardDistributor — 10% funds growth, 90% flows back to traders
            and liquidity providers through three on-chain reward pools.
          </p>

          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <Link href="/swap">
              <GradientButton rightIcon={<ArrowUpRight size={16} />}>
                Start swapping to earn
              </GradientButton>
            </Link>
            <Link href="/liquidity">
              <GradientButton variant="outline" leftIcon={<Sparkles size={16} />}>
                Provide liquidity
              </GradientButton>
            </Link>
          </div>

          <div className="mt-10 grid w-full max-w-2xl grid-cols-3 gap-3 text-left">
            <Stat label="To treasury" value="100%" />
            <Stat label="Growth + mkt" value="10%" tone="gold" />
            <Stat label="Back to users" value="90%" tone="brand" />
          </div>
        </motion.div>
      </Container>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'brand' | 'gold';
}) {
  const colorCls =
    tone === 'brand'
      ? 'text-brand-400 border-brand-400/30 bg-brand-500/[0.04]'
      : tone === 'gold'
      ? 'text-gold-500 border-gold-500/30 bg-gold-500/[0.04]'
      : 'text-ink border-border bg-bg-surface/40';
  return (
    <div className={`rounded-2xl border ${colorCls} px-4 py-3 backdrop-blur`}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-ink-subtle">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}
