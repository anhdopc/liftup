import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import type { AppKitNetwork } from '@reown/appkit/networks';
import { arbitrum, base, mainnet, optimism, polygon } from '@reown/appkit/networks';
import { cookieStorage, createStorage } from 'wagmi';
import { arcTestnet } from './chains';

export const projectId =
  process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || 'YOUR_REOWN_PROJECT_ID';

// Arc testnet first → it is the default selected chain in the wallet picker.
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [
  arcTestnet,
  mainnet,
  arbitrum,
  optimism,
  base,
  polygon,
];

export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  projectId,
  networks,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

const metadata = {
  name: 'LiftUp Money',
  description: 'Elevate your wealth — multi-chain DeFi for the next generation.',
  url: 'https://liftup.money',
  icons: ['https://liftup.money/icon.png'],
};

let appKitInstance: ReturnType<typeof createAppKit> | null = null;

export function initAppKit() {
  if (appKitInstance) return appKitInstance;
  appKitInstance = createAppKit({
    adapters: [wagmiAdapter],
    projectId,
    networks,
    defaultNetwork: arcTestnet,
    metadata,
    features: {
      analytics: false,
      email: false,
      socials: false,
    },
    themeMode: 'dark',
    themeVariables: {
      '--w3m-accent': '#22D3A4',
      '--w3m-color-mix': '#22D3A4',
      '--w3m-color-mix-strength': 20,
      '--w3m-border-radius-master': '4px',
      '--w3m-font-family': 'var(--font-sora), system-ui, sans-serif',
    },
  });
  return appKitInstance;
}
