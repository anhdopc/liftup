'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Container } from '@/components/common/Container';
import { GradientButton } from '@/components/common/GradientButton';

export function CTA() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container>
        <div className="relative overflow-hidden rounded-3xl border border-border bg-bg-surface/60 p-10 backdrop-blur-xl sm:p-16">
          <div className="absolute -top-32 left-1/2 h-64 w-[640px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />
          <div className="absolute -bottom-24 right-10 h-64 w-[420px] rounded-full bg-violet-500/15 blur-3xl" />

          <div className="relative mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">
              Trade <span className="text-gradient-lift">stablecoins</span> in one second.
            </h2>
            <p className="mt-4 text-ink-muted">
              Connect once, swap USDC ↔ EURC at FX-grade pricing. Gas is paid in dollars, settlement
              is on-chain, and your keys never leave your wallet.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/swap">
                <GradientButton rightIcon={<ArrowUpRight size={16} />}>
                  Launch the App
                </GradientButton>
              </Link>
              <Link href="/docs">
                <GradientButton variant="outline">Read the docs</GradientButton>
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
