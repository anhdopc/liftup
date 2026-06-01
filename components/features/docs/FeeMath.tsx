'use client';

import { Container } from '@/components/common/Container';
import { SectionHeader } from './ContractsTable';
import { CodeBlock } from './CodeBlock';

const QUOTE_FORMULA = `// V2 swap math with LiftUp's 0.05% fee tier
const FEE_NUMERATOR = 9995n;       // 10000 - 5 (5 bps fee)
const FEE_DENOMINATOR = 10000n;

function getAmountOut(amountIn, reserveIn, reserveOut) {
  const amountInWithFee = amountIn * FEE_NUMERATOR;
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * FEE_DENOMINATOR + amountInWithFee;
  return numerator / denominator;
}`;

const PAIR_DERIVATION = `// LiftupFactory uses standard V2 CREATE2 with sorted-token salt.
import { keccak256, encodePacked, getCreate2Address } from 'viem';

function liftupPairAddress(factory, tokenA, tokenB, initCodeHash) {
  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase()
    ? [tokenA, tokenB]
    : [tokenB, tokenA];

  const salt = keccak256(
    encodePacked(['address', 'address'], [token0, token1])
  );
  return getCreate2Address({ from: factory, salt, bytecodeHash: initCodeHash });
}

// initCodeHash for LiftupPair: keccak256(LiftupPair_creationCode + abi.encode(token0, token1))
// available via factory.allPairs(i) iteration or precomputed off-chain.`;

export function FeeMath() {
  return (
    <section id="fee-math" className="relative py-16">
      <Container className="max-w-5xl">
        <SectionHeader
          eyebrow="Fee math"
          title={
            <>
              Standard V2 formula, <span className="text-gradient-lift">5 bps fee tier</span>
            </>
          }
          sub="The K-invariant is unchanged from Uniswap V2 — only the numerator/denominator differ. Plug the constants below into your existing V2 quote helper and LiftUp slots in."
        />

        <div className="mt-10 grid gap-6 lg:grid-cols-[3fr_2fr]">
          <CodeBlock language="ts" label="getAmountOut">{QUOTE_FORMULA}</CodeBlock>

          <div className="space-y-4">
            <FactRow
              label="Fee tier"
              value="0.05%"
              sub="5 basis points, matches Aerodrome / Velodrome stable tier"
            />
            <FactRow
              label="FEE_NUMERATOR"
              value="9995"
              sub="amount in × (10000 − 5) / 10000 = amount after fee"
              mono
            />
            <FactRow
              label="FEE_DENOMINATOR"
              value="10000"
              sub="basis-points base"
              mono
            />
            <div className="rounded-2xl border border-gold-500/30 bg-gold-500/[0.04] px-4 py-3 text-xs text-gold-300">
              <p className="font-medium text-gold-500">Heads up</p>
              <p className="mt-1 text-ink-muted">
                LiftupPair transfers 100% of the fee out of the pool to{' '}
                <span className="text-ink">factory.feeTo()</span> on every
                swap. K stays constant after the swap (instead of growing
                like vanilla V2). If your aggregator monitors K-growth as
                a sanity check, treat LiftUp as a special source where
                K-growth equals zero.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10">
          <h3 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-gold-500">
            Pair address derivation
          </h3>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Standard V2 CREATE2. Sort tokens ascending, hash as the salt,
            combine with the factory address and{' '}
            <span className="font-mono">LiftupPair</span> init-code hash.
          </p>
          <div className="mt-4">
            <CodeBlock language="ts" label="liftupPairAddress">{PAIR_DERIVATION}</CodeBlock>
          </div>
        </div>
      </Container>
    </section>
  );
}

function FactRow({
  label,
  value,
  sub,
  mono,
}: {
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-bg-surface/40 px-4 py-3 backdrop-blur">
      <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle">{label}</div>
      <div
        className={`mt-1 font-display text-2xl font-semibold tracking-tight text-ink ${
          mono ? 'font-mono' : ''
        }`}
      >
        {value}
      </div>
      {sub && <p className="mt-1 text-[11px] text-ink-muted">{sub}</p>}
    </div>
  );
}
