'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { erc20Abi } from 'viem';
import { arcTestnet } from '@/lib/chains';
import { LIFTUP_ROUTER, liftupRouterAbi } from '@/lib/liftupAmm';

export type RemoveLiquidityStep =
  | 'idle'
  | 'approving-lp'
  | 'removing'
  | 'success'
  | 'error';

interface UseRemoveLiquidityArgs {
  /** Address of the specific LiftupPair (= LP token). */
  pair: `0x${string}`;
  tokenA: `0x${string}`;
  tokenB: `0x${string}`;
}

/**
 * Pair-agnostic remove-liquidity hook. Approves the LP token (which is
 * the pair contract itself) to the router, then calls
 * router.removeLiquidity. Use the same flow for USDC/EURC, USDC/cirBTC,
 * EURC/cirBTC — caller just passes the right pair + token addresses.
 */
export function useRemoveLiquidity({ pair, tokenA, tokenB }: UseRemoveLiquidityArgs) {
  const { address } = useAccount();
  const [step, setStep] = useState<RemoveLiquidityStep>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { writeContractAsync, data: txHash, reset: resetWrite } = useWriteContract();
  const { isSuccess: txSuccess, isError: txError } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: arcTestnet.id,
    query: { enabled: !!txHash },
  });

  // LP-token allowance (user → router) for the specific pair.
  const { data: lpAllowance, refetch: refetchAllowance } = useReadContract({
    address: pair,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, LIFTUP_ROUTER] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address, refetchInterval: 5_000 },
  });

  useEffect(() => {
    if (txSuccess) {
      void refetchAllowance();
      if (step === 'approving-lp') setStep('idle');
      if (step === 'removing') setStep('success');
    }
    if (txError) {
      setStep('error');
      setErrorMessage('Transaction reverted on chain.');
    }
  }, [txSuccess, txError, step, refetchAllowance]);

  const approveLp = useCallback(
    async (liquidity: bigint) => {
      setErrorMessage(null);
      try {
        setStep('approving-lp');
        await writeContractAsync({
          address: pair,
          abi: erc20Abi,
          functionName: 'approve',
          args: [LIFTUP_ROUTER, liquidity],
          chainId: arcTestnet.id,
        });
      } catch (err) {
        setStep('error');
        setErrorMessage(err instanceof Error ? err.message : String(err));
      }
    },
    [writeContractAsync, pair],
  );

  const removeLiquidity = useCallback(
    async (params: {
      liquidity: bigint;
      minA: bigint;
      minB: bigint;
      deadlineSec?: number;
    }) => {
      setErrorMessage(null);
      if (!address) {
        setStep('error');
        setErrorMessage('Wallet not connected');
        return;
      }
      const deadline = BigInt(
        Math.floor(Date.now() / 1000) + (params.deadlineSec ?? 600),
      );
      try {
        setStep('removing');
        await writeContractAsync({
          address: LIFTUP_ROUTER,
          abi: liftupRouterAbi,
          functionName: 'removeLiquidity',
          args: [
            tokenA,
            tokenB,
            params.liquidity,
            params.minA,
            params.minB,
            address,
            deadline,
          ],
          chainId: arcTestnet.id,
        });
      } catch (err) {
        setStep('error');
        setErrorMessage(err instanceof Error ? err.message : String(err));
      }
    },
    [address, writeContractAsync, tokenA, tokenB],
  );

  const reset = useCallback(() => {
    setStep('idle');
    setErrorMessage(null);
    resetWrite();
  }, [resetWrite]);

  return {
    step,
    txHash,
    errorMessage,
    lpAllowance: (lpAllowance as bigint | undefined) ?? 0n,
    approveLp,
    removeLiquidity,
    reset,
  };
}
