/**
 * Server-side proxy for Circle App Kit HTTP calls.
 *
 * Circle's API does not enable CORS for browser origins, so the SDK's
 * direct fetches fail. This proxy gives the SDK a same-origin endpoint and
 * also replaces the inbound `Authorization` header with the real Kit Key
 * read from `CIRCLE_KIT_KEY` (server-only env) — the key never enters the
 * client bundle.
 *
 * URL shape:
 *   /api/circle/api/v1/stablecoinKits/swap        -> https://api.circle.com/v1/stablecoinKits/swap
 *   /api/circle/iris-api/v2/messages/...          -> https://iris-api.circle.com/v2/messages/...
 *   /api/circle/gateway-api/...                   -> https://gateway-api.circle.com/...
 *
 * Add a new host below if Circle starts using a different base URL.
 */
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_HOSTS = {
  api: 'https://api.circle.com',
  'iris-api': 'https://iris-api.circle.com',
  'gateway-api': 'https://gateway-api.circle.com',
} as const;

type Params = { params: { host: string; rest?: string[] } };

async function proxy(req: NextRequest, { params }: Params) {
  const base = ALLOWED_HOSTS[params.host as keyof typeof ALLOWED_HOSTS];
  if (!base) {
    return new Response(JSON.stringify({ error: `Unknown host: ${params.host}` }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }

  const path = (params.rest ?? []).join('/');
  const url = new URL(req.url);
  const target = `${base}/${path}${url.search}`;

  const headers = new Headers(req.headers);
  // Strip values that would confuse the upstream.
  headers.delete('host');
  headers.delete('origin');
  headers.delete('referer');
  headers.delete('cookie');
  headers.delete('content-length');
  // Identify the proxy in upstream logs (Circle can see who's calling).
  headers.set('x-forwarded-by', 'liftup-money');

  // Inject the real Kit Key from a server-only env. The client SDK can
  // pass a placeholder (just to satisfy its format check); the proxy
  // overrides it so the real key never lives in the browser bundle.
  const serverKitKey = process.env.CIRCLE_KIT_KEY;
  if (serverKitKey) {
    headers.set('Authorization', `Bearer ${serverKitKey}`);
  }

  let body: BodyInit | undefined;
  if (!['GET', 'HEAD'].includes(req.method)) {
    body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      // duplex needed in some Node versions when forwarding a stream/body
      // @ts-expect-error — node fetch types lag the spec.
      duplex: 'half',
    });
  } catch (err) {
    console.error('[circle-proxy] upstream fetch failed', { target, err });
    return new Response(
      JSON.stringify({ error: 'Upstream fetch failed', detail: String(err) }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }

  const responseHeaders = new Headers(upstream.headers);
  // Browser hits this endpoint same-origin — no upstream CORS headers needed.
  responseHeaders.delete('access-control-allow-origin');
  responseHeaders.delete('access-control-allow-credentials');
  responseHeaders.delete('access-control-allow-methods');
  responseHeaders.delete('access-control-allow-headers');
  responseHeaders.delete('access-control-expose-headers');
  // Node fetch auto-decompresses the body; if we forward the original
  // encoding/length headers, the browser tries to decode a plain payload
  // as gzip/br and fails with ERR_CONTENT_DECODING_FAILED. Drop the
  // hop-by-hop / encoding headers and let the runtime set them fresh.
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  responseHeaders.delete('transfer-encoding');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
