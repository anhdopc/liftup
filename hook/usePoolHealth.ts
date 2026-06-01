'use client';

import { useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { arcTestnet } from '@/lib/chains';
import {
  LIFTUP_ROUTER,
  LIFTUP_PAIR_USDC_EURC,
  LIFTUP_PAIR_USDC_CIRBTC,
  LIFTUP_PAIR_EURC_CIRBTC,
  liftupRouterAbi,
} from '@/lib/liftupAmm';
import { USDC_ON_ARC, EURC_ON_ARC, CIRBTC_ON_ARC } from '@/lib/tokens';

/**
 * Pool health check — the swap UI's circuit breaker.
 *
 * Every 30 seconds we read each registered pool's on-chain reserves and
 * fetch the matching live spot rate from independent off-chain sources.
 * Drift between the implied pool rate and the spot drives the breaker:
 *
 *   healthy = sourceCount > 0 && driftBps ≤ CIRCUIT_BREAKER_BPS  (1000 = 10%)
 *
 * Each pair has its own rate sources — EURC pair uses EURC-USDC quotes,
 * cirBTC pairs use BTC/USD or BTC/EUR. Both sources for a given pair are
 * fetched in parallel and the median is taken so one source going stale
 * can't flip the breaker.
 *
 * The hook accepts an optional `pairId` (defaults to USDC-EURC for
 * back-compat). SwapCard passes the pair the user is currently swapping
 * so the banner reflects that pool's health, not the headline one.
 *
 * Failure modes:
 *   • All rate sources for the chosen pair down → fail CLOSED (unhealthy,
 *     UI routes to Circle).
 *   • Pool empty / no reserves → fail OPEN (nothing to drain).
 *   • RPC unreachable → loading state held.
 *
 * Stateless. No server flag, no on-chain switch. Every browser
 * re-evaluates from public inputs — the same signal an arbitrageur
 * would compute.
 */

export const CIRCUIT_BREAKER_BPS = 1000; // 10%
const REFRESH_MS = 30_000;

export type PoolPairId = 'USDC-EURC' | 'USDC-cirBTC' | 'EURC-cirBTC';
export type RateSource = 'coingecko' | 'coinbase' | 'median' | 'unknown';

export interface PoolHealth {
  pairId: PoolPairId;
  healthy: boolean;
  driftBps: number;
  /** Pool's implied tokenB-per-tokenA. 0 when reserves empty / unread. */
  currentRatio: number;
  /** Aggregated target rate (tokenB per tokenA). null when ALL sources fail. */
  targetRatio: number | null;
  rateSource: RateSource;
  /** 0 (all sources down), 1 (degraded — only one source live), 2 (full confidence). */
  sourceCount: number;
  sourcesDown: boolean;
  loading: boolean;
  error: string | null;
}

// ──────────────────────────────────────────────────────────────────────
// Rate fetchers — one pair per fetcher, both source primitives below.
// ──────────────────────────────────────────────────────────────────────

async function fetchCoinGeckoEurUsd(): Promise<number> {
  // EURC priced in USD via euro-coin → 1 USDC = 1/usd EURC.
  const r = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=euro-coin&vs_currencies=usd',
  );
  if (!r.ok) throw new Error(`CoinGecko HTTP ${r.status}`);
  const j = (await r.json()) as { 'euro-coin'?: { usd?: number } };
  const usd = j?.['euro-coin']?.usd;
  if (typeof usd !== 'number' || !(usd > 0)) throw new Error('bad payload');
  return 1 / usd;
}

async function fetchCoinbaseEurUsd(): Promise<number> {
  const r = await fetch('https://api.exchange.coinbase.com/products/EURC-USDC/ticker');
  if (!r.ok) throw new Error(`Coinbase HTTP ${r.status}`);
  const j = (await r.json()) as { price?: string };
  const price = j?.price ? parseFloat(j.price) : NaN;
  if (!Number.isFinite(price) || price <= 0) throw new Error('bad payload');
  return 1 / price;
}

async function fetchCoinGeckoBtcUsd(): Promise<number> {
  const r = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
  );
  if (!r.ok) throw new Error(`CoinGecko HTTP ${r.status}`);
  const j = (await r.json()) as { bitcoin?: { usd?: number } };
  const usd = j?.bitcoin?.usd;
  if (typeof usd !== 'number' || !(usd > 0)) throw new Error('bad payload');
  // USDC/cirBTC pool ratio = cirBTC per USDC = 1/btcUsd
  return 1 / usd;
}

async function fetchCoinbaseBtcUsd(): Promise<number> {
  const r = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=BTC');
  if (!r.ok) throw new Error(`Coinbase HTTP ${r.status}`);
  const j = (await r.json()) as { data?: { rates?: { USD?: string } } };
  const usd = j?.data?.rates?.USD ? parseFloat(j.data.rates.USD) : NaN;
  if (!Number.isFinite(usd) || usd <= 0) throw new Error('bad payload');
  return 1 / usd;
}

async function fetchCoinGeckoBtcEur(): Promise<number> {
  const r = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur',
  );
  if (!r.ok) throw new Error(`CoinGecko HTTP ${r.status}`);
  const j = (await r.json()) as { bitcoin?: { eur?: number } };
  const eur = j?.bitcoin?.eur;
  if (typeof eur !== 'number' || !(eur > 0)) throw new Error('bad payload');
  return 1 / eur;
}

