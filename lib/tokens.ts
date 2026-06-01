/**
 * Tokens verified on Arc Testnet. Stablecoin-first pair set.
 *
 * USDC is the native gas token on Arc and also has a 6-decimal ERC-20
 * wrapper at a fixed precompile address (used for router calls). EURC is
 * Circle's euro stablecoin at a fixed deployed address.
 *
 *   USDC  https://docs.arc.io/arc/references/contract-addresses
 *   EURC  https://docs.arc.io/arc/references/contract-addresses
 *
 * Add new stables here as Circle launches them on Arc — every entry should
 * map to a real on-chain contract; no placeholders.
 */
import { getAddress } from 'viem';

export interface Token {
  symbol: string;
  name: string;
  decimals: number;
  /** ERC-20 contract address. Omitted for the native asset's "view from native". */
  address?: `0x${string}`;
  /** ERC-20 wrapper address for the native asset (used for router calls). */
  wrappedAddress?: `0x${string}`;
  /** True when this is the chain's native gas token. */
  native?: boolean;
  /** Path to the logo SVG/PNG under `public/`. Falls back to gradient if missing. */
  logo?: string;
  /** Gradient used as a fallback "skeleton" logo when `logo` is missing. */
  gradient: [string, string];
  /** Reference USD price for visual quotes. Replaced by an on-chain oracle in Phase 3. */
  priceUsd: number;
}

// Native gas token on Arc — read balance via wagmi's useBalance (18-decimal wei-style).
// Every address goes through viem.getAddress() so it satisfies viem ≥ 2.31's
// strict EIP-55 checksum validation inside writeContract.
export const USDC_ON_ARC: `0x${string}` = getAddress(
  '0x3600000000000000000000000000000000000000',
);

// EURC on Arc Testnet — 6-decimal ERC-20. Source: docs.arc.io/arc/references/contract-addresses
export const EURC_ON_ARC: `0x${string}` = getAddress(
  '0x89b50855aa3be2f677cd6303cec089b5f319d72a',
);

// cirBTC ("Circle Wrapped Bitcoin") on Arc Testnet — 8-decimal ERC-20.
// Source: Circle faucet (https://faucet.circle.com) + on-chain verified
// via testnet.arcscan.app/token/0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF.
// LiftUp has no native LP for cirBTC pairs yet, so swap routing falls
// through to Circle App Kit (see PoolRow's deployed=false handling).
export const CIRBTC_ON_ARC: `0x${string}` = getAddress(
  '0xf0c4a4ce82a5746abaad9425360ab04fbba432bf',
);

export const ARC_TOKENS: Token[] = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 18, // native unit on Arc is 18-decimal
    native: true,
    wrappedAddress: USDC_ON_ARC,
    logo: '/assets/tokens/usdc.png',
    gradient: ['#2775CA', '#5BAAFF'],
    priceUsd: 1,
  },
  {
    symbol: 'EURC',
    name: 'Euro Coin',
    decimals: 6,
    address: EURC_ON_ARC,
    logo: '/assets/tokens/eurc.png',
    gradient: ['#2775CA', '#5BAAFF'],
    // Reference EUR/USD rate — replace with on-chain oracle in Phase 3.
    priceUsd: 1.08,
  },
  {
    symbol: 'cirBTC',
    name: 'Circle Wrapped Bitcoin',
    decimals: 8, // verified on-chain at 0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF
    address: CIRBTC_ON_ARC,
    logo: '/assets/tokens/cirbtc.png',
    gradient: ['#3FA9F5', '#8B5CF6'],
    // Rough BTC reference price — used only for UI ≈ $X labels; the real
    // quote always comes from Circle App Kit's live estimateSwap.
    priceUsd: 70000,
  },
];

export function findToken(symbol: string): Token | undefined {
  return ARC_TOKENS.find((t) => t.symbol === symbol);
}

/** A token is "deployed" if it has a non-zero contract address (or is native). */
export function isTokenDeployed(token: Token): boolean {
  if (token.native) return true;
  if (!token.address) return false;
  return token.address.toLowerCase() !== '0x0000000000000000000000000000000000000000';
}
