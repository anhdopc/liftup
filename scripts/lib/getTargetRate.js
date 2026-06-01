// Live target ratio for any LiftUp pool — multi-source CONSENSUS, multi-pair.
//
//   getTargetRate({ pair: 'USDC-EURC' })   → EURC per USDC
//   getTargetRate({ pair: 'USDC-cirBTC' }) → cirBTC per USDC
//   getTargetRate({ pair: 'EURC-cirBTC' }) → cirBTC per EURC
//
// Sources (fetched in PARALLEL; throws unless ≥2 succeed AND agree
// within MAX_RATE_DEVIATION_PCT of the median):
//
//   USDC-EURC
//     CoinGecko       — euro-coin USD price
//     Coinbase        — EURC-USDC ticker
//     Frankfurter     — ECB EUR/USD fix
//     CoinMarketCap   — EURC USD price (only if CMC_API_KEY set)
//   USDC-cirBTC
//     CoinGecko       — bitcoin USD
//     Coinbase        — BTC USD
//     CoinMarketCap   — BTC USD (only if CMC_API_KEY set)
//   EURC-cirBTC
//     CoinGecko       — bitcoin EUR
//     Coinbase        — BTC EUR
//     CoinMarketCap   — BTC EUR (only if CMC_API_KEY set)
//
// Returns { rate, source, fetchedAt, sources[], deviationPct }.
//
// Safety model
//   • The bot has its own per-pool drift guard (REFUSE_DRIFT_BPS) and
//     per-tick percentage cap. THIS helper adds an upstream guard:
//     refuse to publish a target the live market disagrees with.
//
//   • Multi-source CONSENSUS is mandatory. The chosen rate is the
//     median of the sources that succeeded. If any source deviates from
//     the median by more than MAX_RATE_DEVIATION_PCT (default 5%), the
//     helper THROWS. The bot caller skips the pool on throw, so a spiked
//     CoinGecko quote can't trigger a real swap.
//
//   • Manual overrides are SCOPED PER PAIR:
//        TARGET_RATIO_USDC_EURC=0.92
//        TARGET_RATIO_USDC_CIRBTC=0.0000135
//     The legacy bare TARGET_RATIO still works as a fallback, but a
//     per-pair var ALWAYS wins. Overrides ARE STILL VALIDATED — the
//     override is accepted only if it falls within
//     MAX_RATE_DEVIATION_PCT of the live consensus median. This stops
//     a typo'd env (which once drove cirBTC pools to a ~$1M ratio) from
//     ever reaching the bot. Set ALLOW_UNVALIDATED_OVERRIDE=1 to bypass
//     this check (use sparingly).
//
//   • If no live source succeeds, FALLBACKS[pair] is used (only
//     USDC-EURC has one — months of stable history). Anything else
//     throws.
//
// Env knobs
//   CMC_API_KEY                   Pro CoinMarketCap key (optional but recommended)
//   MAX_RATE_DEVIATION_PCT=5      Max % each source may differ from median
//   ALLOW_UNVALIDATED_OVERRIDE=1  Skip consensus check on TARGET_RATIO_* override

const FETCH_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_DEVIATION_PCT = Number(process.env.MAX_RATE_DEVIATION_PCT ?? '5');

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`timeout after ${ms}ms`)), ms),
    ),
  ]);
}

// ── EURC sources ───────────────────────────────────────────────────────
async function eurcCoinGecko() {
  const r = await withTimeout(
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=euro-coin&vs_currencies=usd'),
    FETCH_TIMEOUT_MS,
  );
  if (!r.ok) throw new Error(`CoinGecko HTTP ${r.status}`);
  const j = await r.json();
  const usd = j?.['euro-coin']?.usd;
  if (typeof usd !== 'number' || !(usd > 0)) throw new Error('bad payload');
  return { rate: 1 / usd, eurcUsd: usd };
}
async function eurcCoinbase() {
  const r = await withTimeout(
    fetch('https://api.exchange.coinbase.com/products/EURC-USDC/ticker'),
    FETCH_TIMEOUT_MS,
  );
  if (!r.ok) throw new Error(`Coinbase HTTP ${r.status}`);
  const j = await r.json();
  const price = parseFloat(j?.price ?? '0');
  if (!(price > 0)) throw new Error('bad payload');
  return { rate: 1 / price, eurcUsd: price };
}
async function eurcFrankfurter() {
  const r = await withTimeout(
    fetch('https://api.frankfurter.app/latest?from=USD&to=EUR'),
    FETCH_TIMEOUT_MS,
  );
  if (!r.ok) throw new Error(`Frankfurter HTTP ${r.status}`);
  const j = await r.json();
  const eur = j?.rates?.EUR;
  if (typeof eur !== 'number' || !(eur > 0)) throw new Error('bad payload');
  return { rate: eur };
}
async function eurcCMC(apiKey) {
  const r = await withTimeout(
    fetch(
      'https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?symbol=EURC&convert=USD',
      { headers: { 'X-CMC_PRO_API_KEY': apiKey } },
    ),
    FETCH_TIMEOUT_MS,
  );
  if (!r.ok) throw new Error(`CMC HTTP ${r.status}`);
  const j = await r.json();
  const arr = j?.data?.EURC;
  const entry = Array.isArray(arr) ? arr[0] : arr;
  const usd = entry?.quote?.USD?.price;
  if (typeof usd !== 'number' || !(usd > 0)) throw new Error('bad payload');
  return { rate: 1 / usd, eurcUsd: usd };
}