async function fetchCoinbaseBtcEur(): Promise<number> {
  const r = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=BTC');
  if (!r.ok) throw new Error(`Coinbase HTTP ${r.status}`);
  const j = (await r.json()) as { data?: { rates?: { EUR?: string } } };
  const eur = j?.data?.rates?.EUR ? parseFloat(j.data.rates.EUR) : NaN;
  if (!Number.isFinite(eur) || eur <= 0) throw new Error('bad payload');
  return 1 / eur;
}

// Per-pair config: which on-chain pair address, which two token decimals
// (for converting raw reserves to a meaningful ratio), and the two rate
// fetchers to consult for the spot target.
interface PoolConfig {
  pair: `0x${string}`;
  tokenA: `0x${string}`;
  tokenB: `0x${string}`;
  decA: number;
  decB: number;
  fetchA: () => Promise<number>;
  fetchB: () => Promise<number>;
}

const POOL_CONFIGS: Record<PoolPairId, PoolConfig> = {
  'USDC-EURC': {
    pair: LIFTUP_PAIR_USDC_EURC,
    tokenA: USDC_ON_ARC,
    tokenB: EURC_ON_ARC,
    decA: 6,
    decB: 6,
    fetchA: fetchCoinGeckoEurUsd,
    fetchB: fetchCoinbaseEurUsd,
  },
  'USDC-cirBTC': {
    pair: LIFTUP_PAIR_USDC_CIRBTC,
    tokenA: USDC_ON_ARC,
    tokenB: CIRBTC_ON_ARC,
    decA: 6,
    decB: 8,
    fetchA: fetchCoinGeckoBtcUsd,
    fetchB: fetchCoinbaseBtcUsd,
  },
  'EURC-cirBTC': {
    pair: LIFTUP_PAIR_EURC_CIRBTC,
    tokenA: EURC_ON_ARC,
    tokenB: CIRBTC_ON_ARC,
    decA: 6,
    decB: 8,
    fetchA: fetchCoinGeckoBtcEur,
    fetchB: fetchCoinbaseBtcEur,
  },
};

/** Pick a pairId from a (tokenA, tokenB) symbol combo regardless of order. */
export function pairIdForTokens(symA: string, symB: string): PoolPairId | null {
  const key = [symA, symB].sort().join('|');
  if (key === 'EURC|USDC') return 'USDC-EURC';
  if (key === 'USDC|cirBTC') return 'USDC-cirBTC';
  if (key === 'EURC|cirBTC') return 'EURC-cirBTC';
  return null;
}

export function usePoolHealth(pairId: PoolPairId = 'USDC-EURC'): PoolHealth {
  const client = usePublicClient({ chainId: arcTestnet.id });
  const [state, setState] = useState<PoolHealth>({
    pairId,
    healthy: true,
    driftBps: 0,
    currentRatio: 0,
    targetRatio: null,
    rateSource: 'unknown',
    sourceCount: 0,
    sourcesDown: false,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!client) return;
    const cfg = POOL_CONFIGS[pairId];
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function run() {
      try {
        const [aRes, bRes, pairRes] = await Promise.allSettled([
          cfg.fetchA(),
          cfg.fetchB(),
          client!.readContract({
            address: LIFTUP_ROUTER,
            abi: liftupRouterAbi,
            functionName: 'getPairInfo',
            args: [cfg.tokenA, cfg.tokenB],
          }),
        ]);

        const rates: { value: number; name: 'coingecko' | 'coinbase' }[] = [];
        if (aRes.status === 'fulfilled') rates.push({ value: aRes.value, name: 'coingecko' });
        if (bRes.status === 'fulfilled') rates.push({ value: bRes.value, name: 'coinbase' });

        let targetRatio: number | null = null;
        let rateSource: RateSource = 'unknown';
        if (rates.length === 2) {
          targetRatio = (rates[0].value + rates[1].value) / 2;
          rateSource = 'median';
        } else if (rates.length === 1) {
          targetRatio = rates[0].value;
          rateSource = rates[0].name;
        }

        // Convert raw reserves to human ratio: (rB / 10^decB) / (rA / 10^decA).
        let currentRatio = 0;
        if (pairRes.status === 'fulfilled') {
          const info = pairRes.value as readonly [`0x${string}`, bigint, bigint, bigint];
          const rA = Number(info[1]) / 10 ** cfg.decA;
          const rB = Number(info[2]) / 10 ** cfg.decB;
          if (rA > 0) currentRatio = rB / rA;
        }

        const sourcesDown = rates.length === 0;
        let driftBps = 0;
        let healthy: boolean;
        if (sourcesDown) {
          healthy = false;
        } else if (currentRatio === 0 || targetRatio === null) {
          healthy = true;
        } else {
          driftBps = Math.round(
            (Math.abs(currentRatio - targetRatio) / targetRatio) * 10_000,
          );
          healthy = driftBps <= CIRCUIT_BREAKER_BPS;
        }

        if (cancelled) return;
        setState({
          pairId,
          healthy,
          driftBps,
          currentRatio,
          targetRatio,
          rateSource,
          sourceCount: rates.length,
          sourcesDown,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    }

    void run();
    timer = setInterval(run, REFRESH_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [client, pairId]);

  return state;
}
