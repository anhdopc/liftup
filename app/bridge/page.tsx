import type { Metadata } from 'next';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { BackgroundOrbs } from '@/components/magic/BackgroundOrbs';
import { Container } from '@/components/common/Container';
import { BridgeCard } from '@/components/features/bridge/BridgeCard';

export const metadata: Metadata = {
  title: 'Bridge',
  description:
    'Bridge USDC into and out of Arc Testnet using Circle CCTP (Cross-Chain Transfer Protocol).',
};

export default function BridgePage() {
  return (
    <>
      <BackgroundOrbs />
      <Navbar />
      <main className="pt-28 pb-24">
        <Container>
          <BridgeCard />
        </Container>
      </main>
      <Footer />
    </>
  );
}
