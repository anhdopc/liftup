'use client';

import { useEffect, useState } from 'react';
import {
  CIRCLE_SWAP_CHAIN,
  KIT_KEY,
  getKit,
  isCircleKitConfigured,
  liftupCustomFee,
} from '@/lib/circleKit';
import { useCircleAdapter } from '@/hook/useCircleAdapter';
import type { Token } from '@/lib/tokens';

export interface SwapQuote {
  amountIn: string;
  amountOut: number;
  amountOutDisplay: string;
  minReceived: number;
  rate: number;
  feeAmount: number;
  source: 'circle' | 'mock';
}

export interface UseSwapQuoteResult {
  quote: SwapQuote | null;
  loading: boolean;
  error: string | null;
}

const SUPPORTED_SYMBOLS = new Set(['USDC', 'EURC', 'cirBTC']);

function mockQuote(
  amountIn: string,
  tokenIn: Token,
  tokenOut: Token,
  slippageBps: number,
): SwapQuote {
  const n = parseFloat(amountIn);
  const rate = tokenIn.priceUsd / tokenOut.priceUsd;
  const grossOut = n * rate;
  const fee = grossOut * 0.0005; // 5 bps placeholder
  const out = grossOut - fee;
  return {
    amountIn,
    amountOut: out,
    amountOutDisplay: out.toFixed(out < 1 ? 6 : 4),
    minReceived: out * (1 - slippageBps / 10_000),
    rate,
    feeAmount: fee,
    source: 'mock',
  };
}

/**
 * Fetches a swap estimate from Circle App Kit. Falls back to a deterministic
 * mock so the UI keeps showing a rate when:
 *   - `NEXT_PUBLIC_CIRCLE_KIT_KEY` is empty
 *   - the wallet isn't connected (no adapter yet)
 *   - the kit's estimateSwap throws (rate-limit, network, unsupported pair...)
 *
 * The mock always sets a quote so the swap button can still surface an
 * error message instead of silently disabling.
 */
export function useSwapQuote(params: {
  tokenIn: Token;
  tokenOut: Token;
  amountIn: string;
  slippageBps: number;
  refreshKey?: number;
}): UseSwapQuoteResult {
  const { tokenIn, tokenOut, amountIn, slippageBps, refreshKey } = params;
  const { adapter } = useCircleAdapter();

  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const n = parseFloat(amountIn);
    if (!amountIn || !n || Number.isNaN(n) || n <= 0) {
      setQuote(null);
      setError(null);
      return;
    }

    const canCallCircle =
      isCircleKitConfigured() &&
      !!adapter &&
      SUPPORTED_SYMBOLS.has(tokenIn.symbol) &&
      SUPPORTED_SYMBOLS.has(tokenOut.symbol);

    if (!canCallCircle) {
      setQuote(mockQuote(amountIn, tokenIn, tokenOut, slippageBps));
      // Surface why we're not calling Circle so the user understands
      // why the swap engine isn't live yet.
      if (!isCircleKitConfigured()) {
        setError('Set NEXT_PUBLIC_CIRCLE_KIT_KEY to enable live routing.');
      } else if (!adapter) {
        setError(null); // adapter still booting — quiet state
      } else {
        setError('Only USDC and EURC are routable via Circle App Kit today.');
      }
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const result = await getKit().estimateSwap({
          from: { adapter: adapter as never, chain: CIRCLE_SWAP_CHAIN },
          tokenIn: tokenIn.symbol as never,
          tokenOut: tokenOut.symbol as never,
          amountIn,
          config: {
            kitKey: KIT_KEY,
            slippageBps,
            customFee: liftupCustomFee(),
          },
        });
        if (cancelled) return;
        const out = parseFloat(result.estimatedOutput.amount);
        const min = parseFloat(result.stopLimit.amount);
        const inFloat = parseFloat(amountIn);
        const feeTotal = (result.fees ?? []).reduce<number>(
          (acc, f) => acc + (f?.amount ? parseFloat(f.amount) : 0),
          0,
        );
        setQuote({
          amountIn,
          amountOut: out,
          amountOutDisplay: result.estimatedOutput.amount,
          minReceived: min,
          rate: inFloat > 0 ? out / inFloat : 0,
          feeAmount: feeTotal,
          source: 'circle',
        });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[liftup] Circle estimateSwap failed, falling back to mock', err);
        // Fall back to mock so the UI stays informative.
        setQuote(mockQuote(amountIn, tokenIn, tokenOut, slippageBps));
        setError(`Live route unavailable (${message}). Showing preview rate.`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [amountIn, tokenIn, tokenOut, slippageBps, refreshKey, adapter]);

  return { quote, loading, error };
}
