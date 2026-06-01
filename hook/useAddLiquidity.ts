'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  useAccount,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { erc20Abi, parseUnits } from 'viem';
import { arcTestnet } from '@/lib/chains';
import { LIFTUP_ROUTER, liftupRouterAbi } from '@/lib/liftupAmm';

export type AddLiquidityStep =
  | 'idle'
  | 'approving-a'
  | 'approving-b'
  | 'adding'
  | 'success'
  | 'error';

interface UseAddLiquidityArgs {
  tokenA: `0x${string}`;
  tokenB: `0x${string}`;
  decimalsA: number;
  decimalsB: number;
}

/**
 * Pair-agnostic add-liquidity hook. Was originally hard-coded to USDC +
 * EURC; now takes any two ERC-20 tokens so the same flow drives USDC/EURC
 * as well as USDC/cirBTC and EURC/cirBTC adds.
 *
 * State flow: idle -> approving-a (if needed) -> approving-b (if needed)
 *             -> adding -> success.
 */
export function useAddLiquidity({
  tokenA,
  tokenB,
  decimalsA,
  decimalsB,
}: UseAddLiquidityArgs) {
  const { address } = useAccount();
  const [step, setStep] = useState<AddLiquidityStep>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { writeContractAsync, data: txHash, reset: resetWrite } = useWriteContract();
  const { isSuccess: txSuccess, isError: txError } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: arcTestnet.id,
    query: { enabled: !!txHash },
  });

  const { data: allowances, refetch: refetchAllowances } = useReadContracts({
    contracts: address
      ? ([
          {
            address: tokenA,
            abi: erc20Abi,
            functionName: 'allowance' as const,
            args: [address, LIFTUP_ROUTER] as const,
            chainId: arcTestnet.id,
          },
          {
            address: tokenB,
            abi: erc20Abi,
            functionName: 'allowance' as const,
            args: [address, LIFTUP_ROUTER] as const,
            chainId: arcTestnet.id,
          },
        ] as const)
      : [],
    query: { enabled: !!address, refetchInterval: 5_000 },
  });

  const allowanceA = (allowances?.[0]?.result as bigint | undefined) ?? 0n;
  const allowanceB = (allowances?.[1]?.result as bigint | undefined) ?? 0n;

  useEffect(() => {
    if (txSuccess) {
      void refetchAllowances();
      if (step === 'approving-a' || step === 'approving-b') setStep('idle');
      if (step === 'adding') setStep('success');
    }
    if (txError) {
      setStep('error');
      setErrorMessage('Transaction reverted on chain.');
    }
  }, [txSuccess, txError, step, refetchAllowances]);

  const approveA = useCallback(
    async (amount: bigint) => {
      setErrorMessage(null);
      try {
        setStep('approving-a');
        await writeContractAsync({
          address: tokenA,
          abi: erc20Abi,
          functionName: 'approve',
          args: [LIFTUP_ROUTER, amount],
          chainId: arcTestnet.id,
        });
      } catch (err) {
        setStep('error');
        setErrorMessage(err instanceof Error ? err.message : String(err));
      }
    },
    [writeContractAsync, tokenA],
  );

  const approveB = useCallback(
    async (amount: bigint) => {
      setErrorMessage(null);
      try {
        setStep('approving-b');
        await writeContractAsync({
          address: tokenB,
          abi: erc20Abi,
          functionName: 'approve',
          args: [LIFTUP_ROUTER, amount],
          chainId: arcTestnet.id,
        });
      } catch (err) {
        setStep('error');
        setErrorMessage(err instanceof Error ? err.message : String(err));
      }
    },
    [writeContractAsync, tokenB],
  );

  const addLiquidity = useCallback(
    async (params: {
      amountA: string;
      amountB: string;
      slippagePct: number;
      deadlineSec?: number;
    }) => {
      setErrorMessage(null);
      if (!address) {
        setStep('error');
        setErrorMessage('Wallet not connected');
        return;
      }
      const aWei = parseUnits(params.amountA, decimalsA);
      const bWei = parseUnits(params.amountB, decimalsB);
      const slipBps = BigInt(Math.round(params.slippagePct * 100));
      const minA = (aWei * (10_000n - slipBps)) / 10_000n;
      const minB = (bWei * (10_000n - slipBps)) / 10_000n;
      const deadline = BigInt(
        Math.floor(Date.now() / 1000) + (params.deadlineSec ?? 600),
      );
      try {
        setStep('adding');
        await writeContractAsync({
          address: LIFTUP_ROUTER,
          abi: liftupRouterAbi,
          functionName: 'addLiquidity',
          args: [tokenA, tokenB, aWei, bWei, minA, minB, address, deadline],
          chainId: arcTestnet.id,
        });
      } catch (err) {
        setStep('error');
        setErrorMessage(err instanceof Error ? err.message : String(err));
      }
    },
    [address, writeContractAsync, tokenA, tokenB, decimalsA, decimalsB],
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
    allowanceA,
    allowanceB,
    approveA,
    approveB,
    addLiquidity,
    refetchAllowances,
    reset,
  };
}
