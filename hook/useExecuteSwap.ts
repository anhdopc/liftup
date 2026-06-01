'use client';

import { useCallback, useState } from 'react';
import {
  CIRCLE_SWAP_CHAIN,
  KIT_KEY,
  getKit,
  isCircleKitConfigured,
  liftupCustomFee,
} from '@/lib/circleKit';
import { useCircleAdapter } from '@/hook/useCircleAdapter';
import type { Token } from '@/lib/tokens';

export type SwapStep = 'idle' | 'pending' | 'success' | 'error';

export interface SwapExecutionResult {
  txHash: string;
  explorerUrl?: string;
  amountOut: string;
  tokenOut: string;
}

/**
 * Executes a swap via Circle App Kit. The kit takes care of:
 *   - quoting a fresh route under the hood
 *   - signing the permit (or fallback approve) on the chosen tokenIn
 *   - submitting the swap transaction
 *
 * Returns a single CTA-friendly state machine plus the final result so the
 * UI can show 'PENDING…' / success banner with the ArcScan link.
 */
export function useExecuteSwap() {
  const { adapter } = useCircleAdapter();
  const [step, setStep] = useState<SwapStep>('idle');
  const [result, setResult] = useState<SwapExecutionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const execute = useCallback(
    async (params: {
      tokenIn: Token;
      tokenOut: Token;
      amountIn: string;
      slippageBps: number;
    }) => {
      if (!isCircleKitConfigured()) {
        setStep('error');
        setErrorMessage('NEXT_PUBLIC_CIRCLE_KIT_KEY is missing — set it in your environment.');
        return;
      }
      if (!adapter) {
        setStep('error');
        setErrorMessage('Wallet not ready. Reconnect and try again.');
        return;
      }
      setStep('pending');
      setErrorMessage(null);
      setResult(null);
      try {
        const res = await getKit().swap({
          from: { adapter: adapter as never, chain: CIRCLE_SWAP_CHAIN },
          tokenIn: params.tokenIn.symbol as never,
          tokenOut: params.tokenOut.symbol as never,
          amountIn: params.amountIn,
          config: {
            kitKey: KIT_KEY,
            slippageBps: params.slippageBps,
            customFee: liftupCustomFee(),
          },
        });
        // The result shape exposes txHash + explorerUrl per the SDK reference.
        const r = res as unknown as {
          txHash?: string;
          explorerUrl?: string;
          amountOut?: { amount?: string; token?: string };
        };
        setResult({
          txHash: r.txHash ?? '',
          explorerUrl: r.explorerUrl,
          amountOut: r.amountOut?.amount ?? '',
          tokenOut: r.amountOut?.token ?? params.tokenOut.symbol,
        });
        setStep('success');
      } catch (err) {
        console.error('[liftup] kit.swap failed', err);
        setErrorMessage(err instanceof Error ? err.message : String(err));
        setStep('error');
      }
    },
    [adapter],
  );

  const reset = useCallback(() => {
    setStep('idle');
    setResult(null);
    setErrorMessage(null);
  }, []);

  return { execute, reset, step, result, errorMessage };
}
