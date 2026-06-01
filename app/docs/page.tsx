import type { Metadata } from 'next';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { BackgroundOrbs } from '@/components/magic/BackgroundOrbs';
import { DocsHero } from '@/components/features/docs/DocsHero';
import { ContractsTable } from '@/components/features/docs/ContractsTable';
import { LiftEngineSpec } from '@/components/features/docs/LiftEngineSpec';
import { FeeMath } from '@/components/features/docs/FeeMath';
import { SampleCode } from '@/components/features/docs/SampleCode';
import { PartnerCTA } from '@/components/features/docs/PartnerCTA';

export const metadata: Metadata = {
  title: 'Docs — Integrate LiftUp',
  description:
    'Integrator docs for LiftUp — Uniswap V2-compatible stablecoin liquidity layer on Arc with USDC/EURC/cirBTC pairs, CCTP-native bridge, and 0.05% LP fee. Contract addresses, fee math, and TypeScript samples.',
};

export default function DocsPage() {
  return (
    <>
      <BackgroundOrbs />
      <Navbar />
      <main>
        <DocsHero />
        <ContractsTable />
        <LiftEngineSpec />
        <FeeMath />
        <SampleCode />
        <PartnerCTA />
      </main>
      <Footer />
    </>
  );
}
