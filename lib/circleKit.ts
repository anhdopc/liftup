/**
 * Circle App Kit — singleton entry point for USDC <-> EURC swaps on
 * Arc Testnet. The kit handles routing, liquidity sourcing and approval
 * (via EIP-2612 permit when supported, with `approve` as fallback).
 *
 * Architecture notes
 * ------------------
 * Circle's API endpoints (api.circle.com, iris-api.circle.com,
 * gateway-api.circle.com) do not allow cross-origin browser calls.
 * We install a one-time fetch monkey-patch on the client that rewrites
 * those origins to `/api/circle/*`, which is a Next.js route handler
 * (see `app/api/circle/[host]/[...rest]/route.ts`) that proxies to the
 * real Circle host and replaces the inbound `Authorization` header
 * with the real Kit Key from `process.env.CIRCLE_KIT_KEY`.
 *
 * Result: the real key only lives in Vercel's server runtime; the
 * browser ships only a format-valid placeholder.
 */
import { AppKit } from '@circle-fin/app-kit';
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import { getAddress } from 'viem';

export const CIRCLE_SWAP_CHAIN = 'Arc_Testnet' as const;

// ---------------------------------------------------------------------------
// LiftUp protocol fee — Circle App Kit will route this percentage of every
// swap to the recipient address. Set both env vars below in Vercel +
// .env.local; falling back to a hard-coded default keeps the swap UI
// functional during local development without further setup.
// ---------------------------------------------------------------------------
export const LIFTUP_FEE_BPS = Number(
  process.env.NEXT_PUBLIC_LIFTUP_FEE_BPS ?? '10',
);

// Normalise through viem.getAddress so it satisfies viem ≥ 2.31's strict
// EIP-55 validation no matter where the operator pasted it from.
function safeAddress(raw: string | undefined, fallback: string): `0x${string}` {
  const candidate = raw && /^0x[0-9a-fA-F]{40}$/.test(raw) ? raw : fallback;
  try {
    return getAddress(candidate);
  } catch (err) {
    console.warn('[liftup] safeAddress fell back due to', err);
    return getAddress(fallback);
  }
}

// Circle App Kit's customFee routes the LiftUp surcharge here. Point this
// at the on-chain RewardDistributor so the 10 bps from Circle-routed
// swaps lands in the same 5-bucket split as the 0.05% LiftupPair fee —
// see Option A in the reward model on /reward.
export const LIFTUP_TREASURY: `0x${string}` = safeAddress(
  process.env.NEXT_PUBLIC_LIFTUP_TREASURY,
  '0x1300c7F9F204Cf6F55192B809bD6F667acf80497',
);

/** True when both fee fields are populated and addressable. */
export function hasLiftupFee(): boolean {
  return (
    Number.isFinite(LIFTUP_FEE_BPS) &&
    LIFTUP_FEE_BPS > 0 &&
    /^0x[0-9a-fA-F]{40}$/.test(LIFTUP_TREASURY)
  );
}

/** Build the `customFee` block to pass into Circle's swap config. */
export function liftupCustomFee(): {
  percentageBps: number;
  recipientAddress: `0x${string}`;
} | undefined {
  if (!hasLiftupFee()) return undefined;
  return {
    percentageBps: LIFTUP_FEE_BPS,
    recipientAddress: LIFTUP_TREASURY,
  };
}

/**
 * The client SDK requires SOME kit key to satisfy its format validation
 * (`KIT_KEY:<32 hex>:<32 hex>`). Set `NEXT_PUBLIC_CIRCLE_KIT_KEY` if you
 * want the SDK to ship the real key in the bundle (testnet demo only).
 * Otherwise we send the placeholder and the proxy injects the real one
 * server-side.
 */
const PLACEHOLDER_KEY =
  'KIT_KEY:11111111111111111111111111111111:11111111111111111111111111111111';

export const KIT_KEY =
  process.env.NEXT_PUBLIC_CIRCLE_KIT_KEY?.trim() || PLACEHOLDER_KEY;

export function isCircleKitConfigured(): boolean {
  // True whenever the SDK has something usable. The actual auth is the
  // proxy's responsibility — we don't know server env from the browser.
  return KIT_KEY.length > 0;
}

let kitInstance: AppKit | null = null;
export function getKit(): AppKit {
  if (!kitInstance) {
    installCircleFetchPatch();
    kitInstance = new AppKit();
  }
  return kitInstance;
}

// Install eagerly on module load so the patch is in place BEFORE any
// transitive import of Circle SDK might call fetch during its own init.
if (typeof window !== 'undefined') {
  installCircleFetchPatch();
}

interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

export async function makeViemAdapter(provider: EIP1193Provider) {
  return createViemAdapterFromProvider({ provider: provider as never });
}

// ---------------------------------------------------------------------------
// Browser fetch patch — redirect Circle host calls to the Next.js proxy.
// ---------------------------------------------------------------------------

const CIRCLE_HOST_PREFIX_MAP: Array<[RegExp, string]> = [
  [/^https:\/\/api\.circle\.com\//, '/api/circle/api/'],
  [/^https:\/\/iris-api\.circle\.com\//, '/api/circle/iris-api/'],
  [/^https:\/\/gateway-api\.circle\.com\//, '/api/circle/gateway-api/'],
];

function rewriteCircleUrl(url: string): string {
  for (const [pattern, replacement] of CIRCLE_HOST_PREFIX_MAP) {
    if (pattern.test(url)) return url.replace(pattern, replacement);
  }
  return url;
}

function installCircleFetchPatch(): void {
  if (typeof window === 'undefined') return;
  const g = globalThis as unknown as { __liftupCircleFetchPatched?: boolean };
  if (g.__liftupCircleFetchPatched) return;
  g.__liftupCircleFetchPatched = true;
  console.info('[liftup] Circle fetch patch installed');

  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    try {
      let urlStr: string;
      if (typeof input === 'string') urlStr = input;
      else if (input instanceof URL) urlStr = input.toString();
      else urlStr = input.url;

      const rewritten = rewriteCircleUrl(urlStr);
      if (rewritten === urlStr) return originalFetch(input, init);

      console.info('[liftup] rewriting fetch', urlStr, '->', rewritten);

      // Same-origin rewrite — build a fresh Request preserving headers/body.
      if (typeof input === 'string' || input instanceof URL) {
        return originalFetch(rewritten, init);
      }
      const cloned = new Request(rewritten, input);
      return originalFetch(cloned, init);
    } catch (err) {
      console.warn('[liftup] Circle fetch patch failed, passing through', err);
      return originalFetch(input, init);
    }
  };
}
