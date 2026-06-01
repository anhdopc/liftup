'use client';

import { motion } from 'framer-motion';
import { ExternalLink, FileText, GitBranch } from 'lucide-react';
import { Container } from '@/components/common/Container';

const GITHUB_BASE = 'https://github.com/anhdopc/liftup/blob/main/docs';

const DOCS = [
  {
    title: 'Lift Engine Spec',
    file: 'lift-engine-spec.md',
    desc:
      'Full specification of the v1.1 reward layer — 8 sub-buckets, pro-rata accrual, instant trader cashback, claim mechanism, bounded launch boost. The contract being audited.',
    icon: FileText,
    tone: 'brand' as const,
  },
  {
    title: 'Migration Plan (v0 → v1.1)',
    file: 'lift-engine-migration.md',
    desc:
      'Step-by-step migration from the v0 lottery distributor to LiftEngine. LP positions stay intact (no remove + re-add); only factory.feeTo() switches in one tx.',
    icon: GitBranch,
    tone: 'violet' as const,
  },
];

export function LiftEngineSpec() {
  return (
    <section id="lift-engine" className="relative py-20">
      <Container className="max-w-5xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-gold-500">
            Lift Engine v1.1
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            <span className="text-gradient-lift">Open-source primitive</span>, fully specified.
          </h2>
          <p className="mt-3 text-sm text-ink-muted">
            Pro-rata distribution layer with per-swap cashback + claim
            mechanism. Replaces v0 lottery-style distributor. Currently
            in audit scope ($15k grant). Migration preserves all LP
            positions — no remove + re-add required.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {DOCS.map((d, i) => {
            const Icon = d.icon;
            const tone = {
              brand: 'border-brand-400/30 hover:border-brand-400/60',
              violet: 'border-violet-500/30 hover:border-violet-500/60',
            }[d.tone];
            const iconCls = {
              brand: 'text-brand-400 border-brand-400/30',
              violet: 'text-violet-400 border-violet-500/30',
            }[d.tone];
            return (
              <motion.a
                key={d.file}
                href={`${GITHUB_BASE}/${d.file}`}
                target="_blank"
                rel="noreferrer noopener"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className={`group flex flex-col gap-4 rounded-3xl border ${tone} bg-bg-surface/40 p-7 backdrop-blur transition-colors`}
              >
                <div className="flex items-start justify-between">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl border bg-bg-base ${iconCls}`}
                  >
                    <Icon size={18} />
                  </div>
                  <ExternalLink size={14} className="text-ink-subtle group-hover:text-ink" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                    {d.title}
                  </h3>
                  <p className="mt-2 text-sm text-ink-muted">{d.desc}</p>
                </div>
                <div className="mt-auto text-[11px] uppercase tracking-[0.16em] text-ink-subtle">
                  /docs/{d.file} · view on github
                </div>
              </motion.a>
            );
          })}
        </div>

        {/* Compact summary table — what's NEW in Lift Engine */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.4 }}
          className="mt-6 overflow-hidden rounded-3xl border border-border bg-bg-surface/40 backdrop-blur"
        >
          <div className="border-b border-border bg-bg-base/40 px-6 py-3">
            <span className="text-[11px] uppercase tracking-[0.16em] text-gold-500">
              v0 lottery vs v1.1 Lift Engine
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-base/30 text-left text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
                <th className="px-5 py-3 font-medium">Aspect</th>
                <th className="px-5 py-3 font-medium">v0 (current)</th>
                <th className="px-5 py-3 font-medium">v1.1 (Lift Engine)</th>
              </tr>
            </thead>
            <tbody className="text-ink-muted">
              <RowDiff
                label="Selection"
                v0="Random recipient sampling (PRNG)"
                v1="Deterministic pro-rata by weight"
              />
              <RowDiff
                label="Trader path"
                v0="Random lottery winners"
                v1="Instant cashback per swap + weekly/monthly bonus"
              />
              <RowDiff
                label="LP path"
                v0="Random + pro-rata split"
                v1="Pure pro-rata weighted by tier × tenure"
              />
              <RowDiff
                label="Payout flow"
                v0="Pushed by owner-gated distribute*"
                v1="User-pulled claim() — sub-cent gas"
              />
              <RowDiff
                label="Multipliers"
                v0="Soft tier + tenure (off-chain)"
                v1="On-chain tier + tenure + bounded launch boost"
              />
              <RowDiff
                label="Sub-buckets"
                v0="5 buckets"
                v1="8 (growth + bonus + 3 cadences × LP/Trader)"
                last
              />
            </tbody>
          </table>
        </motion.div>
      </Container>
    </section>
  );
}

function RowDiff({
  label,
  v0,
  v1,
  last,
}: {
  label: string;
  v0: string;
  v1: string;
  last?: boolean;
}) {
  return (
    <tr className={last ? '' : 'border-b border-border/60'}>
      <td className="px-5 py-3 font-medium text-ink">{label}</td>
      <td className="px-5 py-3 text-[13px]">{v0}</td>
      <td className="px-5 py-3 text-[13px] text-ink">{v1}</td>
    </tr>
  );
}
