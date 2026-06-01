'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { makeViemAdapter } from '@/lib/circleKit';

type Adapter = Awaited<ReturnType<typeof makeViemAdapter>>;

/**
 * Returns a Circle ViemAdapter wrapping the wallet currently connected
 * through wagmi/Reown. Re-created when the connector changes.
 */
export function useCircleAdapter(): { adapter: Adapter | null; ready: boolean } {
  const { connector, isConnected } = useAccount();
  const [adapter, setAdapter] = useState<Adapter | null>(null);
  const [ready, setReady] = useState(false);
  const last = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    async function build() {
      if (!isConnected || !connector) {
        setAdapter(null);
        setReady(false);
        last.current = null;
        return;
      }
      try {
        const provider = await connector.getProvider();
        if (cancelled) return;
        if (last.current === provider) return;
        last.current = provider;
        const next = await makeViemAdapter(provider as never);
        if (!cancelled) {
          setAdapter(next);
          setReady(true);
        }
      } catch (err) {
        console.warn('[liftup] failed to build Circle adapter', err);
        if (!cancelled) {
          setAdapter(null);
          setReady(false);
        }
      }
    }
    void build();
    return () => {
      cancelled = true;
    };
  }, [connector, isConnected]);

  return { adapter, ready };
}
