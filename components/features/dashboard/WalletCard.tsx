'use client';

import Link from 'next/link';
import { Copy, ExternalLink, Wallet } from 'lucide-react';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { arcTestnet } from '@/lib/chains';
import { findToken } from '@/lib/tokens';
import { cn, formatNumber, shortenAddress } from '@/lib/utils';
import { TokenIcon } from '@/components/features/swap/TokenIcon';
import { useTokenBalances } from '@/hook/useTokenBalances';

export function WalletCard() {
  const { open } = useAppKit();
  const { isConnected, address } = useAppKitAccount();
  const { balances } = useTokenBalances();

  const usdc = findToken('USDC')!;
  const eurc = findToken('EURC')!;
  const usdcBal = balances.get('USDC');
  const eurcBal = balances.get('EURC');

  if (!isConnected || !address) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-border bg-bg-surface/40 px-5 py-6 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-elevated/60">
            <Wallet size={16} className="text-ink-muted" />
          </div>
          <div>
            <div className="text-sm font-medium text-ink">Wallet disconnected</div>
            <div className="text-xs text-ink-muted">
              Connect to see your balances + LP positions.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => open()}
          className="rounded-xl border border-brand-400/40 bg-brand-500/10 px-3 py-2 text-sm font-medium text-brand-400 hover:bg-brand-500/20"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-bg-surface/40 p-5 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-lift-gradient text-bg-base">
            <Wallet size={16} />
          </div>
          <div>
            <div className="font-display text-sm font-medium text-ink">
              {shortenAddress(address)}
            </div>
            <div className="text-[11px] text-ink-muted">Connected · Arc Testnet</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (typeof navigator !== 'undefined' && navigator.clipboard) {
                void navigator.clipboard.writeText(address);
              }
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted hover:border-brand-400/40 hover:text-brand-400"
            aria-label="Copy address"
            title="Copy address"
          >
            <Copy size={13} />
          </button>
          <Link
            href={`${arcTestnet.blockExplorers.default.url}/address/${address}`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted hover:border-brand-400/40 hover:text-brand-400"
            aria-label="Open on ArcScan"
            title="View on ArcScan"
          >
            <ExternalLink size={13} />
          </Link>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <BalanceTile
          token={usdc}
          formatted={usdcBal ? formatNumber(usdcBal.formatted, 4) : '—'}
          sub={usdcBal ? `≈ $${formatNumber(usdcBal.formatted * usdc.priceUsd, 2)}` : undefined}
        />
        <BalanceTile
          token={eurc}
          formatted={eurcBal ? formatNumber(eurcBal.formatted, 4) : '—'}
          sub={eurcBal ? `≈ $${formatNumber(eurcBal.formatted * eurc.priceUsd, 2)}` : undefined}
        />
      </div>
    </div>
  );
}

function BalanceTile({
  token,
  formatted,
  sub,
}: {
  token: ReturnType<typeof findToken> extends infer T ? NonNullable<T> : never;
  formatted: string;
  sub?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-border bg-bg-base/40 px-3 py-3')}>
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        <TokenIcon token={token} size={18} />
        <span>{token.symbol}</span>
      </div>
      <div className="mt-1 font-display text-lg font-semibold tabular-nums tracking-tight">
        {formatted}
      </div>
      {sub && <div className="text-[11px] text-ink-subtle">{sub}</div>}
    </div>
  );
}
