'use client';

import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import { arcTestnet } from '@/lib/chains';
import { liftupPairAbi } from '@/lib/liftupAmm';
import { DEPLOYED_PAIRS, LIFTUP_POOLS } from '@/lib/pools';

export interface LandingStats {
  /** Sum of reserves across every deployed pool, expressed in USD. */
  tvlUsd: number;
  poolCount: number;
  /** Pool price for the headline pair (USDC/EURC). */
  priceEurcPerUsdc: number;
  hasData: boolean;
}

/**
 * Aggregates on-chain TVL across every deployed pool, registry-driven
 * via DEPLOYED_PAIRS in lib/pools.ts.
 *
 * Single batched useReadContracts call (one multicall) returns
 * getReserves() + token0() for every pool — N pools = 2N reads in one
 * RPC trip, deduped by wagmi/TanStack Query so Hero + CommunityStats
 * share the same response. Adding a new pool to LIFTUP_POOLS is
 * automatically picked up.
 *
 * Refetches every 30s (TanStack default staleTime in Providers.tsx).
 */
export function useLandingStats(): LandingStats {
  const contracts = useMemo(() => {
    const reads: {
      address: `0x${string}`;
      abi: typeof liftupPairAbi;
      functionName: 'getReserves' | 'token0';
      chainId: number;
    }[] = [];
    for (const p of DEPLOYED_PAIRS) {
      reads.push({
        address: p.pair,
        abi: liftupPairAbi,
        functionName: 'getReserves',
        chainId: arcTestnet.id,
      });
      reads.push({
        address: p.pair,
        abi: liftupPairAbi,
        functionName: 'token0',
        chainId: arcTestnet.id,
      });
    }
    return reads;
  }, []);

  const { data } = useReadContracts({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contracts: contracts as any,
    query: {
      refetchInterval: 30_000,
      refetchOnWindowFocus: false,
    },
  });

  return useMemo<LandingStats>(() => {
    if (!data) {
      return {
        tvlUsd: 0,
        poolCount: LIFTUP_POOLS.length,
        priceEurcPerUsdc: 0,
        hasData: false,
      };
    }

    let tvlUsd = 0;
    let priceEurcPerUsdc = 0;
    let anySuccess = false;

    for (let i = 0; i < DEPLOYED_PAIRS.length; i++) {
      const cfg = DEPLOYED_PAIRS[i];
      const reservesResult = data[i * 2];
      // token0 read kept for future verification (alignment assertion);
      // currently unused since DEPLOYED_PAIRS already encodes token0 by
      // address sort.
      void data[i * 2 + 1];
      if (reservesResult.status !== 'success') continue;
      anySuccess = true;
      const [r0, r1] = reservesResult.result as readonly [bigint, bigint, number];
      const r0Float = parseFloat(formatUnits(r0, cfg.dec0));
      const r1Float = parseFloat(formatUnits(r1, cfg.dec1));
      tvlUsd += r0Float * cfg.price0 + r1Float * cfg.price1;

      // Headline EURC/USDC price comes from the first stable pool whose
      // token0 = USDC and token1 = EURC. Lets the landing UI show
      // "1 USDC = X EURC" without us hardcoding which entry that is.
      if (
        cfg.token0.symbol === 'USDC' &&
        cfg.token1.symbol === 'EURC' &&
        r0Float > 0
      ) {
        priceEurcPerUsdc = r1Float / r0Float;
      }
    }

    return {
      tvlUsd,
      poolCount: LIFTUP_POOLS.length,
      priceEurcPerUsdc,
      hasData: anySuccess,
    };
  }, [data]);
}
