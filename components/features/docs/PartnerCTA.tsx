'use client';

import Link from 'next/link';
import { ExternalLink, MessageCircle } from 'lucide-react';
import { Container } from '@/components/common/Container';

export function PartnerCTA() {
  return (
    <section className="relative py-16">
      <Container className="max-w-4xl">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-bg-surface/60 p-10 backdrop-blur-xl sm:p-14">
          <div className="absolute -top-32 left-1/2 h-64 w-[640px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />
          <div className="absolute -bottom-24 right-10 h-64 w-[420px] rounded-full bg-violet-500/15 blur-3xl" />

          <div className="relative mx-auto max-w-2xl text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-gold-500">
              Partner with LiftUp
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Aggregator?{' '}
              <span className="text-gradient-lift">Front-end builder?</span>
            </h2>
            <p className="mt-4 text-sm text-ink-muted">
              We&apos;ll co-promote any aggregator that lists LiftUp Pool as a
              routing source on Arc — protocol-level partnerships only. Reach
              out and we&apos;ll wire you into the next testnet snapshot +
              mainnet launch list.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Link
                href="https://github.com/anhdopc/liftup"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-bg-base/60 px-5 py-3 text-sm text-ink transition-colors hover:border-brand-400/40"
              >
                <ExternalLink size={15} />
                Source on GitHub
              </Link>
              <Link
                href="https://github.com/anhdopc/liftup/issues/new?title=Partnership+inquiry&labels=partnership"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-lift-gradient px-5 py-3 font-display text-sm font-semibold text-bg-base shadow-glow transition-all hover:-translate-y-0.5"
              >
                <MessageCircle size={15} />
                Open partnership issue
              </Link>
            </div>

            <p className="mt-6 text-[11px] text-ink-subtle">
              Aggregator integrations (1inch · Paraswap · OpenOcean · Matcha)
              will be filed after the audited mainnet release.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
