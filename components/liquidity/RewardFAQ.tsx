'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

type FaqItem = {
  q: string;
  a: React.ReactNode;
};

const FAQS: FaqItem[] = [
  {
    q: 'How much does each swap cost?',
    a: (
      <>
        <span className="text-ink">0.05%</span> on LiftUp Pool swaps (the
        stable-pair tier — Aerodrome / Curve range). On the Circle App Kit
        route, LiftUp adds <span className="text-ink">10 bps</span> on top of
        Circle&apos;s own fee. Both fees land in the on-chain
        RewardDistributor.
      </>
    ),
  },
  {
    q: 'Where do the fees actually go?',
    a: (
      <>
        100% of every protocol fee is sent to the on-chain
        RewardDistributor contract. <span className="text-ink">settle()</span>{' '}
        splits the inflow into 5 buckets per fixed constants —{' '}
        <span className="text-ink">10% growth · 31.5% daily · 31.5% weekly ·
        22.5% monthly · 4.5% bonus</span>. The splits cannot be changed even
        by the owner.
      </>
    ),
  },
  {
    q: 'How do I earn rewards?',
    a: (
      <>
        Two paths, both feed off the same buckets:
        <ul className="mt-2 space-y-1.5 pl-4">
          <li>
            <span className="text-ink">Swap:</span> every USDC / EURC / cirBTC
            trade on LiftUp Pool earns loyalty weight in the daily / weekly /
            monthly reward distributions. Daily = flat odds, weekly + monthly =
            volume-weighted.
          </li>
          <li>
            <span className="text-ink">Provide LP:</span> 20% of each bucket
            pays out pro-rata by your % of pool (steady yield) + another 20%
            via a loyalty-weighted distribution with conviction tier &amp;
            tenure multipliers.
          </li>
        </ul>
      </>
    ),
  },
  {
    q: 'Who picks the recipients — is it really random?',
    a: (
      <>
        Off-chain bot using a deterministic PRNG seeded by{' '}
        <span className="font-mono text-ink">
          sha256(block_hash : cadence_label)
        </span>
        . The seed is printed in every distribution log so anyone can
        reproduce the recipient list against the on-chain
        <span className="text-ink"> Distributed</span> events. Mainnet will
        upgrade to Chainlink VRF or commit-reveal for verifiable randomness.
      </>
    ),
  },
  {
    q: 'What stops Sybil farming?',
    a: (
      <>
        Daily flat-odds + a $100 swap-or-LP gate cap the upside of multi-
        wallet farming. Weekly + monthly are volume-weighted so splitting
        across wallets dilutes — same expected value, more gas paid. LP needs
        a <span className="text-ink">24-hour hold</span> before counting
        toward eligibility. Every distribution produces unique users only.
      </>
    ),
  },
  {
    q: 'When does the cron actually run?',
    a: (
      <>
        GitHub Actions workflow fires:
        <ul className="mt-2 space-y-1 pl-4">
          <li>
            <span className="text-ink">10:00 UTC every day</span> for the
            daily distribution (one tx drains yesterday&apos;s bucket — 24
            trader recipients + 24 LP loyalty-distribution recipients +
            pro-rata to every qualified LP)
          </li>
          <li>
            <span className="text-ink">Monday 10:00 UTC</span> for the weekly
            distribution (7 users, volume-weighted)
          </li>
          <li>
            <span className="text-ink">1st of month 10:00 UTC</span> for the
            monthly distribution (5 users, volume-weighted)
          </li>
        </ul>
        <p className="mt-2">
          Each run is logged in the GitHub Actions tab and emits a
          Distributed event you can read on ArcScan.
        </p>
      </>
    ),
  },
  {
    q: 'What about the bonus bucket?',
    a: (
      <>
        4.5% accrues to a separate bonus bucket but there&apos;s no scheduled
        bonus program right now. A manual sweep job folds it into the growth
        wallet periodically — when a community event launches, that sweep
        stops and the bonus pays the event participants.
      </>
    ),
  },
  {
    q: 'Will the contracts be upgraded?',
    a: (
      <>
        Distributor splits are <span className="text-ink">constants</span>,
        not setters — they cannot be upgraded. Owner functions are limited to
        selecting recipients from bucket balances. Before mainnet, ownership
        migrates to a 3-of-5 multi-sig (published founders).
      </>
    ),
  },
];

export function RewardFAQ() {
  return (
    <section id="faq" className="relative py-20">
      <div className="mx-auto max-w-3xl px-4">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-gold-500">FAQ</p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            What&apos;s live · <span className="text-gradient-lift">how it works</span>
          </h2>
          <p className="mt-4 text-ink-muted">
            Every claim below is on-chain right now. Open an item to verify
            with the relevant contract reference.
          </p>
        </div>

        <div className="mt-10 divide-y divide-border overflow-hidden rounded-3xl border border-border bg-bg-surface/40 backdrop-blur">
          {FAQS.map((item, i) => (
            <FaqRow key={item.q} item={item} initialOpen={i === 0} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqRow({
  item,
  initialOpen,
}: {
  item: FaqItem;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!initialOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-bg-base/30"
        aria-expanded={open}
      >
        <span className="font-display text-sm font-medium text-ink sm:text-base">
          {item.q}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-5 text-sm leading-relaxed text-ink-muted">
              {item.a}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
