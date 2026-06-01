import type { Metadata } from 'next';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { BackgroundOrbs } from '@/components/magic/BackgroundOrbs';
import { BrandKit } from '@/components/features/brand/BrandKit';

export const metadata: Metadata = {
  title: 'Brand kit',
  description:
    'LiftUp brand kit — icon, logo lockup, color palette, and typography references for aggregators, press, and partners.',
};

export default function BrandPage() {
  return (
    <>
      <BackgroundOrbs />
      <Navbar />
      <main>
        <BrandKit />
      </main>
      <Footer />
    </>
  );
}