// ── BTC sources ────────────────────────────────────────────────────────
async function btcCoinGecko(currency /* 'usd' | 'eur' */) {
  const r = await withTimeout(
    fetch(`https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${currency}`),
    FETCH_TIMEOUT_MS,
  );
  if (!r.ok) throw new Error(`CoinGecko HTTP ${r.status}`);
  const j = await r.json();
  const price = j?.bitcoin?.[currency];
  if (typeof price !== 'number' || !(price > 0)) throw new Error('bad payload');
  return { rate: 1 / price, btcPrice: price };
}
async function btcCoinbase(currency /* 'USD' | 'EUR' */) {
  const r = await withTimeout(
    fetch('https://api.coinbase.com/v2/exchange-rates?currency=BTC'),
    FETCH_TIMEOUT_MS,
  );
  if (!r.ok) throw new Error(`Coinbase HTTP ${r.status}`);
  const j = await r.json();
  const price = parseFloat(j?.data?.rates?.[currency] ?? '0');
  if (!(price > 0)) throw new Error('bad payload');
  return { rate: 1 / price, btcPrice: price };
}
async function btcCMC(currency /* 'USD' | 'EUR' */, apiKey) {
  const r = await withTimeout(
    fetch(
      `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?symbol=BTC&convert=${currency}`,
      { headers: { 'X-CMC_PRO_API_KEY': apiKey } },
    ),
    FETCH_TIMEOUT_MS,
  );
  if (!r.ok) throw new Error(`CMC HTTP ${r.status}`);
  const j = await r.json();
  const arr = j?.data?.BTC;
  const entry = Array.isArray(arr) ? arr[0] : arr;
  const price = entry?.quote?.[currency]?.price;
  if (typeof price !== 'number' || !(price > 0)) throw new Error('bad payload');
  return { rate: 1 / price, btcPrice: price };
}

// ── Source registry ────────────────────────────────────────────────────
function sourcesFor(pair) {
  const cmcKey = process.env.CMC_API_KEY || '';
  if (pair === 'USDC-EURC') {
    const s = [
      { name: 'coingecko',   fn: eurcCoinGecko },
      { name: 'coinbase',    fn: eurcCoinbase },
      { name: 'frankfurter', fn: eurcFrankfurter },
    ];
    if (cmcKey) s.push({ name: 'coinmarketcap', fn: () => eurcCMC(cmcKey) });
    return s;
  }
  if (pair === 'USDC-cirBTC') {
    const s = [
      { name: 'coingecko', fn: () => btcCoinGecko('usd') },
      { name: 'coinbase',  fn: () => btcCoinbase('USD') },
    ];
    if (cmcKey) s.push({ name: 'coinmarketcap', fn: () => btcCMC('USD', cmcKey) });
    return s;
  }
  if (pair === 'EURC-cirBTC') {
    const s = [
      { name: 'coingecko', fn: () => btcCoinGecko('eur') },
      { name: 'coinbase',  fn: () => btcCoinbase('EUR') },
    ];
    if (cmcKey) s.push({ name: 'coinmarketcap', fn: () => btcCMC('EUR', cmcKey) });
    return s;
  }
  throw new Error(`Unknown pair: ${pair}`);
}

const FALLBACKS = { 'USDC-EURC': 0.98 };

function median(nums) {
  const a = [...nums].sort((x, y) => x - y);
  return a.length % 2 === 1
    ? a[(a.length - 1) / 2]
    : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
}

/**
 * Fetch every source in parallel, return per-source {ok, name, rate, ...}.
 */
async function fetchAllSources(pair) {
  const sources = sourcesFor(pair);
  const results = await Promise.allSettled(sources.map((s) =>
    s.fn().then((r) => ({ ok: true, name: s.name, ...r }))
          .catch((e) => { throw new Error(`${s.name}: ${e.message}`); }),
  ));
  return results.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : { ok: false, name: r.reason.message.split(':')[0], error: r.reason.message },
  );
}

/**
 * Validate a candidate rate against the live consensus.
 * Throws if max deviation > maxDeviationPct. Returns the consensus report.
 */
