'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowDown, ChevronDown, Info, Loader2, Wallet, Zap } from 'lucide-react';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { BRIDGE_CHAINS, type BridgeChainInfo } from '@/lib/bridgeChains';
import { isCircleKitConfigured } from '@/lib/circleKit';
import { cn, formatNumber } from '@/lib/utils';
import { useBridge, type BridgeSpeed } from '@/hook/useBridge';
import { ChainIcon } from './ChainIcon';
import { ChainDialog } from './ChainDialog';

const ARC = BRIDGE_CHAINS.find((c) => c.isArc)!;
const DEFAULT_SOURCE = BRIDGE_CHAINS.find(
  (c) => c.bridgeChain === 'Ethereum_Sepolia',
)!;

export function BridgeCard() {
  const { open } = useAppKit();
  const { isConnected } = useAppKitAccount();
  const kitConfigured = isCircleKitConfigured();

  const [fromChain, setFromChain] = useState<BridgeChainInfo>(DEFAULT_SOURCE);
  const [toChain, setToChain] = useState<BridgeChainInfo>(ARC);
  const [amount, setAmount] = useState('');
  const [speed, setSpeed] = useState<BridgeSpeed>('FAST');
  const [dialog, setDialog] = useState<'from' | 'to' | null>(null);

  const { execute, step, result, errorMessage, reset } = useBridge();

  const hasInput = !!amount && parseFloat(amount) > 0;

  const flip = () => {
    setFromChain(toChain);
    setToChain(fromChain);
  };

  let primary:
    | { variant: 'connect'; label: string; onClick: () => void; disabled?: boolean }
    | { variant: 'enter' | 'insufficient' | 'pending' | 'bridge'; label: string; onClick: () => void; disabled?: boolean };

  if (!isConnected) {
    primary = { variant: 'connect', label: 'Connect Wallet', onClick: () => open() };
  } else if (!kitConfigured) {
    primary = {
      variant: 'insufficient',
      label: 'Bridge engine — kit key not set',
      onClick: () => {},
      disabled: true,
    };
  } else if (!hasInput) {
    primary = {
      variant: 'enter',
      label: 'Enter an amount',
      onClick: () => {},
      disabled: true,
    };
  } else if (step === 'pending') {
    primary = {
      variant: 'pending',
      label: speed === 'FAST' ? 'BRIDGING — FAST CCTP…' : 'BRIDGING — STANDARD…',
      onClick: () => {},
      disabled: true,
    };
  } else {
    primary = {
      variant: 'bridge',
      label: `Bridge USDC · ${fromChain.short} → ${toChain.short}`,
      onClick: () =>
        void execute({
          fromChain: fromChain.bridgeChain,
          toChain: toChain.bridgeChain,
          amount,
          speed,
        }),
    };
  }

  return (
    <div className="mx-auto w-full max-w-[460px]">
      <div className="px-1 pb-3">
        <h1 className="font-display text-xl font-semibold tracking-tight">Bridge</h1>
        <p className="text-xs text-ink-muted">
          Move <span className="text-brand-400">USDC</span> across CCTP networks · settles
          in {speed === 'FAST' ? 'seconds' : 'minutes'}
        </p>
      </div>

      <div className="relative rounded-3xl border border-border bg-bg-surface/60 p-3 backdrop-blur-xl shadow-card-lift">
        {/* From chain */}
        <ChainPanel
          label="From"
          chain={fromChain}
          amount={amount}
          onAmount={setAmount}
          onOpen={() => setDialog('from')}
        />

        <div className="my-2 flex justify-center">
          <button
            type="button"
            onClick={flip}
            aria-label="Flip"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-bg-base text-ink-muted shadow-glow transition-all hover:rotate-180 hover:border-brand-400/60 hover:text-brand-400"
          >
            <ArrowDown size={16} />
          </button>
        </div>

        {/* To chain */}
        <ChainPanel
          label="To"
          chain={toChain}
          amount={amount}
          readOnly
          onAmount={() => {}}
          onOpen={() => setDialog('to')}
          highlight
        />

        {/* Speed selector */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <SpeedTile
            label="Fast"
            sub="~13s · CCTP v2"
            selected={speed === 'FAST'}
            onClick={() => setSpeed('FAST')}
          />
          <SpeedTile
            label="Standard"
            sub="~10–20 min · CCTP v1"
            selected={speed === 'SLOW'}
            onClick={() => setSpeed('SLOW')}
          />
        </div>

        {/* Route summary */}
        {hasInput && (
          <div className="mt-3 space-y-2 rounded-2xl border border-border bg-bg-base/40 p-3 text-xs">
            <Row
              label="You send"
              value={`${formatNumber(parseFloat(amount), 4)} USDC on ${fromChain.short}`}
            />
            <Row
              label="You receive"
              value={`${formatNumber(parseFloat(amount), 4)} USDC on ${toChain.short}`}
            />
            <Row label="Route" value={
              <span className="inline-flex items-center gap-1.5">
                <Zap size={11} className="text-brand-400" />
                Circle Bridge Kit · CCTP {speed === 'FAST' ? 'v2 fast' : 'v1 standard'}
              </span>
            } />
          </div>
        )}

        <button
          type="button"
          onClick={primary.onClick}
          disabled={primary.disabled}
          className={cn(
            'mt-3 w-full rounded-2xl px-5 py-4 font-display font-semibold transition-all',
            primary.variant === 'bridge' || primary.variant === 'pending' || primary.variant === 'connect'
              ? 'bg-lift-gradient text-bg-base shadow-glow hover:-translate-y-0.5 hover:shadow-[0_0_60px_-10px_rgba(34,211,164,0.7)] text-sm tracking-tight'
              : 'border border-border bg-bg-elevated/40 text-ink-subtle cursor-not-allowed text-sm tracking-tight',
          )}
        >
          <span className="inline-flex items-center gap-2.5">
            {primary.variant === 'connect' && <Wallet size={15} />}
            {primary.variant === 'pending' && <Loader2 size={15} className="animate-spin" />}
            {primary.label}
          </span>
        </button>

        {step === 'success' && result && (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-brand-400/30 bg-brand-500/[0.06] px-3.5 py-2.5 text-xs">
            <div>
              <p className="font-medium text-brand-400">Bridge settled</p>
              <p className="mt-0.5 text-ink-muted">
                {result.amount} USDC from {result.sourceChainName ?? fromChain.short} →{' '}
                {result.destChainName ?? toChain.short}.
              </p>
              {result.explorerUrl && (
                <Link
                  href={result.explorerUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-1 inline-block text-brand-400 hover:underline"
                >
                  View transaction ↗
                </Link>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                reset();
                setAmount('');
              }}
              className="rounded-md border border-brand-400/30 bg-brand-500/10 px-2 py-1 text-[11px] uppercase tracking-wider text-brand-400 hover:bg-brand-500/20"
            >
              Reset
            </button>
          </div>
        )}

        {step === 'error' && errorMessage && (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/[0.06] px-3.5 py-2.5 text-xs text-red-300">
            <p className="font-medium">Bridge failed</p>
            <p className="mt-0.5 break-words text-ink-muted">{errorMessage}</p>
            <button
              type="button"
              onClick={reset}
              className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] uppercase tracking-wider text-red-300 hover:bg-red-500/20"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-bg-surface/30 px-3.5 py-3 text-xs text-ink-muted">
        <Info size={13} className="mt-0.5 shrink-0 text-brand-400" />
        <div>
          Bridge uses Circle CCTP (burn-and-mint). Make sure your wallet is on{' '}
          <span className="text-ink">{fromChain.name}</span> when you click bridge — it pays
          gas for the burn there.
        </div>
      </div>

      <ChainDialog
        open={dialog === 'from'}
        onClose={() => setDialog(null)}
        onSelect={(c) => setFromChain(c)}
        disabledChainId={toChain.chainId}
        title="From chain"
      />
      <ChainDialog
        open={dialog === 'to'}
        onClose={() => setDialog(null)}
        onSelect={(c) => setToChain(c)}
        disabledChainId={fromChain.chainId}
        title="To chain"
      />
    </div>
  );
}

function ChainPanel({
  label,
  chain,
  amount,
  onAmount,
  onOpen,
  readOnly,
  highlight,
}: {
  label: string;
  chain: BridgeChainInfo;
  amount: string;
  onAmount: (v: string) => void;
  onOpen: () => void;
  readOnly?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4 transition-colors',
        highlight
          ? 'border-brand-400/30 bg-brand-500/[0.04]'
          : 'border-border bg-bg-base/60 focus-within:border-border-strong',
      )}
    >
      <div className="text-xs text-ink-muted">{label}</div>

      <div className="mt-3 flex items-end justify-between gap-3">
        {readOnly ? (
          <motion.div
            initial={{ opacity: 0.45, filter: 'blur(2px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.4 }}
            className="font-display text-3xl font-semibold tracking-tight text-ink"
          >
            {amount || <span className="text-ink-subtle">0.0</span>}
          </motion.div>
        ) : (
          <input
            inputMode="decimal"
            pattern="^[0-9]*[.,]?[0-9]*$"
            value={amount}
            placeholder="0.0"
            onChange={(e) => {
              const v = e.target.value.replace(',', '.');
              if (v === '' || /^[0-9]*\.?[0-9]*$/.test(v)) onAmount(v);
            }}
            className="w-full bg-transparent font-display text-3xl font-semibold tracking-tight text-ink outline-none placeholder:text-ink-subtle"
          />
        )}

        <button
          type="button"
          onClick={onOpen}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-bg-elevated/70 px-2.5 py-2 text-sm font-medium hover:border-brand-400/40"
        >
          <ChainIcon chain={chain} size={22} />
          {chain.short}
          <ChevronDown size={14} className="text-ink-muted" />
        </button>
      </div>
      <div className="mt-1.5 text-xs text-ink-subtle">{chain.name}</div>
    </div>
  );
}

function SpeedTile({
  label,
  sub,
  selected,
  onClick,
}: {
  label: string;
  sub: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-brand-400/60 bg-brand-500/10'
          : 'border-border bg-bg-base/60 hover:border-border-strong',
      )}
    >
      <div className={cn('text-sm font-medium', selected ? 'text-brand-400' : 'text-ink')}>
        {label}
      </div>
      <div className="mt-0.5 text-[11px] text-ink-subtle">{sub}</div>
    </button>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-muted">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}
