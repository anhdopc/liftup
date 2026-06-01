import type { Metadata } from 'next';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { BackgroundOrbs } from '@/components/magic/BackgroundOrbs';
import { LiquidityHero } from '@/components/liquidity/LiquidityHero';
import { FeeFlow } from '@/components/liquidity/FeeFlow';
import { RewardPools } from '@/components/liquidity/RewardPools';
import { LPLottery } from '@/components/liquidity/LPLottery';
import { LPTiers } from '@/components/liquidity/LPTiers';
import { AntiSybil } from '@/components/liquidity/AntiSybil';
import { RewardFAQ } from '@/components/liquidity/RewardFAQ';
import { TreasuryCard } from '@/components/liquidity/TreasuryCard';
import { DrawCountdowns } from '@/components/liquidity/DrawCountdowns';
import { CTA } from '@/components/features/CTA';

export const metadata: Metadata = {
  title: 'Reward — Where Liquidity Lifts Rewards',
  description:
    'LiftUp reward model: 100% of swap fees flow to a public on-chain RewardDistributor, 90% returns to swappers and LPs through daily, weekly and monthly loyalty-weighted reward draws.',
};

export default function RewardPage() {
  return (
    <>
      <BackgroundOrbs />
      <Navbar />
      <main>
        <LiquidityHero />
        <DrawCountdowns />
        <FeeFlow />
        <RewardPools />
        <LPLottery />
        <LPTiers />
        <AntiSybil />
        <TreasuryCard />
        <RewardFAQ />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
