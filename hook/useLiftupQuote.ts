'use client';

import { useEffect, useMemo } from 'react';
import { useReadContract } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { arcTestnet } from '@/lib/chains';
import {
  LIFTUP_ROUTER,
  isLiftupAmmDeployed,
  liftupRouterAbi,
} from '@/lib/liftupAmm';
import { USDC_ON_ARC, EURC_ON_ARC, type Token } from '@/lib/tokens';

export interface LiftupQuote {
  amountIn: string;
  amountInRaw: bigint;
  amountOut: number;
  amountOutRaw: bigint;
  /** tokenOut per 1 tokenIn (post-fee) */
  rate: number;
  /** Pool LP fee (0.30%) in tokenIn units. */
  feeAmount: number;
  /** True when the call returned >0 — pool has reserves for this pair. */
  available: boolean;
}

function tokenErc20(token: Token): `0x${string}` | undefined {
  if (token.symbol === 'USDC') return USDC_ON_ARC;
  if (token.symbol === 'EURC') return EURC_ON_ARC;
  return token.address;
}

/** On-chain ERC-20 decimals for a token. USDC is "native" 18-dp on
 *  Arc but its 6-dp wrapper is what trades through the router. */
function onChainDecimals(token: Token): number {
  return token.native ? 6 : token.decimals;
}

/**
 * Queries the LiftUp router's `getAmountOut` view for the pair. Returns
 * `available: false` when the AMM isn't deployed, the pair has no
 * liquidity yet, or the call reverts for any other reason — letting the
 * SwapCard fall back to Circle App Kit transparently.
 */
export function useLiftupQuote(params: {
  tokenIn: Token;
  tokenOut: Token;
  amountIn: string;
  refreshKey?: number;
}): { quote: LiftupQuote | null; loading: boolean } {
  const { tokenIn, tokenOut, amountIn, refreshKey } = params;
  const decIn = onChainDecimals(tokenIn);
  const decOut = onChainDecimals(tokenOut);

  const amountInRaw = useMemo(() => {
    if (!amountIn) return 0n;
    const n = parseFloat(amountIn);
    if (!n || Number.isNaN(n) || n <= 0) return 0n;
    try {
      return parseUnits(amountIn, decIn);
    } catch {
      return 0n;
    }
  }, [amountIn, decIn]);

  const tokenInAddr = tokenErc20(tokenIn);
  const tokenOutAddr = tokenErc20(tokenOut);
  const canQuery =
    isLiftupAmmDeployed() &&
    amountInRaw > 0n &&
    !!tokenInAddr &&
    !!tokenOutAddr &&
    tokenInAddr !== tokenOutAddr;

  const { data, isLoading, refetch } = useReadContract({
    address: LIFTUP_ROUTER,
    abi: liftupRouterAbi,
    functionName: 'getAmountOut',
    args:
      tokenInAddr && tokenOutAddr
        ? [amountInRaw, tokenInAddr, tokenOutAddr]
        : undefined,
    chainId: arcTestnet.id,
    query: { enabled: canQuery },
  });

  // Re-pull on countdown rollover.
  useEffect(() => {
    if (!canQuery) return;
    void refetch();
  }, [refreshKey, canQuery, refetch]);

  return useMemo(() => {
    if (!canQuery || data === undefined) {
      return { quote: null, loading: isLoading };
    }
    const amountOutRaw = data as bigint;
    if (amountOutRaw === 0n) return { quote: null, loading: false };

    const inFloat = parseFloat(formatUnits(amountInRaw, decIn));
    const outFloat = parseFloat(formatUnits(amountOutRaw, decOut));
    const rate = inFloat > 0 ? outFloat / inFloat : 0;
    // LP fee = 0.05% of input (stable-pair tier — matches LiftupPair.sol)
    const feeAmount = inFloat * 0.0005;

    return {
      quote: {
        amountIn,
        amountInRaw,
        amountOut: outFloat,
        amountOutRaw,
        rate,
        feeAmount,
        available: true,
      },
      loading: false,
    };
  }, [data, isLoading, canQuery, amountInRaw, amountIn, decIn, decOut]);
}
