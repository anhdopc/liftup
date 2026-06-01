import type { Metadata } from 'next';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { BackgroundOrbs } from '@/components/magic/BackgroundOrbs';
import { Container } from '@/components/common/Container';
import { SwapCard } from '@/components/features/swap/SwapCard';

export const metadata: Metadata = {
  title: 'Swap',
  description: 'Swap tokens on Arc Testnet with LiftUp Money — USDC-native gas, sub-second finality.',
};

export default function SwapPage() {
  return (
    <>
      <BackgroundOrbs />
      <Navbar />
      <main className="pt-28 pb-24">
        <Container>
          <SwapCard />
        </Container>
      </main>
      <Footer />
    </>
  );
}
