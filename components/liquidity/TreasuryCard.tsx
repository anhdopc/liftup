'use client';

import { useState } from 'react';
import { Copy, CheckCircle2, ShieldCheck, ExternalLink } from 'lucide-react';
import { arcTestnet } from '@/lib/chains';
import { LIFTUP_REWARD_DISTRIBUTOR } from '@/lib/liftupAmm';
import { shortenAddress } from '@/lib/utils';

/**
 * The on-chain RewardDistributor holds every protocol fee — 0.05% LP
 * fee from LiftupPair plus the 10 bps LiftUp surcharge that Circle
 * App Kit routes through customFee. The 10 / 31.5 / 31.5 / 22.5 / 4.5
 * split is hardcoded as contract constants, so no owner action can
 * change the allocation.
 */
const TREASURY_ADDR = LIFTUP_REWARD_DISTRIBUTOR;
const EXPLORER_URL = `${arcTestnet.blockExplorers.default.url}/address/${TREASURY_ADDR}`;

export function TreasuryCard() {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(TREASURY_ADDR);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <section id="treasury" className="relative py-20">
      <div className="mx-auto max-w-4xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-gold-500">
            Treasury transparency
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Public contract. <span className="text-gradient-lift">Public math.</span>
          </h2>
          <p className="mt-4 text-ink-muted">
            All protocol fees flow into a single on-chain RewardDistributor.
            Splits are constants in the contract — owner CANNOT change them.
            Every inflow and outflow is verifiable on ArcScan.
          </p>
        </div>

        <div className="mt-10 overflow-hidden rounded-3xl border border-border bg-bg-surface/40 backdrop-blur">
          <div className="flex flex-col gap-5 p-7 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-400/30 bg-bg-base text-brand-400 shadow-glow">
                <ShieldCheck size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-[0.16em] text-ink-subtle">
                    RewardDistributor
                  </span>
                  <span className="rounded-full border border-brand-400/30 bg-brand-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-brand-400">
                    Live · Arc Testnet
                  </span>
                </div>
                <div className="mt-1 font-mono text-sm text-ink sm:text-base">
                  <span className="hidden sm:inline">{TREASURY_ADDR}</span>
                  <span className="sm:hidden">{shortenAddress(TREASURY_ADDR, 6)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCopy}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg-base/60 px-3 py-2 text-xs text-ink-muted transition-colors hover:border-brand-400/40 hover:text-ink"
              >
                {copied ? (
                  <>
                    <CheckCircle2 size={14} className="text-brand-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    Copy
                  </>
                )}
              </button>
              <a
                href={EXPLORER_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg-base/60 px-3 py-2 text-xs text-ink-muted transition-colors hover:border-brand-400/40 hover:text-ink"
              >
                <ExternalLink size={14} />
                View on ArcScan
              </a>
            </div>
          </div>

          <div className="border-t border-border bg-bg-base/30 px-7 py-5">
            <p className="text-xs leading-relaxed text-ink-subtle">
              <span className="text-gold-500">Before mainnet:</span> contract
              ownership migrates to a 3-of-5 multi-sig (published founders).
              The five bucket constants (10 / 31.5 / 31.5 / 22.5 / 4.5 %)
              cannot be changed even by the owner — they&apos;re hardcoded into
              storage at deploy time.
            </p>
          </div>
        </div>

        {/* On-chain buckets — these are mappings INSIDE the distributor,
            not separate wallets. The split is enforced by settle(). */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <BucketStub
            name="Reward buckets"
            sub="Daily 31.5% · Weekly 31.5% · Monthly 22.5%"
            desc="The 90% reward stream. Drains via distributeDaily / Weekly / Monthly to loyalty-weighted recipients."
          />
          <BucketStub
            name="Growth bucket"
            sub="10%"
            desc="Ops budget — owner withdraws to growthWallet for grants, listings, partnerships."
          />
          <BucketStub
            name="Bonus reserve"
            sub="4.5%"
            desc="No bonus program scheduled — currently swept into the growth wallet via the off-chain sweep job until a community event ships."
          />
        </div>
      </div>
    </section>
  );
}

function BucketStub({
  name,
  sub,
  desc,
}: {
  name: string;
  sub: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-bg-surface/30 p-5 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink">{name}</span>
        <span className="rounded-full border border-brand-400/30 bg-brand-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-brand-400">
          Live
        </span>
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-gold-500">
        {sub}
      </div>
      <p className="mt-2 text-xs text-ink-muted">{desc}</p>
    </div>
  );
}
