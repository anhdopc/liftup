'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowDown, ChevronDown, Info, Loader2, RefreshCw, Wallet, Zap } from 'lucide-react';
import { useAppKit, useAppKitAccount, useAppKitNetwork } from '@reown/appkit/react';
import { findToken, type Token } from '@/lib/tokens';
import { arcTestnet, ARC_FAUCET_URL } from '@/lib/chains';
import { cn, formatNumber } from '@/lib/utils';
import { useArcGasFee } from '@/hook/useArcGasFee';
import { useAddArcNetwork } from '@/hook/useAddArcNetwork';
import { useTokenBalances, type TokenBalance } from '@/hook/useTokenBalances';
import { useSwapQuote } from '@/hook/useSwapQuote';
import { useExecuteSwap } from '@/hook/useExecuteSwap';
import { useLiftupQuote } from '@/hook/useLiftupQuote';
import { useLiftupExecute, useLiftupAllowance } from '@/hook/useLiftupExecute';
import { usePoolHealth, pairIdForTokens } from '@/hook/usePoolHealth';
import {
  isCircleKitConfigured,
  LIFTUP_FEE_BPS,
  hasLiftupFee,
} from '@/lib/circleKit';
import { isLiftupAmmDeployed } from '@/lib/liftupAmm';

type RouteEngine = 'liftup' | 'circle';
import { TokenIcon } from './TokenIcon';
import { TokenDialog } from './TokenDialog';
import { SettingsPopover, type RoutePreference } from './SettingsPopover';
import { CountdownRing } from './CountdownRing';
import { CircuitBreakerBanner } from './CircuitBreakerBanner';

const QUOTE_TTL_SEC = 15;

