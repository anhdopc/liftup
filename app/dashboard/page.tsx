import type { Metadata } from 'next';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { BackgroundOrbs } from '@/components/magic/BackgroundOrbs';
import { Container } from '@/components/common/Container';
import { DashboardClient } from '@/components/features/dashboard/DashboardClient';

export const metadata: Metadata = {
  title: 'Dashboard',
  description:
    'Your LiftUp wallet, LP positions, and recent on-chain activity on Arc Testnet.',
};

export default function DashboardPage() {
  return (
    <>
      <BackgroundOrbs />
      <Navbar />
      <main className="pt-28 pb-24">
        <Container>
          <div className="mb-6 px-1">
            <h1 className="font-display text-xl font-semibold tracking-tight">
              Dashboard
            </h1>
            <p className="text-xs text-ink-muted">
              Wallet · positions · recent swaps on Arc Testnet
            </p>
          </div>

          <DashboardClient />
        </Container>
      </main>
      <Footer />
    </>
  );
}
