import type { Metadata } from 'next';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { BackgroundOrbs } from '@/components/magic/BackgroundOrbs';
import { Container } from '@/components/common/Container';
import { PoolsClient } from '@/components/features/pools/PoolsClient';

export const metadata: Metadata = {
  title: 'Pools',
  description:
    'Provide USDC + EURC liquidity to the LiftUp pool on Arc Testnet. Every 0.05% swap fee flows to the on-chain RewardDistributor for daily / weekly / monthly LP draws.',
};

export default function PoolsPage() {
  return (
    <>
      <BackgroundOrbs />
      <Navbar />
      <main className="pt-28 pb-24">
        <Container>
          <PoolsClient />
        </Container>
      </main>
      <Footer />
    </>
  );
}
