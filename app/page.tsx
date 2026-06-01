import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { BackgroundOrbs } from '@/components/magic/BackgroundOrbs';
import { Hero } from '@/components/features/Hero';
import { TrustBar } from '@/components/features/TrustBar';
import { FeatureGrid } from '@/components/features/FeatureGrid';
import { WhyLPs } from '@/components/features/WhyLPs';
import { EarnRealYield } from '@/components/features/EarnRealYield';
import { HowItWorks } from '@/components/features/HowItWorks';
import { CommunityStats } from '@/components/liquidity/CommunityStats';
import { DrawCountdowns } from '@/components/liquidity/DrawCountdowns';
import { CTA } from '@/components/features/CTA';

export default function Home() {
  return (
    <>
      <BackgroundOrbs />
      <Navbar />
      <main>
        <Hero />
        <DrawCountdowns />
        <CommunityStats />
        <TrustBar />
        <FeatureGrid />
        <WhyLPs />
        <EarnRealYield />
        <HowItWorks />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
