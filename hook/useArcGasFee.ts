'use client';

import { useEffect, useState } from 'react';

/**
 * Phase-2 mock — estimates the gas cost of a swap on Arc Testnet,
 * paid in USDC because USDC is the native gas token on Arc.
 *
 * Phase 3 replacement (real implementation):
 *   const { data: gasLimit } = useEstimateGas({ to, value, data });
 *   const { data: gasPrice } = useGasPrice();
 *   const feeWei = (gasLimit ?? 0n) * (gasPrice ?? 0n);
 *   // Arc gas token is USDC (6 decimals) so convert: feeWei / 10n ** 6n
 */
export interface ArcGasFee {
  feeUsdc: number;
  gasLimit: number;
  gasPriceGwei: number;
  loading: boolean;
}

const BASE_FEE_USDC = 0.0032; // ~180k gas × ~18 gwei on Arc

export function useArcGasFee({
  refreshKey,
  enabled = true,
}: {
  refreshKey: number;
  enabled?: boolean;
}): ArcGasFee {
  const [state, setState] = useState<ArcGasFee>({
    feeUsdc: BASE_FEE_USDC,
    gasLimit: 180_000,
    gasPriceGwei: 18,
    loading: true,
  });

  useEffect(() => {
    if (!enabled) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    const id = setTimeout(() => {
      const jitter = (Math.random() - 0.5) * 0.0009;
      const gp = 16 + Math.random() * 6;
      const limit = 175_000 + Math.floor(Math.random() * 12_000);
      setState({
        feeUsdc: Math.max(0.0008, BASE_FEE_USDC + jitter),
        gasLimit: limit,
        gasPriceGwei: gp,
        loading: false,
      });
    }, 650);
    return () => clearTimeout(id);
  }, [refreshKey, enabled]);

  return state;
}
