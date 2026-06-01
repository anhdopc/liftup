'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { erc20Abi, parseUnits } from 'viem';
import { arcTestnet } from '@/lib/chains';
import { LIFTUP_ROUTER, liftupRouterAbi } from '@/lib/liftupAmm';
import { USDC_ON_ARC, EURC_ON_ARC, type Token } from '@/lib/tokens';

export type LiftupStep =
  | 'idle'
  | 'approving'
  | 'swapping'
  | 'success'
  | 'error';

function tokenErc20(token: Token): `0x${string}` | undefined {
  if (token.symbol === 'USDC') return USDC_ON_ARC;
  if (token.symbol === 'EURC') return EURC_ON_ARC;
  return token.address;
}

/** On-chain ERC-20 decimals (USDC's 6-dp wrapper, EURC 6, cirBTC 8…). */
function onChainDecimals(token: Token): number {
  return token.native ? 6 : token.decimals;
}

export function useLiftupAllowance(tokenIn: Token) {
  const { address } = useAccount();
  const tokenAddr = tokenErc20(tokenIn);
  return useReadContract({
    address: tokenAddr,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && tokenAddr ? [address, LIFTUP_ROUTER] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address && !!tokenAddr },
  });
}

/**
 * Two-tx flow against LiftupRouter: approve tokenIn, then
 * swapExactTokensForTokens([tokenIn, tokenOut]) with slippage.
 */
export function useLiftupExecute() {
  const { address } = useAccount();
  const [step, setStep] = useState<LiftupStep>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { writeContractAsync, data: txHash, reset: resetWrite } = useWriteContract();

  const { isLoading: isMining, isSuccess: txSuccess, isError: txError } =
    useWaitForTransactionReceipt({
      hash: txHash,
      chainId: arcTestnet.id,
      query: { enabled: !!txHash },
    });

  useEffect(() => {
    if (txSuccess) {
      if (step === 'swapping') setStep('success');
      if (step === 'approving') setStep('idle'); // allow Swap next
    }
    if (txError) {
      setStep('error');
      setErrorMessage('Transaction reverted on chain.');
    }
  }, [txSuccess, txError, step]);

  const approve = useCallback(
    async (tokenIn: Token, amountInRaw: bigint) => {
      setErrorMessage(null);
      const tokenAddr = tokenErc20(tokenIn);
      if (!tokenAddr) {
        setStep('error');
        setErrorMessage('Token contract unknown');
        return;
      }
      try {
        setStep('approving');
        await writeContractAsync({
          address: tokenAddr,
          abi: erc20Abi,
          functionName: 'approve',
          args: [LIFTUP_ROUTER, amountInRaw],
          chainId: arcTestnet.id,
        });
      } catch (err) {
        setStep('error');
        setErrorMessage(err instanceof Error ? err.message : String(err));
      }
    },
    [writeContractAsync],
  );

  const swap = useCallback(
    async (params: {
      tokenIn: Token;
      tokenOut: Token;
      amountInRaw: bigint;
      amountOutMin: bigint;
      deadlineSec?: number;
    }) => {
      setErrorMessage(null);
      if (!address) {
        setStep('error');
        setErrorMessage('Wallet not connected');
        return;
      }
      const tokenInAddr = tokenErc20(params.tokenIn);
      const tokenOutAddr = tokenErc20(params.tokenOut);
      if (!tokenInAddr || !tokenOutAddr) {
        setStep('error');
        setErrorMessage('Token contract unknown');
        return;
      }
      const deadline = BigInt(
        Math.floor(Date.now() / 1000) + (params.deadlineSec ?? 600),
      );
      try {
        setStep('swapping');
        await writeContractAsync({
          address: LIFTUP_ROUTER,
          abi: liftupRouterAbi,
          functionName: 'swapExactTokensForTokens',
          args: [
            params.amountInRaw,
            params.amountOutMin,
            [tokenInAddr, tokenOutAddr],
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
    [address, writeContractAsync],
  );

  const reset = useCallback(() => {
    setStep('idle');
    setErrorMessage(null);
    resetWrite();
  }, [resetWrite]);

  /**
   * Convert a human-readable amountOut + slippage% to bigint amountOutMin.
   * Caller passes the OUTPUT token so we encode the right number of
   * decimals (cirBTC is 8-dp, USDC + EURC are 6-dp).
   */
  const computeMinOut = useCallback(
    (amountOut: number, slippagePct: number, tokenOut: Token) => {
      const dec = onChainDecimals(tokenOut);
      const min = amountOut * (1 - slippagePct / 100);
      // toFixed clamps to dec digits, parseUnits then rebuilds the bigint.
      return parseUnits(min.toFixed(dec), dec);
    },
    [],
  );

  return {
    step,
    isMining,
    txHash,
    errorMessage,
    approve,
    swap,
    reset,
    computeMinOut,
  };
}
