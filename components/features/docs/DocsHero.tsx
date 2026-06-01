'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Code, ExternalLink, Sparkles, ArrowUpRight } from 'lucide-react';
import { Container } from '@/components/common/Container';
import { GradientButton } from '@/components/common/GradientButton';

export function DocsHero() {
  return (
    <section className="relative isolate pt-32 pb-12 sm:pt-40 sm:pb-16">
      <Container>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto flex max-w-3xl flex-col items-center text-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-elevated/40 px-3 py-1 text-xs text-ink-muted backdrop-blur">
            <Sparkles size={12} className="text-brand-400" />
            <span>For integrators · aggregators · partner protocols</span>
          </span>

          <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            <span className="block text-ink">Integrate LiftUp</span>
            <span className="block text-gradient-lift">in five minutes.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-balance text-base text-ink-muted sm:text-lg">
            LiftUp is the stablecoin liquidity layer on Arc — Uniswap-V2-
            compatible AMM with a 0.05% fee tier across{' '}
            <span className="text-ink">USDC / EURC / cirBTC</span> pairs and
            a CCTP-native bridge. Any aggregator that speaks the V2 ABI can
            route through it — addresses, fee math, and integration samples
            below.
          </p>

          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <Link href="#contracts">
              <GradientButton rightIcon={<ArrowUpRight size={16} />}>
                See contracts
              </GradientButton>
            </Link>
            <Link href="#sample-code">
              <GradientButton variant="outline" leftIcon={<Code size={16} />}>
                Sample code
              </GradientButton>
            </Link>
          </div>

          <div className="mt-8 inline-flex items-center gap-2 text-xs text-ink-subtle">
            <ExternalLink size={12} />
            <span>
              Testnet only for now — mainnet integration form opens with
              the audited v1.1 release.
            </span>
          </div>
        </motion.div>
      </Container>
    </section>
  );
}