function checkConsensus({ pair, candidate, sources, maxDeviationPct, verbose }) {
  const ok = sources.filter((s) => s.ok);
  const failed = sources.filter((s) => !s.ok);

  if (verbose && failed.length > 0) {
    console.warn(`  [rate · ${pair}] ${failed.length} source(s) failed: ${failed.map((f) => `${f.name}(${f.error})`).join(', ')}`);
  }

  if (ok.length < 2) {
    throw new Error(
      `Need ≥2 live rate sources for consensus on ${pair}, got ${ok.length}. ` +
      `Failed: ${failed.map((f) => f.name).join(', ') || 'none'}.`,
    );
  }

  const med = median(ok.map((s) => s.rate));
  const perSource = ok.map((s) => ({
    name: s.name,
    rate: s.rate,
    deviationPct: Math.abs(s.rate - med) / med * 100,
  }));
  const maxSourceDev = Math.max(...perSource.map((s) => s.deviationPct));

  if (maxSourceDev > maxDeviationPct) {
    const detail = perSource
      .map((s) => `${s.name}=${s.rate.toExponential(4)}(${s.deviationPct.toFixed(2)}%)`)
      .join(', ');
    throw new Error(
      `Rate sources for ${pair} diverge by ${maxSourceDev.toFixed(2)}% (> ${maxDeviationPct}% threshold). ` +
      `Refusing to publish a target. Sources: ${detail}. Median: ${med.toExponential(4)}.`,
    );
  }

  // If a candidate is supplied (override path), check IT against the median too.
  const candidateDev = candidate !== null
    ? Math.abs(candidate - med) / med * 100
    : 0;
  if (candidate !== null && candidateDev > maxDeviationPct) {
    const detail = perSource.map((s) => `${s.name}=${s.rate.toExponential(4)}`).join(', ');
    throw new Error(
      `Override candidate ${candidate.toExponential(4)} for ${pair} deviates ${candidateDev.toFixed(2)}% ` +
      `from live median ${med.toExponential(4)} (> ${maxDeviationPct}%). Sources: ${detail}. ` +
      `Set ALLOW_UNVALIDATED_OVERRIDE=1 to bypass.`,
    );
  }

  if (verbose) {
    const sourceList = perSource
      .map((s) => `${s.name}=${s.rate.toExponential(4)}`)
      .join(', ');
    console.log(
      `  [rate · ${pair}] consensus median=${med.toExponential(4)} ` +
      `(${ok.length} sources, max dev ${maxSourceDev.toFixed(2)}%) — ${sourceList}`,
    );
  }

  return { median: med, perSource, maxSourceDev };
}

async function getTargetRate({ pair = 'USDC-EURC', verbose = true } = {}) {
  const maxDeviationPct = DEFAULT_MAX_DEVIATION_PCT;

  // 1. Manual override (per-pair preferred; bare TARGET_RATIO as fallback).
  const pairEnv = `TARGET_RATIO_${pair.replace(/-/g, '_').toUpperCase()}`;
  const overrideRaw = process.env[pairEnv] ?? process.env.TARGET_RATIO;
  const overrideKey = process.env[pairEnv] !== undefined ? pairEnv : 'TARGET_RATIO';
  const overrideRate = overrideRaw ? parseFloat(overrideRaw) : null;
  const hasOverride = overrideRate !== null && Number.isFinite(overrideRate) && overrideRate > 0;

  if (hasOverride && process.env.ALLOW_UNVALIDATED_OVERRIDE === '1') {
    if (verbose) {
      console.warn(`  [rate · ${pair}] ⚠ ${overrideKey}=${overrideRate} — ALLOW_UNVALIDATED_OVERRIDE=1, SKIPPING consensus check.`);
    }
    return { rate: overrideRate, source: `override:${overrideKey}:unvalidated`, fetchedAt: Date.now() };
  }

  // 2. Fetch live consensus.
  const sources = await fetchAllSources(pair);

  // 3. If override → validate it against consensus and use it.
  if (hasOverride) {
    try {
      const consensus = checkConsensus({
        pair, candidate: overrideRate, sources, maxDeviationPct, verbose,
      });
      if (verbose) {
        console.log(`  [rate · ${pair}] ✓ ${overrideKey} override = ${overrideRate} (within ${maxDeviationPct}% of consensus)`);
      }
      return {
        rate: overrideRate,
        source: `override:${overrideKey}`,
        fetchedAt: Date.now(),
        consensus,
      };
    } catch (err) {
      throw new Error(
        `${overrideKey} override REJECTED: ${err.message}`,
      );
    }
  }

  // 4. No override — try consensus median. If too few sources, fall back per-pair.
  try {
    const consensus = checkConsensus({
      pair, candidate: null, sources, maxDeviationPct, verbose,
    });
    return {
      rate: consensus.median,
      source: `consensus:${consensus.perSource.map((s) => s.name).join('+')}`,
      fetchedAt: Date.now(),
      consensus,
    };
  } catch (err) {
    const fb = FALLBACKS[pair];
    if (fb !== undefined) {
      console.warn(`  [rate · ${pair}] ⚠ consensus failed (${err.message}) — using hardcoded fallback ${fb}.`);
      return { rate: fb, source: 'hardcoded-fallback', fetchedAt: Date.now() };
    }
    throw err;
  }
}

module.exports = { getTargetRate };
