'use client';

import { useCallback, useMemo } from 'react';
import { useAccount, useBalance, useReadContracts } from 'wagmi';
import { erc20Abi, formatUnits } from 'viem';
import { arcTestnet } from '@/lib/chains';
import { ARC_TOKENS, isTokenDeployed, type Token } from '@/lib/tokens';

export interface TokenBalance {
  /** Raw on-chain value in the token's smallest unit. */
  raw: bigint;
  decimals: number;
  /** Parsed float for math / display. */
  formatted: number;
}

export interface UseTokenBalancesResult {
  balances: Map<string, TokenBalance>;
  /** Force an immediate re-read after a successful swap/bridge. */
  refetch: () => void;
}

const REFETCH_INTERVAL_MS = 5_000;

/**
 * Reads balances for every token in ARC_TOKENS on Arc testnet. Native is
 * fetched via eth_getBalance; ERC-20s via batched multicall. Returns a map
 * keyed by symbol plus a refetch trigger the UI can fire after a swap so
 * the user sees the new balance without manually refreshing.
 */
export function useTokenBalances(): UseTokenBalancesResult {
  const { address } = useAccount();

  const { data: nativeData, refetch: refetchNative } = useBalance({
    address,
    chainId: arcTestnet.id,
    query: {
      enabled: !!address,
      refetchInterval: REFETCH_INTERVAL_MS,
      refetchOnWindowFocus: true,
    },
  });

  const erc20Tokens = ARC_TOKENS.filter((t) => !t.native && isTokenDeployed(t));

  const { data: erc20Data, refetch: refetchErc20 } = useReadContracts({
    contracts: erc20Tokens.map((t) => ({
      address: t.address!,
      abi: erc20Abi,
      functionName: 'balanceOf' as const,
      args: [address ?? '0x0000000000000000000000000000000000000000'] as const,
      chainId: arcTestnet.id,
    })),
    query: {
      enabled: !!address && erc20Tokens.length > 0,
      refetchInterval: REFETCH_INTERVAL_MS,
      refetchOnWindowFocus: true,
    },
  });

  const refetch = useCallback(() => {
    void refetchNative();
    void refetchErc20();
  }, [refetchNative, refetchErc20]);

  const balances = useMemo(() => {
    const map = new Map<string, TokenBalance>();

    const nativeToken = ARC_TOKENS.find((t) => t.native);
    if (nativeToken && nativeData) {
      map.set(nativeToken.symbol, {
        raw: nativeData.value,
        decimals: nativeData.decimals,
        formatted: parseFloat(formatUnits(nativeData.value, nativeData.decimals)),
      });
    }

    erc20Data?.forEach((result, i) => {
      const token = erc20Tokens[i];
      if (!token) return;
      if (result.status === 'success' && result.result !== undefined) {
        const raw = result.result as bigint;
        map.set(token.symbol, {
          raw,
          decimals: token.decimals,
          formatted: parseFloat(formatUnits(raw, token.decimals)),
        });
      }
    });

    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeData?.value, erc20Data]);

  return { balances, refetch };
}

export function useTokenBalance(token: Token | undefined): TokenBalance | undefined {
  const { balances } = useTokenBalances();
  if (!token) return undefined;
  return balances.get(token.symbol);
}
