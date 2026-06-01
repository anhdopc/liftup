'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSwitchChain } from 'wagmi';
import { toHex } from 'viem';
import { arcTestnet } from '@/lib/chains';

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  providers?: EthereumProvider[];
}

/** Find the actual injected MetaMask provider, handling multi-injection (Coinbase, Rabby, etc.) */
function detectMetaMask(): EthereumProvider | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { ethereum?: EthereumProvider };
  const eth = w.ethereum;
  if (!eth) return null;
  if (eth.providers && eth.providers.length) {
    const mm = eth.providers.find((p) => p.isMetaMask);
    if (mm) return mm;
  }
  if (eth.isMetaMask) return eth;
  // Any injected provider is better than none — return as-is.
  return eth;
}

export type ArcChainState =
  | 'unknown'
  | 'on-arc'
  | 'not-added'           // user has not yet added Arc to their wallet
  | 'added-not-switched'  // chain is added but user isn't on it
  | 'error';

const STORAGE_KEY = 'liftup.arcChainState';

function readStored(): ArcChainState {
  if (typeof window === 'undefined') return 'unknown';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY) as ArcChainState | null;
    return v ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function persist(state: ArcChainState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, state);
  } catch {
    /* ignore */
  }
}

/**
 * Robust Arc add / switch following the proven arcapis pattern:
 *   1. Try wallet_switchEthereumChain first (works if user already has Arc).
 *   2. On 4902 / -32603 / "Unrecognized chain" → wallet_addEthereumChain.
 *   3. Track outcome so UI can show 'ADD ARC TESTNET' vs 'SWITCH NETWORK'.
 *
 * Bypasses wagmi/Reown abstractions for browser MetaMask users — falls back
 * to wagmi only when no injected provider is present (mobile WalletConnect).
 */
export function useAddArcNetwork(currentChainId?: number) {
  const { switchChainAsync } = useSwitchChain();
  const [chainState, setChainState] = useState<ArcChainState>('unknown');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    setChainState(readStored());
  }, []);

  useEffect(() => {
    if (currentChainId === arcTestnet.id) {
      setChainState('on-arc');
      persist('on-arc');
    }
  }, [currentChainId]);

  const addOrSwitch = useCallback(async () => {
    if (isPending) return;
    setError(null);
    setIsPending(true);

    const provider = detectMetaMask();
    const chainIdHex = toHex(arcTestnet.id);

    // Path A — injected provider (MetaMask extension). Raw RPC, like arcapis.
    if (provider) {
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainIdHex }],
        });
        console.info('[liftup] wallet_switchEthereumChain accepted');
        setChainState('on-arc');
        persist('on-arc');
        setIsPending(false);
        return;
      } catch (err) {
        const e = err as { code?: number; message?: string };
        const msg = e?.message ?? String(err);
        const code = e?.code;
        console.warn('[liftup] switch failed', { code, msg });

        const isChainMissing =
          code === 4902 || code === -32603 || /Unrecognized chain|wallet_addEthereumChain/i.test(msg);

        if (isChainMissing) {
          try {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: chainIdHex,
                  chainName: arcTestnet.name,
                  nativeCurrency: arcTestnet.nativeCurrency,
                  rpcUrls: [...arcTestnet.rpcUrls.default.http],
                  blockExplorerUrls: [arcTestnet.blockExplorers.default.url],
                },
              ],
            });
            console.info('[liftup] wallet_addEthereumChain accepted');
            // MetaMask usually auto-switches after add. If not, the chain
            // listener / next render will catch it.
            setChainState('on-arc');
            persist('on-arc');
          } catch (addErr) {
            const ae = addErr as { code?: number; message?: string };
            console.error('[liftup] add chain failed', ae);
            if (ae?.code === 4001 || /reject/i.test(ae?.message ?? '')) {
              setChainState('not-added');
              persist('not-added');
              setError('You rejected the add network request.');
            } else {
              setChainState('error');
              setError(ae?.message ?? 'Could not add Arc Testnet.');
            }
          }
        } else if (code === 4001 || /reject/i.test(msg)) {
          // Chain is added (otherwise we'd have 4902) but user refused to switch.
          setChainState('added-not-switched');
          persist('added-not-switched');
          setError('You rejected the network switch.');
        } else {
          setChainState('error');
          setError(msg || 'Could not switch network.');
        }
      } finally {
        setIsPending(false);
      }
      return;
    }

    // Path B — no injected provider (mobile WalletConnect). Use wagmi.
    try {
      await switchChainAsync({ chainId: arcTestnet.id });
      setChainState('on-arc');
      persist('on-arc');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[liftup] wagmi switch failed (no injected provider)', err);
      setError(message);
    } finally {
      setIsPending(false);
    }
  }, [isPending, switchChainAsync]);

  return { addOrSwitch, chainState, isPending, error };
}
