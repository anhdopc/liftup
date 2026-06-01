'use client';

import { useState } from 'react';
import { Copy, CheckCircle2, ExternalLink } from 'lucide-react';
import { Container } from '@/components/common/Container';
import { arcTestnet } from '@/lib/chains';
import {
  LIFTUP_FACTORY,
  LIFTUP_ROUTER,
  LIFTUP_REWARD_DISTRIBUTOR,
  LIFTUP_PAIR_USDC_EURC,
  LIFTUP_PAIR_USDC_CIRBTC,
  LIFTUP_PAIR_EURC_CIRBTC,
} from '@/lib/liftupAmm';
import { USDC_ON_ARC, EURC_ON_ARC, CIRBTC_ON_ARC } from '@/lib/tokens';

interface Row {
  name: string;
  address: `0x${string}`;
  note: string;
}

const CORE_ROWS: Row[] = [
  {
    name: 'LiftupFactory',
    address: LIFTUP_FACTORY,
    note: 'Deploys pairs via CREATE2 · constructor(feeToSetter)',
  },
  {
    name: 'LiftupRouter',
    address: LIFTUP_ROUTER,
    note: 'V2 router · swapExactTokensForTokens, addLiquidity, removeLiquidity',
  },
  {
    name: 'LiftupRewardDistributor',
    address: LIFTUP_REWARD_DISTRIBUTOR,
    note: 'Receives 100% of pool fees + Circle 10 bps surcharge · 5 buckets',
  },
  {
    name: 'LiftupPair (USDC/EURC)',
    address: LIFTUP_PAIR_USDC_EURC,
    note: '0.05% fee · standard V2 Swap/Mint/Burn events',
  },
  {
    name: 'LiftupPair (USDC/cirBTC)',
    address: LIFTUP_PAIR_USDC_CIRBTC,
    note: '0.05% fee · USDC-quoted BTC market via Circle Wrapped BTC',
  },
  {
    name: 'LiftupPair (EURC/cirBTC)',
    address: LIFTUP_PAIR_EURC_CIRBTC,
    note: '0.05% fee · EURC-quoted BTC market via Circle Wrapped BTC',
  },
];

const TOKEN_ROWS: Row[] = [
  { name: 'USDC', address: USDC_ON_ARC, note: '6 decimals · Arc native gas token' },
  { name: 'EURC', address: EURC_ON_ARC, note: '6 decimals · euro stablecoin' },
  { name: 'cirBTC', address: CIRBTC_ON_ARC, note: '8 decimals · Circle Wrapped Bitcoin' },
];

const NETWORK = {
  name: 'Arc Testnet',
  chainId: 5042002,
  rpc: 'https://rpc.testnet.arc.network',
  explorer: arcTestnet.blockExplorers.default.url,
};

export function ContractsTable() {
  return (
    <section id="contracts" className="relative py-16">
      <Container className="max-w-5xl">
        <SectionHeader
          eyebrow="Contracts"
          title="Addresses & network"
          sub="Everything is on Arc Testnet (chainId 5042002). Click an address to view on ArcScan."
        />

        {/* Network card */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NetworkPill label="Network" value={NETWORK.name} />
          <NetworkPill label="Chain ID" value={NETWORK.chainId.toString()} mono />
          <NetworkPill label="RPC" value={NETWORK.rpc} mono />
          <NetworkPill label="Explorer" value={NETWORK.explorer.replace(/^https?:\/\//, '')} mono />
        </div>

        {/* Core contracts */}
        <h3 className="mt-12 font-display text-sm font-semibold uppercase tracking-[0.18em] text-gold-500">
          Core contracts
        </h3>
        <div className="mt-3 overflow-hidden rounded-3xl border border-border bg-bg-surface/40 backdrop-blur">
          {CORE_ROWS.map((r, i) => (
            <ContractRow key={r.address} row={r} last={i === CORE_ROWS.length - 1} />
          ))}
        </div>

        {/* Token contracts */}
        <h3 className="mt-10 font-display text-sm font-semibold uppercase tracking-[0.18em] text-gold-500">
          Token contracts
        </h3>
        <div className="mt-3 overflow-hidden rounded-3xl border border-border bg-bg-surface/40 backdrop-blur">
          {TOKEN_ROWS.map((r, i) => (
            <ContractRow key={r.address} row={r} last={i === TOKEN_ROWS.length - 1} />
          ))}
        </div>
      </Container>
    </section>
  );
}

function NetworkPill({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-bg-surface/40 px-4 py-3 backdrop-blur">
      <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle">{label}</div>
      <div
        className={`mt-1 truncate text-sm text-ink ${mono ? 'font-mono' : 'font-display font-medium'}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function ContractRow({ row, last }: { row: Row; last: boolean }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(row.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <div
      className={`grid grid-cols-[1.4fr_1.6fr_auto] items-center gap-4 px-5 py-4 ${
        last ? '' : 'border-b border-border/60'
      }`}
    >
      <div>
        <div className="font-display text-sm font-medium text-ink">{row.name}</div>
        <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">{row.note}</p>
      </div>
      <div className="overflow-hidden font-mono text-xs text-ink">
        <span className="hidden xl:inline">{row.address}</span>
        <span className="xl:hidden">
          {row.address.slice(0, 8)}…{row.address.slice(-8)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-base/60 px-2.5 py-1.5 text-[11px] text-ink-muted transition-colors hover:border-brand-400/40 hover:text-ink"
        >
          {copied ? (
            <>
              <CheckCircle2 size={12} className="text-brand-400" />
              Copied
            </>
          ) : (
            <>
              <Copy size={12} />
              Copy
            </>
          )}
        </button>
        <a
          href={`${arcTestnet.blockExplorers.default.url}/address/${row.address}`}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-base/60 px-2.5 py-1.5 text-[11px] text-ink-muted transition-colors hover:border-brand-400/40 hover:text-ink"
        >
          <ExternalLink size={12} />
          ArcScan
        </a>
      </div>
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: React.ReactNode;
  sub: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-xs uppercase tracking-[0.18em] text-gold-500">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      <p className="mt-3 text-sm text-ink-muted">{sub}</p>
    </div>
  );
}
