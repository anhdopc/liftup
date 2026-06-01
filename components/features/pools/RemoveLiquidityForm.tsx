'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Minus, Wallet } from 'lucide-react';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { cn, formatNumber } from '@/lib/utils';
import { TokenIcon } from '@/components/features/swap/TokenIcon';
import { useRemoveLiquidity } from '@/hook/useRemoveLiquidity';
import type { PoolStats } from '@/hook/usePoolStats';
import type { Token } from '@/lib/tokens';
import type { PoolEntry } from '@/lib/pools';

const PRESETS = [25, 50, 75, 100];
const LP_DECIMALS = 6; // LiftupPair LP token is always 6-dp (Uniswap V2)

export function RemoveLiquidityForm({
  pool,
  stats,
  onSuccess,
}: {
  pool: PoolEntry;
  stats: PoolStats | null;
  onSuccess?: () => void;
}) {
  const { open } = useAppKit();
  const { isConnected } = useAppKitAccount();

  const tokenA = pool.tokenA;
  const tokenB = pool.tokenB;
  const decA = tokenA.native ? 6 : tokenA.decimals;
  const decB = tokenB.native ? 6 : tokenB.decimals;
  const tokenAOnChain = (tokenA.wrappedAddress ?? tokenA.address) as `0x${string}`;
  const tokenBOnChain = (tokenB.wrappedAddress ?? tokenB.address) as `0x${string}`;

  const [percent, setPercent] = useState(50);
  const [slippage, setSlippage] = useState(0.5);

  const {
    step,
    txHash,
    errorMessage,
    lpAllowance,
    approveLp,
    removeLiquidity,
    reset,
  } = useRemoveLiquidity({
    pair: pool.pair,
    tokenA: tokenAOnChain,
    tokenB: tokenBOnChain,
  });

  const hasLiquidity = !!stats && stats.userLp > 0n;

  // Convert percent slider -> bigint liquidity amount, and project expected
  // amounts using the pool's current reserves.
  const computed = useMemo(() => {
    if (!stats || stats.userLp === 0n || stats.totalLp === 0n) return null;
    const liquidity = (stats.userLp * BigInt(percent)) / 100n;
    if (liquidity === 0n) return null;
    const outA = (stats.reserveUsdc * liquidity) / stats.totalLp;
    const outB = (stats.reserveEurc * liquidity) / stats.totalLp;
    return { liquidity, outA, outB };
  }, [stats, percent]);

  const needsApprove = computed ? lpAllowance < computed.liquidity : false;

  const handleSuccess = step === 'success' ? onSuccess : undefined;
  useEffect(() => {
    if (handleSuccess) handleSuccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSuccess]);

  let primary: { label: string; onClick: () => void; disabled?: boolean; spinning?: boolean };
  if (!isConnected) {
    primary = { label: 'Connect Wallet', onClick: () => open() };
  } else if (!hasLiquidity) {
    primary = { label: 'No LP to withdraw', onClick: () => {}, disabled: true };
  } else if (!computed) {
    primary = { label: 'Pick a percentage', onClick: () => {}, disabled: true };
  } else if (step === 'approving-lp') {
    primary = { label: 'APPROVING LP…', onClick: () => {}, disabled: true, spinning: true };
  } else if (step === 'removing') {
    primary = { label: 'REMOVING…', onClick: () => {}, disabled: true, spinning: true };
  } else if (needsApprove) {
    primary = { label: 'APPROVE LP', onClick: () => void approveLp(computed.liquidity) };
  } else {
    primary = {
      label: `Remove ${percent}% liquidity`,
      onClick: () =>
        void removeLiquidity({
          liquidity: computed.liquidity,
          minA:
            (computed.outA * BigInt(10_000 - Math.round(slippage * 100))) / 10_000n,
          minB:
            (computed.outB * BigInt(10_000 - Math.round(slippage * 100))) / 10_000n,
        }),
    };
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-bg-base/60 p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-muted">Amount to remove</span>
          <span className="text-ink-subtle">
            {stats
              ? `${formatNumber(Number(stats.userLp) / 10 ** LP_DECIMALS, 6)} LP available`
              : '—'}
          </span>
        </div>
        <div className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">
          {percent}%
        </div>
        <input
          type="range"
          min={1}
          max={100}
          value={percent}
          onChange={(e) => setPercent(parseInt(e.target.value, 10))}
          disabled={!hasLiquidity}
          className="mt-3 w-full accent-brand-400 disabled:opacity-40"
        />
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPercent(p)}
              disabled={!hasLiquidity}
              className={cn(
                'rounded-lg border px-2 py-1.5 text-xs transition-colors',
                percent === p
                  ? 'border-brand-400/60 bg-brand-500/10 text-brand-400'
                  : 'border-border text-ink-muted hover:text-ink',
                !hasLiquidity && 'cursor-not-allowed opacity-40',
              )}
            >
              {p}%
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-center">
        <Minus size={14} className="text-ink-muted" />
      </div>

      <div className="rounded-2xl border border-border bg-bg-base/60 p-4">
        <div className="text-xs text-ink-muted">You will receive (approx)</div>
        <div className="mt-3 space-y-2">
          <ReceiveRow
            token={tokenA}
            amount={
              computed
                ? formatNumber(Number(computed.outA) / 10 ** decA, decA >= 8 ? 8 : 4)
                : '—'
            }
          />
          <ReceiveRow
            token={tokenB}
            amount={
              computed
                ? formatNumber(Number(computed.outB) / 10 ** decB, decB >= 8 ? 8 : 4)
                : '—'
            }
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border bg-bg-base/40 px-3 py-2.5 text-xs">
        <span className="text-ink-muted">Slippage tolerance</span>
        <div className="flex items-center gap-1.5">
          {[0.1, 0.5, 1].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setSlippage(p)}
              className={cn(
                'rounded-md border px-2 py-1 text-[11px] transition-colors',
                Math.abs(slippage - p) < 0.001
                  ? 'border-brand-400/50 bg-brand-500/10 text-brand-400'
                  : 'border-border text-ink-muted hover:text-ink',
              )}
            >
              {p}%
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={primary.onClick}
        disabled={primary.disabled}
        className={cn(
          'w-full rounded-2xl px-5 py-4 font-display text-sm font-semibold tracking-tight transition-all',
          !primary.disabled
            ? 'bg-lift-gradient text-bg-base shadow-glow hover:-translate-y-0.5'
            : 'border border-border bg-bg-elevated/40 text-ink-subtle cursor-not-allowed',
        )}
      >
        <span className="inline-flex items-center gap-2.5">
          {!isConnected && <Wallet size={15} />}
          {primary.spinning && <Loader2 size={15} className="animate-spin" />}
          {primary.label}
        </span>
      </button>

      {step === 'success' && txHash && (
        <div className="rounded-xl border border-brand-400/30 bg-brand-500/[0.06] px-3.5 py-2.5 text-xs">
          <p className="font-medium text-brand-400">Liquidity removed</p>
          <Link
            href={`https://testnet.arcscan.app/tx/${txHash}`}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 inline-block text-brand-400 hover:underline"
          >
            View on ArcScan ↗
          </Link>
          <button
            type="button"
            onClick={reset}
            className="ml-3 rounded-md border border-brand-400/30 px-2 py-0.5 text-[11px] uppercase tracking-wider text-brand-400 hover:bg-brand-500/10"
          >
            Reset
          </button>
        </div>
      )}

      {step === 'error' && errorMessage && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] px-3.5 py-2.5 text-xs text-red-300">
          <p className="font-medium">Transaction failed</p>
          <p className="mt-0.5 break-words text-ink-muted">{errorMessage}</p>
          <button
            type="button"
            onClick={reset}
            className="mt-2 rounded-md border border-red-500/30 px-2 py-0.5 text-[11px] uppercase tracking-wider text-red-300 hover:bg-red-500/10"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

function ReceiveRow({ token, amount }: { token: Token; amount: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <TokenIcon token={token} size={20} />
        <span className="text-sm text-ink">{token.symbol}</span>
      </div>
      <div className="font-display text-sm tabular-nums">{amount}</div>
    </div>
  );
}
