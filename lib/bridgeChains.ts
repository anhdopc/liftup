/**
 * Curated set of chains LiftUp surfaces in the /bridge UI. Each entry maps
 * the Circle BridgeKit `BridgeChain` enum to display data the UI needs.
 *
 * Only EVM testnets are included for now — these are the routes Arc
 * Testnet currently supports via CCTP. Add a mainnet section here when
 * Arc launches mainnet bridging.
 */
import { BridgeChain } from '@circle-fin/bridge-kit';

export interface BridgeChainInfo {
  bridgeChain: BridgeChain;
  /** Display name. */
  name: string;
  /** Short label for UI chips. */
  short: string;
  /** EIP-155 chain id used by wagmi/MetaMask. */
  chainId: number;
  /** Path under `public/` to the chain logo. Falls back to gradient. */
  logo?: string;
  /** Gradient fallback for the chain logo placeholder. */
  gradient: [string, string];
  /** True when this is Arc Testnet (we treat it specially in copy). */
  isArc?: boolean;
}

export const BRIDGE_CHAINS: BridgeChainInfo[] = [
  {
    bridgeChain: BridgeChain.Arc_Testnet,
    name: 'Arc Testnet',
    short: 'Arc',
    chainId: 5042002,
    logo: '/assets/chains/arc.png',
    gradient: ['#22D3A4', '#7B61FF'],
    isArc: true,
  },
  {
    bridgeChain: BridgeChain.Ethereum_Sepolia,
    name: 'Ethereum Sepolia',
    short: 'Sepolia',
    chainId: 11_155_111,
    logo: '/assets/chains/ethereum.png',
    gradient: ['#627EEA', '#8C8DD4'],
  },
  {
    bridgeChain: BridgeChain.Base_Sepolia,
    name: 'Base Sepolia',
    short: 'Base',
    chainId: 84_532,
    logo: '/assets/chains/base.jpeg',
    gradient: ['#0052FF', '#4F88FF'],
  },
  {
    bridgeChain: BridgeChain.Arbitrum_Sepolia,
    name: 'Arbitrum Sepolia',
    short: 'Arbitrum',
    chainId: 421_614,
    logo: '/assets/chains/arbitrum.png',
    gradient: ['#28A0F0', '#7BC8FF'],
  },
  {
    bridgeChain: BridgeChain.Avalanche_Fuji,
    name: 'Avalanche Fuji',
    short: 'Avalanche',
    chainId: 43_113,
    logo: '/assets/chains/avalanche.jpeg',
    gradient: ['#E84142', '#FF7B7C'],
  },
  {
    bridgeChain: BridgeChain.Linea_Sepolia,
    name: 'Linea Sepolia',
    short: 'Linea',
    chainId: 59_141,
    logo: '/assets/chains/linea.png',
    gradient: ['#121212', '#3D3D3D'],
  },
];
