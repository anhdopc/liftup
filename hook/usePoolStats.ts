'use client';

import { useMemo } from 'react';
import { useAccount, useReadContracts } from 'wagmi';
import { erc20Abi, formatUnits } from 'viem';
import { arcTestnet } from '@/lib/chains';
import {
  LIFTUP_PAIR_USDC_EURC,
  liftupPairAbi,
} from '@/lib/liftupAmm';
import { USDC_ON_ARC, EURC_ON_ARC } from '@/lib/tokens';

export interface PoolStats {
  pair: `0x${string}`;
  reserveUsdc: bigint;      // Reserve của tokenA (thường là USDC side)
  reserveEurc: bigint;      // Reserve của tokenB
  totalLp: bigint;
  userLp: bigint;
  /** 0–1 fraction of pool the user owns. */
  userShare: number;
  /** User's underlying USDC + EURC at current price. */
  userUsdc: number;
  userEurc: number;
  /** Pool price expressed as TokenB per 1 TokenA. */
  priceEurcPerUsdc: number;   // Giữ tên cũ cho tương thích
  /** Crude TVL — USDC reserve + EURC reserve in USDC terms. */
  tvlUsdc: number;
}

const TOKEN_DECIMALS = 6;

/**
 * Reads a Uniswap-V2 pool's state.
 * Supports pools with different decimals (e.g. cirBTC has 8 decimals).
 */
export interface UsePoolStatsOptions {
  decA?: number;
  decB?: number;
  priceA?: number;
  priceB?: number;
}

export function usePoolStats(
  pairAddress: `0x${string}` = LIFTUP_PAIR_USDC_EURC,
  options?: UsePoolStatsOptions,
): { stats: PoolStats | null; refetch: () => void } {
  const decA = options?.decA ?? TOKEN_DECIMALS;
  const decB = options?.decB ?? TOKEN_DECIMALS;
  const priceA = options?.priceA ?? 1;
  const priceB = options?.priceB ?? 1;
  const { address } = useAccount();

  const contracts = useMemo(
    () =>
      [
        {
          address: pairAddress,
          abi: liftupPairAbi,
          functionName: 'token0' as const,
          chainId: arcTestnet.id,
        },
        {
          address: pairAddress,
          abi: liftupPairAbi,
          functionName: 'getReserves' as const,
          chainId: arcTestnet.id,
        },
        {
          address: pairAddress,
          abi: liftupPairAbi,
          functionName: 'totalSupply' as const,
          chainId: arcTestnet.id,
        },
        {
          address: pairAddress,
          abi: erc20Abi,
          functionName: 'balanceOf' as const,
          args: [address ?? '0x0000000000000000000000000000000000000000'] as const,
          chainId: arcTestnet.id,
        },
      ] as const,
    [address, pairAddress],
  );

  const { data, refetch } = useReadContracts({
    contracts: contracts as any,
    query: {
      refetchInterval: 5_000,
      refetchOnWindowFocus: true,
    },
  });

  const stats = useMemo<PoolStats | null>(() => {
    if (!data) return null;

    const [t0, reserves, supply, userBal] = data;

    if (
      t0.status !== 'success' ||
      reserves.status !== 'success' ||
      supply.status !== 'success'
    ) {
      return null;
    }

    const [r0, r1] = reserves.result as readonly [bigint, bigint, number];
    const totalLp = supply.result as bigint;
    const userLp = userBal.status === 'success' ? (userBal.result as bigint) : 0n;

    const reserveUsdc = r0;   // tokenA reserve
    const reserveEurc = r1;   // tokenB reserve

    const reserveUsdcFloat = parseFloat(formatUnits(reserveUsdc, decA));
    const reserveEurcFloat = parseFloat(formatUnits(reserveEurc, decB));

    const sharePct = totalLp === 0n ? 0 : Number((userLp * 10_000n) / totalLp) / 10_000;

    return {
      pair: pairAddress,
      reserveUsdc,
      reserveEurc,
      totalLp,
      userLp,
      userShare: sharePct,
      userUsdc: reserveUsdcFloat * sharePct,
      userEurc: reserveEurcFloat * sharePct,
      priceEurcPerUsdc: reserveUsdcFloat > 0 ? reserveEurcFloat / reserveUsdcFloat : 0,
      tvlUsdc: reserveUsdcFloat * priceA + reserveEurcFloat * priceB,
    };
  }, [data, pairAddress, decA, decB, priceA, priceB]);

  return { stats, refetch };
}

export { USDC_ON_ARC, EURC_ON_ARC, LIFTUP_PAIR_USDC_EURC, TOKEN_DECIMALS };