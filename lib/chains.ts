import { defineChain } from 'viem';
import type { AppKitNetwork } from '@reown/appkit/networks';

/**
 * Arc Testnet — stablecoin-native L1; USDC is the native gas token.
 * https://docs.arc.network · https://chainlist.org/chain/5042002
 *
 * IMPORTANT: AppKit requires `chainNamespace` + `caipNetworkId` on every
 * network. Without them Reown's `switchNetwork` silently fails because it
 * cannot resolve the chain inside its own registry.
 */
const arcTestnetBase = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  // Arc internally uses wei-style 18-decimal native units even though USDC's
  // ERC-20 wrapper is 6 decimals. Matching arcapis (the working reference)
  // — wallet_addEthereumChain expects decimals=18 for proper balance display.
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: 'https://testnet.arcscan.app',
    },
  },
  testnet: true,
});

export const arcTestnet = {
  ...arcTestnetBase,
  chainNamespace: 'eip155',
  caipNetworkId: `eip155:${arcTestnetBase.id}`,
} as const satisfies AppKitNetwork;

export const ARC_FAUCET_URL = 'https://faucet.circle.com';
