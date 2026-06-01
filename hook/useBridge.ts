'use client';

import { useCallback, useState } from 'react';
import type { BridgeChain } from '@circle-fin/bridge-kit';
import { getKit, KIT_KEY } from '@/lib/circleKit';
import { useCircleAdapter } from '@/hook/useCircleAdapter';

export type BridgeStep = 'idle' | 'pending' | 'success' | 'error';
export type BridgeSpeed = 'FAST' | 'SLOW';

export interface BridgeOutcome {
  state: 'pending' | 'success' | 'error';
  amount: string;
  provider: string;
  sourceChainName?: string;
  destChainName?: string;
  /** First successful tx hash if available — used to deep-link to ArcScan. */
  txHash?: string;
  /** Optional explorer URL exposed by some BridgeKit steps. */
  explorerUrl?: string;
}

/**
 * Wraps Circle Bridge Kit's `kit.bridge()`. Single-shot state machine —
 * the SDK takes care of approve + burn + attestation + mint internally,
 * so the UI only needs idle / pending / success / error.
 */
export function useBridge() {
  const { adapter } = useCircleAdapter();
  const [step, setStep] = useState<BridgeStep>('idle');
  const [result, setResult] = useState<BridgeOutcome | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const execute = useCallback(
    async (params: {
      fromChain: BridgeChain;
      toChain: BridgeChain;
      amount: string;
      speed?: BridgeSpeed;
    }) => {
      if (!adapter) {
        setStep('error');
        setErrorMessage('Wallet not ready. Reconnect and try again.');
        return;
      }
      setStep('pending');
      setErrorMessage(null);
      setResult(null);
      try {
        const res = await getKit().bridge({
          from: { adapter: adapter as never, chain: params.fromChain },
          to: { adapter: adapter as never, chain: params.toChain },
          amount: params.amount,
          token: 'USDC',
          config: {
            transferSpeed: params.speed ?? 'FAST',
            kitKey: KIT_KEY,
          } as never,
        });

        const r = res as unknown as {
          state: 'pending' | 'success' | 'error';
          amount: string;
          provider: string;
          source?: { chain?: { name?: string } };
          destination?: { chain?: { name?: string } };
          steps?: Array<{ txHash?: string; explorerUrl?: string }>;
        };

        const firstStepHash = r.steps?.find((s) => s.txHash)?.txHash;
        const firstExplorerUrl = r.steps?.find((s) => s.explorerUrl)?.explorerUrl;

        setResult({
          state: r.state,
          amount: r.amount,
          provider: r.provider,
          sourceChainName: r.source?.chain?.name,
          destChainName: r.destination?.chain?.name,
          txHash: firstStepHash,
          explorerUrl: firstExplorerUrl,
        });
        setStep(r.state === 'error' ? 'error' : 'success');
        if (r.state === 'error') {
          setErrorMessage('Bridge failed mid-flight. Check Console for details.');
        }
      } catch (err) {
        console.error('[liftup] kit.bridge failed', err);
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
