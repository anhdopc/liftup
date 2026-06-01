import type { Metadata, Viewport } from 'next';
import { Inter, Sora } from 'next/font/google';
import { headers } from 'next/headers';
import { cookieToInitialState } from 'wagmi';
import { wagmiConfig } from '@/lib/appKit';
import { Providers } from '@/components/layout/Providers';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://liftup.money'),
  title: {
    default: 'LiftUp Money — Elevate Your Wealth',
    template: '%s · LiftUp Money',
  },
  description:
    'A multi-chain DeFi platform built to elevate your wealth. Swap, bridge, earn, and lift your assets higher.',
  keywords: ['DeFi', 'crypto', 'swap', 'bridge', 'liquidity', 'yield', 'LiftUp Money'],
  openGraph: {
    title: 'LiftUp Money — Elevate Your Wealth',
    description: 'A multi-chain DeFi platform built to elevate your wealth.',
    url: 'https://liftup.money',
    siteName: 'LiftUp Money',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LiftUp Money',
    description: 'Elevate Your Wealth.',
  },
  icons: {
    icon: '/assets/favicon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#070B14',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const initialState = cookieToInitialState(wagmiConfig, headers().get('cookie'));

  return (
    <html lang="en" className={`${inter.variable} ${sora.variable}`}>
      <body className="min-h-screen antialiased">
        <Providers initialState={initialState}>{children}</Providers>
      </body>
    </html>
  );
}
