'use client';

import { Container } from '@/components/common/Container';
import { SectionHeader } from './ContractsTable';
import { CodeBlock } from './CodeBlock';

const READ_RESERVES = `// Read live reserves from a LiftupPair (viem)
import { createPublicClient, http } from 'viem';

const client = createPublicClient({
  chain: { id: 5042002, name: 'Arc Testnet' },
  transport: http('https://rpc.testnet.arc.network'),
});

const reserves = await client.readContract({
  address: '0xc36B6B7f9F35A145E2E34c9452E99E57379aEBfF', // USDC/EURC pair
  abi: [{
    type: 'function',
    name: 'getReserves',
    inputs: [],
    outputs: [
      { name: 'reserve0', type: 'uint112' },
      { name: 'reserve1', type: 'uint112' },
      { name: 'blockTimestampLast', type: 'uint32' },
    ],
    stateMutability: 'view',
  }],
  functionName: 'getReserves',
});`;

const QUOTE_VIA_ROUTER = `// Quote a swap using LiftupRouter (recommended over manual math)
const amountOut = await client.readContract({
  address: '0x9bAca4056C278bA4f45bDd80B539322a1238c240', // Router
  abi: [{
    type: 'function',
    name: 'getAmountOut',
    inputs: [
      { name: 'amountIn',  type: 'uint256' },
      { name: 'tokenIn',   type: 'address' },
      { name: 'tokenOut',  type: 'address' },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'view',
  }],
  functionName: 'getAmountOut',
  args: [
    1_000_000n,                                    // 1 USDC (6 decimals)
    '0x3600000000000000000000000000000000000000', // USDC
    '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a', // EURC
  ],
});`;

const EXECUTE_SWAP = `// Execute a swap (user must have approved Router to spend tokenIn)
import { encodeFunctionData } from 'viem';

const data = encodeFunctionData({
  abi: [{
    type: 'function',
    name: 'swapExactTokensForTokens',
    inputs: [
      { name: 'amountIn',     type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path',         type: 'address[]' },
      { name: 'to',           type: 'address' },
      { name: 'deadline',     type: 'uint256' },
    ],
    outputs: [{ type: 'uint256[]' }],
    stateMutability: 'nonpayable',
  }],
  functionName: 'swapExactTokensForTokens',
  args: [
    1_000_000n,                                              // amountIn
    quotedOut * 9950n / 10000n,                              // 0.5% slippage
    [USDC, EURC],                                            // path
    userAddress,                                             // recipient
    BigInt(Math.floor(Date.now() / 1000) + 600),             // 10-min deadline
  ],
});

await wallet.sendTransaction({ to: '0x9bAca…', data });`;

const SUBGRAPH_EVENTS = `// Standard V2 events emitted by LiftupPair
event Swap(
  address indexed sender,
  uint256 amount0In,
  uint256 amount1In,
  uint256 amount0Out,
  uint256 amount1Out,
  address indexed to
);
event Mint(address indexed sender, uint256 amount0, uint256 amount1);
event Burn(
  address indexed sender,
  uint256 amount0,
  uint256 amount1,
  address indexed to
);
event Sync(uint112 reserve0, uint112 reserve1);
event Transfer(address indexed from, address indexed to, uint256 value);

// Bonus: LiftupRewardDistributor's Distributed event for indexing winners
event Distributed(
  bytes32 indexed bucket,    // "daily" / "weekly" / "monthly" / "bonus"
  address indexed token,
  address indexed recipient,
  uint256 amount
);`;

export function SampleCode() {
  return (
    <section id="sample-code" className="relative py-16">
      <Container className="max-w-5xl">
        <SectionHeader
          eyebrow="Sample code"
          title={
            <>
              Wire it in <span className="text-gradient-lift">today</span>.
            </>
          }
          sub="TypeScript + viem snippets. The router exposes the same surface as Uniswap V2 — drop addresses in and ship."
        />

        <div className="mt-10 grid gap-6">
          <CodeBlock language="ts" label="1. Read pool reserves">{READ_RESERVES}</CodeBlock>
          <CodeBlock language="ts" label="2. Quote via router (recommended)">{QUOTE_VIA_ROUTER}</CodeBlock>
          <CodeBlock language="ts" label="3. Execute a swap">{EXECUTE_SWAP}</CodeBlock>
          <CodeBlock language="solidity" label="4. Events for your indexer / subgraph">{SUBGRAPH_EVENTS}</CodeBlock>
        </div>
      </Container>
    </section>
  );
}