export function SwapCard() {
  const { open } = useAppKit();
  const { isConnected } = useAppKitAccount();
  const { chainId } = useAppKitNetwork();
  const kitConfigured = isCircleKitConfigured();
  // Raw RPC add/switch (arcapis pattern). chainState drives the button label.
  const { addOrSwitch, chainState, isPending: isSwitching, error: switchError } =
    useAddArcNetwork(chainId as number | undefined);

  const [tokenIn, setTokenIn] = useState<Token>(() => findToken('USDC')!);
  const [tokenOut, setTokenOut] = useState<Token>(() => findToken('EURC')!);
  const [amountIn, setAmountIn] = useState('');
  const [slippage, setSlippage] = useState(0.5);
  const [deadlineMin, setDeadlineMin] = useState(20);
  const [dialog, setDialog] = useState<'in' | 'out' | null>(null);
  const [routePref, setRoutePref] = useState<RoutePreference>('liftup-only');
  // Circuit-breaker opt-out: when pool drift > 10%, SwapCard force-routes
  // to Circle. Power users who want to be the arber can flip this to
  // re-enable the LiftUp route despite the safety override.
  const [overrideCircuitBreaker, setOverrideCircuitBreaker] = useState(false);
  // Watch the specific pool the user is swapping (defaults to USDC/EURC
  // when the symbol combo doesn't map to a registered pair, which never
  // happens in practice but keeps TS narrowing happy).
  const watchedPairId =
    pairIdForTokens(tokenIn.symbol, tokenOut.symbol) ?? 'USDC-EURC';
  const poolHealth = usePoolHealth(watchedPairId);

  // Quote auto-refresh state
  const [refreshKey, setRefreshKey] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(QUOTE_TTL_SEC);
  const autoSwitchAttempted = useRef(false);

  const isOnArc = chainId === arcTestnet.id;
  const hasInput = !!amountIn && parseFloat(amountIn) > 0;

  // On-chain balances (real). Empty map when wallet disconnected or wrong chain.
  const { balances, refetch: refetchBalances } = useTokenBalances();
  const tokenInBalance = balances.get(tokenIn.symbol);
  const tokenOutBalance = balances.get(tokenOut.symbol);

  // Auto-switch once after connect.
  useEffect(() => {
    if (!isConnected) {
      autoSwitchAttempted.current = false;
      return;
    }
    if (autoSwitchAttempted.current) return;
    if (!chainId) return;
    autoSwitchAttempted.current = true;
    if (chainId !== arcTestnet.id) {
      void addOrSwitch();
    }
  }, [isConnected, chainId, addOrSwitch]);

  // Countdown for quote freshness
  useEffect(() => {
    if (!hasInput) {
      setSecondsLeft(QUOTE_TTL_SEC);
      return;
    }
    setSecondsLeft(QUOTE_TTL_SEC);
    const id = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setRefreshKey((k) => k + 1);
          return QUOTE_TTL_SEC;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [hasInput, amountIn, tokenIn.symbol, tokenOut.symbol]);

  // Gas fee — separate from router fee, real impl will use wagmi hooks.
  const { feeUsdc, gasLimit, gasPriceGwei, loading: gasLoading } = useArcGasFee({
    refreshKey,
    enabled: isOnArc,
  });

  // Quotes — hybrid router compares LiftUp's own pool vs Circle App Kit.
  const slippageBps = Math.round(slippage * 100); // 0.5% -> 50 bps
  const {
    quote: circleRaw,
    loading: circleLoading,
    error: circleError,
  } = useSwapQuote({ tokenIn, tokenOut, amountIn, slippageBps, refreshKey });
  const { quote: liftupRaw } = useLiftupQuote({
    tokenIn,
    tokenOut,
    amountIn,
    refreshKey,
  });

  // Effective route — combines user preference with the circuit breaker.
  //
  // Circuit breaker: if pool drift > 10% (CIRCUIT_BREAKER_BPS), force the
  // LiftUp route to Circle regardless of stored preference. Power users
  // can override by clicking "Force LiftUp anyway" on the banner, which
  // flips `overrideCircuitBreaker` to true.
  //
  // Health hook fails OPEN — if CoinGecko or RPC is unreachable we treat
  // the pool as healthy and respect the user's pick. Slightly less safe
  // than fail-closed, but avoids locking users out on transient outages.
  const circuitBroken =
    !poolHealth.loading && !poolHealth.healthy && !overrideCircuitBreaker;
  const autoRoutedByCircuit = circuitBroken && routePref === 'liftup-only';

  // Auto-clear the override once pool returns to healthy, so the next
  // breaker event re-engages protection. We don't want a one-time
  // "Force LiftUp" click to permanently disable the safety net.
  useEffect(() => {
    if (poolHealth.healthy && overrideCircuitBreaker) {
      setOverrideCircuitBreaker(false);
    }
  }, [poolHealth.healthy, overrideCircuitBreaker]);

  const liftAvailable = !!liftupRaw && isLiftupAmmDeployed();
  const circleAvailable = !!circleRaw;
  // True when user wanted LiftUp but there's no LiftUp pool for this pair
  // (typically cirBTC pairs while we haven't seeded LP yet). We silently
  // route through Circle and surface a small banner so the user knows why.
  const autoRoutedNoPool =
    routePref === 'liftup-only' && !liftAvailable && circleAvailable && hasInput;

  const bestRoute: RouteEngine | null = (() => {
    // Force Circle whenever the breaker is engaged AND the user wanted LiftUp.
    if (autoRoutedByCircuit) {
      return circleAvailable ? 'circle' : null;
    }
    if (routePref === 'circle-only') {
      return circleAvailable ? 'circle' : null;
    }
    // Default = 'liftup-only' — but fall back to Circle when LiftUp
    // has no pool for this pair. This keeps cirBTC swaps working
    // without forcing the user into Settings.
    if (liftAvailable) return 'liftup';
    if (circleAvailable) return 'circle';
    return null;
  })();

  // Unified quote shape for the UI panel.
  const quote =
    bestRoute === 'liftup' && liftupRaw
      ? {
          engine: 'liftup' as RouteEngine,
          rate: liftupRaw.rate,
          out: liftupRaw.amountOut,
          outDisplay: liftupRaw.amountOut.toFixed(liftupRaw.amountOut < 1 ? 6 : 4),
          minReceived: liftupRaw.amountOut * (1 - slippage / 100),
          feeAmount: liftupRaw.feeAmount,
          source: 'liftup-pool' as const,
        }
      : bestRoute === 'circle' && circleRaw
        ? {
            engine: 'circle' as RouteEngine,
            rate: circleRaw.rate,
            out: circleRaw.amountOut,
            outDisplay: circleRaw.amountOutDisplay,
            minReceived: circleRaw.minReceived,
            feeAmount: circleRaw.feeAmount,
            source: circleRaw.source,
          }
        : null;
  const quoteLoading = circleLoading;
  const quoteError = circleError;

  // Execute hooks for each engine — only the active one will actually run.
  const {
    execute: circleExecute,
    reset: resetCircle,
    step: circleStep,
    result: circleResult,
    errorMessage: circleErrMsg,
  } = useExecuteSwap();

  const {
    approve: liftupApprove,
    swap: liftupSwap,
    reset: resetLiftup,
    step: liftupStep,
    txHash: liftupTxHash,
    errorMessage: liftupErrMsg,
    computeMinOut,
  } = useLiftupExecute();

  const { data: liftupAllowance, refetch: refetchAllowance } = useLiftupAllowance(tokenIn);

  // Unified state machine: idle | pending | success | error
  const step: 'idle' | 'pending' | 'success' | 'error' = (() => {
    if (bestRoute === 'liftup') {
      if (liftupStep === 'approving' || liftupStep === 'swapping') return 'pending';
      if (liftupStep === 'success') return 'success';
      if (liftupStep === 'error') return 'error';
      return 'idle';
    }
    if (circleStep === 'pending') return 'pending';
    if (circleStep === 'success') return 'success';
    if (circleStep === 'error') return 'error';
    return 'idle';
  })();

  const errorMessage = bestRoute === 'liftup' ? liftupErrMsg : circleErrMsg;
  const result =
    bestRoute === 'liftup' && liftupStep === 'success'
      ? {
          amountOut: liftupRaw ? liftupRaw.amountOut.toString() : '',
          tokenOut: tokenOut.symbol,
          txHash: liftupTxHash,
          explorerUrl: liftupTxHash
            ? `${arcTestnet.blockExplorers.default.url}/tx/${liftupTxHash}`
            : undefined,
        }
      : circleResult;

  const resetExec = useCallback(() => {
    resetCircle();
    resetLiftup();
  }, [resetCircle, resetLiftup]);

  // Refresh allowance + balances after a successful liftup approve/swap.
  useEffect(() => {
    if (liftupStep === 'idle' && liftupTxHash) void refetchAllowance();
  }, [liftupStep, liftupTxHash, refetchAllowance]);

  useEffect(() => {
    if (step === 'success') refetchBalances();
  }, [step, refetchBalances]);

  // Does the LiftUp route currently need approval before swap?
  const liftupNeedsApprove =
    bestRoute === 'liftup' &&
    !!liftupRaw &&
    (liftupAllowance === undefined ||
      (liftupAllowance as bigint) < liftupRaw.amountInRaw);

  const flip = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn(quote ? formatNumber(quote.out, 6).replace(/,/g, '') : '');
  };

  const setMax = () => {
    if (tokenInBalance && tokenInBalance.formatted > 0) {
      setAmountIn(String(tokenInBalance.formatted));
    }
  };

  const manualRefresh = () => {
    setSecondsLeft(QUOTE_TTL_SEC);
    setRefreshKey((k) => k + 1);
  };

  const insufficient =
    !!quote &&
    !!tokenInBalance &&
    parseFloat(amountIn) > tokenInBalance.formatted;

  let primary: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    variant: 'connect' | 'switch' | 'swap' | 'enter' | 'insufficient';
  };
  if (!isConnected) {
    primary = { label: 'Connect Wallet', onClick: () => open(), variant: 'connect' };
  } else if (!isOnArc) {
    const isSwitchOnly = chainState === 'added-not-switched';
    let label: string;
    if (isSwitching) {
      label = isSwitchOnly ? 'SWITCHING NETWORK…' : 'ADDING ARC TESTNET…';
    } else {
      label = isSwitchOnly ? 'SWITCH NETWORK' : 'ADD ARC TESTNET';
    }
    primary = {
      label,
      onClick: () => void addOrSwitch(),
      disabled: isSwitching,
      variant: 'switch',
    };
  } else if (
    routePref === 'liftup-only' &&
    hasInput &&
    !liftupRaw &&
    !circleRaw &&
    !quoteLoading
  ) {
    // No quote on either route — usually means the pair isn't supported.
    primary = {
      label: 'No route available for this pair',
      onClick: () => {},
      disabled: true,
      variant: 'insufficient',
    };
  } else if (routePref === 'circle-only' && hasInput && !circleRaw && !quoteLoading) {
    primary = {
      label: 'Circle App Kit unavailable for this pair',
      onClick: () => {},
      disabled: true,
      variant: 'insufficient',
    };
  } else if (!quote) {
    primary = {
      label: quoteLoading ? 'Fetching route…' : 'Enter an amount',
      onClick: () => {},
      disabled: true,
      variant: 'enter',
    };
  } else if (insufficient) {
    primary = {
      label: `Insufficient ${tokenIn.symbol}`,
      onClick: () => {},
      disabled: true,
      variant: 'insufficient',
    };
  } else if (bestRoute === null && !kitConfigured) {
    primary = {
      label: 'Swap engine — kit key not set',
      onClick: () => {},
      disabled: true,
      variant: 'insufficient',
    };
  } else if (step === 'pending') {
    let label = 'SWAPPING…';
    if (bestRoute === 'liftup' && liftupStep === 'approving') {
      label = `APPROVING ${tokenIn.symbol}…`;
    } else if (bestRoute === 'liftup' && liftupStep === 'swapping') {
      label = `SWAPPING…`;
    }
    primary = { label, onClick: () => {}, disabled: true, variant: 'swap' };
  } else if (bestRoute === 'liftup' && liftupNeedsApprove && liftupRaw) {
    primary = {
      label: `APPROVE ${tokenIn.symbol}`,
      onClick: () => void liftupApprove(tokenIn, liftupRaw.amountInRaw),
      variant: 'swap',
    };
  } else if (bestRoute === 'liftup' && liftupRaw) {
    primary = {
      label: `Swap ${tokenIn.symbol} → ${tokenOut.symbol} · LiftUp`,
      onClick: () =>
        void liftupSwap({
          tokenIn,
          tokenOut,
          amountInRaw: liftupRaw.amountInRaw,
          amountOutMin: computeMinOut(liftupRaw.amountOut, slippage, tokenOut),
        }),
      variant: 'swap',
    };
  } else {
    primary = {
      label: `Swap ${tokenIn.symbol} → ${tokenOut.symbol}`,
      onClick: () => void circleExecute({ tokenIn, tokenOut, amountIn, slippageBps }),
      variant: 'swap',
    };
  }

  return (
    <div className="mx-auto w-full max-w-[460px]">
      <div className="flex items-center justify-between px-1 pb-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">Swap</h1>
          <p className="text-xs text-ink-muted">
            Trade on <span className="text-brand-400">Arc Testnet</span> · USDC-native gas
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasInput && quote && (
            <button
              type="button"
              onClick={manualRefresh}
              title={`Refresh quote (auto in ${secondsLeft}s)`}
              className="flex h-9 items-center gap-2 rounded-xl border border-border bg-bg-elevated/40 px-2.5 text-ink-muted transition-colors hover:border-brand-400/30 hover:text-ink"
            >
              <CountdownRing seconds={secondsLeft} total={QUOTE_TTL_SEC} showNumber={false} />
              <span className="font-display text-xs tabular-nums text-brand-400">
                {secondsLeft}s
              </span>
            </button>
          )}
          <SettingsPopover
            slippage={slippage}
            onSlippage={setSlippage}
            deadlineMin={deadlineMin}
            onDeadline={setDeadlineMin}
            routePref={routePref}
            onRoutePref={setRoutePref}
          />
        </div>
      </div>

      {circuitBroken && (
        <CircuitBreakerBanner
          reason={poolHealth.sourcesDown ? 'sources-down' : 'drift'}
          driftBps={poolHealth.driftBps}
          autoRouted={autoRoutedByCircuit}
          onForceLiftup={
            autoRoutedByCircuit
              ? () => setOverrideCircuitBreaker(true)
              : undefined
          }
        />
      )}

      {/* "No LiftUp pool yet" notice — only shows when the user explicitly
          picked liftup-only but the pair has no LiftUp pool (cirBTC today).
          The swap still proceeds via Circle App Kit; this just explains why. */}
      {!circuitBroken && autoRoutedNoPool && (
        <CircuitBreakerBanner
          reason="no-pool"
          driftBps={0}
          autoRouted={true}
        />
      )}

      <div className="relative rounded-3xl border border-border bg-bg-surface/60 p-3 backdrop-blur-xl shadow-card-lift">
        <TokenPanel
          label="You pay"
          token={tokenIn}
          balance={tokenInBalance}
          amount={amountIn}
          onAmount={setAmountIn}
          onOpen={() => setDialog('in')}
          onMax={setMax}
          showMax
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

        <TokenPanel
          label="You receive"
          token={tokenOut}
          balance={tokenOutBalance}
          amount={quote ? formatNumber(quote.out, quote.out < 1 ? 6 : 2) : ''}
          onAmount={() => {}}
          readOnly
          onOpen={() => setDialog('out')}
          highlight
          flashKey={refreshKey}
        />

        {quote && (
          <div
            className={cn(
              'mt-3 rounded-2xl border px-3.5 py-2.5',
              quote.engine === 'liftup'
                ? 'border-brand-400/30 bg-brand-500/[0.05]'
                : 'border-violet-500/30 bg-violet-500/[0.05]',
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Zap
                  size={13}
                  className={
                    quote.engine === 'liftup' ? 'text-brand-400' : 'text-violet-400'
                  }
                />
                <span className="text-[10px] uppercase tracking-[0.16em] text-ink-subtle">
                  Route
                </span>
                <span className="font-display text-sm font-medium text-ink">
                  {quote.engine === 'liftup' ? 'LiftUp Pool' : 'Circle App Kit'}
                </span>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wider',
                  quote.engine === 'liftup'
                    ? 'border-brand-400/30 bg-brand-500/10 text-brand-400'
                    : 'border-gold-500/30 bg-gold-500/10 text-gold-500',
                )}
                title={
                  quote.engine === 'liftup'
                    ? 'Swap event emits on LiftupPair — counts toward your loyalty weight'
                    : 'Routes through Circle — fee still funds rewards, but does not earn you loyalty weight'
                }
              >
                {quote.engine === 'liftup'
                  ? 'Earns loyalty weight'
                  : 'Funds rewards · 0 weight'}
              </span>
            </div>

            {/* Reward-impact one-liner — explains the reward-draw consequence
                so user understands WHY route choice matters beyond price. */}
            <p
              className={cn(
                'mt-2 text-[10px] leading-snug',
                quote.engine === 'liftup' ? 'text-ink-muted' : 'text-ink-subtle',
              )}
            >
              {quote.engine === 'liftup' ? (
                <>
                  Counts as 1 daily distribution entry (≥ $100/day → 24
                  recipients, equal odds) + adds to your weekly &amp; monthly
                  volume weight (more swap = higher reward chance).
                </>
              ) : (
                <>
                  {(LIFTUP_FEE_BPS / 100).toFixed(2)}% LiftUp fee still funds
                  the RewardDistributor — but Circle swaps do NOT count
                  toward your loyalty weight. Open Settings → switch route
                  to LiftUp Pool to qualify.
                </>
              )}
            </p>
          </div>
        )}

        {quote && (
          <div className="mt-3 space-y-2 rounded-2xl border border-border bg-bg-base/40 p-3 text-xs">
            <Row
              label="Rate"
              value={`1 ${tokenIn.symbol} = ${formatNumber(quote.rate, quote.rate < 1 ? 6 : 4)} ${tokenOut.symbol}`}
            />
            <Row
              label="Min received"
              value={`${formatNumber(quote.minReceived, 6)} ${tokenOut.symbol}`}
            />
            <Row
              label={quote.engine === 'liftup' ? 'LP fee' : 'Provider fee'}
              value={
                <span className="inline-flex items-center gap-1 text-ink">
                  {quote.feeAmount > 0
                    ? `${formatNumber(quote.feeAmount, 4)} ${quote.engine === 'liftup' ? tokenIn.symbol : tokenOut.symbol}`
                    : '—'}
                  <span className="text-ink-subtle">
                    · {quote.engine === 'liftup'
                      ? '0.05%'
                      : quote.source === 'circle'
                        ? 'live route'
                        : 'preview rate'}
                  </span>
                </span>
              }
            />
            {quote.engine === 'circle' && hasLiftupFee() && (
              <Row
                label="LiftUp fee"
                value={
                  <span className="inline-flex items-center gap-1 text-ink">
                    {`${formatNumber(
                      (parseFloat(amountIn) * LIFTUP_FEE_BPS) / 10_000,
                      4,
                    )} ${tokenIn.symbol}`}
                    <span className="text-ink-subtle">
                      · {(LIFTUP_FEE_BPS / 100).toFixed(2)}%
                    </span>
                  </span>
                }
              />
            )}
            <Row
              label={
                <span className="inline-flex items-center gap-1.5">
                  Network gas
                  {gasLoading && <Loader2 size={11} className="animate-spin text-brand-400" />}
                </span>
              }
              value={
                gasLoading ? (
                  <span className="text-ink-subtle">estimating…</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="tabular-nums">≈ {formatNumber(feeUsdc, 4)} USDC</span>
                    <span
                      className="text-ink-subtle"
                      title={`gasLimit ${formatNumber(gasLimit, 0)} × ${gasPriceGwei.toFixed(1)} gwei`}
                    >
                      ·
                    </span>
                    <span className="text-ink-subtle tabular-nums">{gasPriceGwei.toFixed(1)} gwei</span>
                  </span>
                )
              }
            />
            <Row
              label="Route"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <Zap size={11} className="text-brand-400" />
                  {quote.engine === 'liftup' ? 'LiftUp Pool · Arc Testnet' : 'Circle App Kit · Arc Testnet'}
                </span>
              }
            />
            {/* Show the loser as a comparison line so user knows fallback exists. */}
            {bestRoute === 'liftup' && circleRaw && (
              <p className="text-[11px] text-ink-subtle">
                Alt: {formatNumber(circleRaw.amountOut, 4)} {tokenOut.symbol} via Circle App Kit
              </p>
            )}
            {bestRoute === 'circle' && liftupRaw && (
              <p className="text-[11px] text-ink-subtle">
                Alt: {formatNumber(liftupRaw.amountOut, 4)} {tokenOut.symbol} via LiftUp Pool
              </p>
            )}
          </div>
        )}

        {quoteError && (
          <div className="mt-3 rounded-xl border border-gold-500/30 bg-gold-500/[0.06] px-3.5 py-2.5 text-xs text-gold-300">
            <p className="font-medium">Quote notice</p>
            <p className="mt-0.5 break-words text-ink-muted">{quoteError}</p>
          </div>
        )}

        <button
          type="button"
          onClick={primary.onClick}
          disabled={primary.disabled}
          className={cn(
            'mt-3 w-full rounded-2xl px-5 py-4 font-display font-semibold transition-all',
            primary.variant === 'switch'
              ? 'text-base uppercase tracking-[0.08em]'
              : 'text-sm tracking-tight',
            primary.variant === 'swap' &&
              'bg-lift-gradient text-bg-base shadow-glow hover:-translate-y-0.5 hover:shadow-[0_0_60px_-10px_rgba(34,211,164,0.7)]',
            primary.variant === 'connect' &&
              'bg-lift-gradient text-bg-base shadow-glow hover:-translate-y-0.5',
            primary.variant === 'switch' &&
              'bg-gold-500 text-bg-base hover:-translate-y-0.5 hover:shadow-glow-gold',
            (primary.variant === 'enter' || primary.variant === 'insufficient') &&
              'border border-border bg-bg-elevated/40 text-ink-subtle cursor-not-allowed',
          )}
        >
          <span className="inline-flex items-center gap-2.5">
            {primary.variant === 'connect' && <Wallet size={15} />}
            {primary.variant === 'switch' && (
              <RefreshCw size={17} className={isSwitching ? 'animate-spin' : ''} />
            )}
            {primary.label}
          </span>
        </button>

        {switchError && !isOnArc && (
          <div className="mt-3 rounded-xl border border-gold-500/30 bg-gold-500/[0.06] px-3.5 py-2.5 text-xs text-gold-300">
            <p>{switchError}</p>
            <p className="mt-1 text-ink-muted">
              Manual add in MetaMask · Settings → Networks → Add network:
              Chain ID <span className="text-ink">5042002</span> · RPC{' '}
              <span className="text-ink">https://rpc.testnet.arc.network</span> · Symbol{' '}
              <span className="text-ink">USDC</span>.
            </p>
          </div>
        )}

        {step === 'success' && result && (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-brand-400/30 bg-brand-500/[0.06] px-3.5 py-2.5 text-xs">
            <div>
              <p className="font-medium text-brand-400">Swap settled on chain</p>
              <p className="mt-0.5 text-ink-muted">
                Received {result.amountOut} {result.tokenOut}. Tap reset to swap again.
              </p>
              {(result.explorerUrl || result.txHash) && (
                <Link
                  href={
                    result.explorerUrl ?? `${arcTestnet.blockExplorers.default.url}/tx/${result.txHash}`
                  }
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-1 inline-block text-brand-400 hover:underline"
                >
                  View on ArcScan ↗
                </Link>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                resetExec();
                setAmountIn('');
              }}
              className="rounded-md border border-brand-400/30 bg-brand-500/10 px-2 py-1 text-[11px] uppercase tracking-wider text-brand-400 hover:bg-brand-500/20"
            >
              Reset
            </button>
          </div>
        )}

        {step === 'error' && errorMessage && (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/[0.06] px-3.5 py-2.5 text-xs text-red-300">
            <p className="font-medium">Transaction failed</p>
            <p className="mt-0.5 break-words text-ink-muted">{errorMessage}</p>
            <button
              type="button"
              onClick={resetExec}
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
          Arc Testnet uses USDC for gas. Need test funds?{' '}
          <Link
            href={ARC_FAUCET_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="text-brand-400 hover:underline"
          >
            Grab some from Circle's faucet ↗
          </Link>
        </div>
      </div>

      <TokenDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        onSelect={(t) => (dialog === 'in' ? setTokenIn(t) : setTokenOut(t))}
        disabledSymbol={dialog === 'in' ? tokenOut.symbol : tokenIn.symbol}
      />
    </div>
  );
}

function TokenPanel({
  label,
  token,
  balance,
  amount,
  onAmount,
  onOpen,
  onMax,
  showMax,
  readOnly,
  highlight,
  flashKey,
}: {
  label: string;
  token: Token;
  balance?: TokenBalance;
  amount: string;
  onAmount: (v: string) => void;
  onOpen: () => void;
  onMax?: () => void;
  showMax?: boolean;
  readOnly?: boolean;
  highlight?: boolean;
  flashKey?: number;
}) {
  const usd = amount && !Number.isNaN(parseFloat(amount)) ? parseFloat(amount) * token.priceUsd : 0;
  const hasBalance = !!balance;

  return (
    <div
      className={cn(
        'rounded-2xl border p-4 transition-colors',
        highlight
          ? 'border-brand-400/30 bg-brand-500/[0.04]'
          : 'border-border bg-bg-base/60 focus-within:border-border-strong',
      )}
    >
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-muted">{label}</span>
        {hasBalance && (
          <div className="flex items-center gap-2 text-ink-subtle">
            <span>
              Balance: {formatNumber(balance!.formatted, balance!.formatted < 1 ? 4 : 2)}
            </span>
            {showMax && balance!.formatted > 0 && (
              <button
                type="button"
                onClick={onMax}
                className="rounded-md border border-brand-400/30 bg-brand-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-brand-400 hover:bg-brand-500/20"
              >
                Max
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        {readOnly ? (
          <motion.div
            key={`out-${flashKey ?? 0}`}
            initial={{ opacity: 0.45, filter: 'blur(2px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="min-w-0 flex-1 font-display text-3xl font-semibold tracking-tight text-ink"
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
          <TokenIcon token={token} size={22} />
          {token.symbol}
          <ChevronDown size={14} className="text-ink-muted" />
        </button>
      </div>

      <div className="mt-1.5 text-xs text-ink-subtle">≈ ${formatNumber(usd, 2)}</div>
    </div>
  );
}

function Row({
  label,
  value,
  tint,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  tint?: 'brand';
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-muted">{label}</span>
      <span className={cn('text-ink', tint === 'brand' && 'text-brand-400')}>{value}</span>
    </div>
  );
}
