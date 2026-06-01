'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Wallet } from 'lucide-react';
import { parseUnits } from 'viem';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { cn, formatNumber } from '@/lib/utils';
import { TokenIcon } from '@/components/features/swap/TokenIcon';
import { useAddLiquidity } from '@/hook/useAddLiquidity';
import { useTokenBalances } from '@/hook/useTokenBalances';
import type { PoolStats } from '@/hook/usePoolStats';
import type { PoolEntry } from '@/lib/pools';

export function AddLiquidityForm({
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
  // Native USDC has decimals 18 in the user's wallet but 6 on chain (it's
  // wrapped in a 6-dp ERC-20 at a precompile address). Use the WRAPPED
  // decimals for parseUnits — that matches the pair's expectation.
  const decimalsA = tokenA.native ? 6 : tokenA.decimals;
  const decimalsB = tokenB.native ? 6 : tokenB.decimals;

  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [slippage, setSlippage] = useState(0.5);
  const [lastTouched, setLastTouched] = useState<'a' | 'b'>('a');

  const { balances } = useTokenBalances();
  const balA = balances.get(tokenA.symbol);
  const balB = balances.get(tokenB.symbol);

  const tokenAOnChain = (tokenA.wrappedAddress ?? tokenA.address) as `0x${string}`;
  const tokenBOnChain = (tokenB.wrappedAddress ?? tokenB.address) as `0x${string}`;

  const {
    step,
    txHash,
    errorMessage,
    allowanceA,
    allowanceB,
    approveA,
    approveB,
    addLiquidity,
    reset,
  } = useAddLiquidity({
    tokenA: tokenAOnChain,
    tokenB: tokenBOnChain,
    decimalsA,
    decimalsB,
  });

  // Auto-balance the un-touched leg using the live pool ratio.
  // For an empty (just-created) pool with no reserves, both legs stay
  // independent — the first add defines the locked-in ratio.
  useEffect(() => {
    if (!stats || stats.priceEurcPerUsdc <= 0) return;
    const ratio = stats.priceEurcPerUsdc; // = reserveB_human / reserveA_human
    if (lastTouched === 'a') {
      const n = parseFloat(amountA);
      if (!Number.isFinite(n) || n <= 0) {
        setAmountB('');
        return;
      }
      setAmountB(
        (n * ratio)
          .toFixed(decimalsB)
          .replace(/0+$/, '')
          .replace(/\.$/, ''),
      );
    } else {
      const n = parseFloat(amountB);
      if (!Number.isFinite(n) || n <= 0) {
        setAmountA('');
        return;
      }
      setAmountA(
        (n / ratio)
          .toFixed(decimalsA)
          .replace(/0+$/, '')
          .replace(/\.$/, ''),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountA, amountB, stats?.priceEurcPerUsdc, lastTouched]);

  const aWei = useMemo(() => {
    try {
      return amountA && parseFloat(amountA) > 0
        ? parseUnits(amountA, decimalsA)
        : 0n;
    } catch {
      return 0n;
    }
  }, [amountA, decimalsA]);

  const bWei = useMemo(() => {
    try {
      return amountB && parseFloat(amountB) > 0
        ? parseUnits(amountB, decimalsB)
        : 0n;
    } catch {
      return 0n;
    }
  }, [amountB, decimalsB]);

  const insufficientA =
    aWei > 0n && balA !== undefined && parseFloat(amountA) > balA.formatted;
  const insufficientB =
    bWei > 0n && balB !== undefined && parseFloat(amountB) > balB.formatted;
  const insufficient = insufficientA || insufficientB;

  const needsApproveA = aWei > 0n && allowanceA < aWei;
  const needsApproveB = bWei > 0n && allowanceB < bWei;

  const handleSuccess = step === 'success' ? onSuccess : undefined;
  useEffect(() => {
    if (handleSuccess) handleSuccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSuccess]);

  // Primary button cycles through approvals + final add.
  let primary: { label: string; onClick: () => void; disabled?: boolean; spinning?: boolean };
  if (!isConnected) {
    primary = { label: 'Connect Wallet', onClick: () => open() };
  } else if (aWei === 0n || bWei === 0n) {
    primary = { label: 'Enter amounts', onClick: () => {}, disabled: true };
  } else if (insufficient) {
    primary = {
      label: `Insufficient ${insufficientA ? tokenA.symbol : tokenB.symbol}`,
      onClick: () => {},
      disabled: true,
    };
  } else if (step === 'approving-a') {
    primary = {
      label: `APPROVING ${tokenA.symbol}…`,
      onClick: () => {},
      disabled: true,
      spinning: true,
    };
  } else if (step === 'approving-b') {
    primary = {
      label: `APPROVING ${tokenB.symbol}…`,
      onClick: () => {},
      disabled: true,
      spinning: true,
    };
  } else if (step === 'adding') {
    primary = {
      label: 'ADDING LIQUIDITY…',
      onClick: () => {},
      disabled: true,
      spinning: true,
    };
  } else if (needsApproveA) {
    primary = {
      label: `APPROVE ${tokenA.symbol}`,
      onClick: () => void approveA(aWei),
    };
  } else if (needsApproveB) {
    primary = {
      label: `APPROVE ${tokenB.symbol}`,
      onClick: () => void approveB(bWei),
    };
  } else {
    primary = {
      label: 'Add liquidity',
      onClick: () =>
        void addLiquidity({
          amountA,
          amountB,
          slippagePct: slippage,
        }),
    };
  }

  const inputClass =
    'w-full bg-transparent font-display text-2xl font-semibold tracking-tight text-ink outline-none placeholder:text-ink-subtle';

  const tokenSlot = (token: typeof tokenA) => (
    <div className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-bg-elevated/70 px-2.5 py-2 text-sm font-medium">
      <TokenIcon token={token} size={22} />
      {token.symbol}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Token A input */}
      <div className="rounded-2xl border border-border bg-bg-base/60 p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-muted">Deposit {tokenA.symbol}</span>
          {balA && (
            <button
              type="button"
              onClick={() => {
                setLastTouched('a');
                setAmountA(String(balA.formatted));
              }}
              className="text-ink-subtle hover:text-brand-400"
            >
              Balance: {formatNumber(balA.formatted, balA.formatted < 1 ? 6 : 4)}
            </button>
          )}
        </div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <input
            inputMode="decimal"
            placeholder="0.0"
            value={amountA}
            onChange={(e) => {
              setLastTouched('a');
              const v = e.target.value.replace(',', '.');
              if (v === '' || /^[0-9]*\.?[0-9]*$/.test(v)) setAmountA(v);
            }}
            className={inputClass}
          />
          {tokenSlot(tokenA)}
        </div>
      </div>

      <div className="flex justify-center">
        <Plus size={14} className="text-ink-muted" />
      </div>

      {/* Token B input */}
      <div className="rounded-2xl border border-border bg-bg-base/60 p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-muted">Deposit {tokenB.symbol}</span>
          {balB && (
            <button
              type="button"
              onClick={() => {
                setLastTouched('b');
                setAmountB(String(balB.formatted));
              }}
              className="text-ink-subtle hover:text-brand-400"
            >
              Balance: {formatNumber(balB.formatted, balB.formatted < 1 ? 6 : 4)}
            </button>
          )}
        </div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <input
            inputMode="decimal"
            placeholder="0.0"
            value={amountB}
            onChange={(e) => {
              setLastTouched('b');
              const v = e.target.value.replace(',', '.');
              if (v === '' || /^[0-9]*\.?[0-9]*$/.test(v)) setAmountB(v);
            }}
            className={inputClass}
          />
          {tokenSlot(tokenB)}
        </div>
      </div>

      {/* Slippage row */}
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
          <p className="font-medium text-brand-400">Liquidity added</p>
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
            onClick={() => {
              reset();
              setAmountA('');
              setAmountB('');
            }}
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
