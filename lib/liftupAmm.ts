/**
 * LiftUp's own Uniswap-V2-style AMM on Arc Testnet.
 *
 * Phase 2 deployment — LP fee is now 0.05% and 100% of every swap fee
 * skims to the RewardDistributor (factory.feeTo) instead of compounding
 * back into the pool. If contracts are redeployed, update these here
 * AND in public/arc-contracts.json (which is the source of truth the
 * deploy script writes).
 */

// Pass every address through viem.getAddress() at module load. viem 2.31
// rejects both mixed-case-with-wrong-checksum AND all-lowercase inputs
// inside writeContract — only canonical EIP-55 strings pass validation.
// getAddress() normalises whatever we give it into that canonical form.
import { getAddress } from 'viem';

export const LIFTUP_FACTORY: `0x${string}` = getAddress(
  '0xAA0515809191F1BBFcD6F4f4F52Aa4D0a120F7fB',
);
export const LIFTUP_ROUTER: `0x${string}` = getAddress(
  '0x9bAca4056C278bA4f45bDd80B539322a1238c240',
);
export const LIFTUP_REWARD_DISTRIBUTOR: `0x${string}` = getAddress(
  '0x1300c7F9F204Cf6F55192B809bD6F667acf80497',
);
export const LIFTUP_PAIR_USDC_EURC: `0x${string}` = getAddress(
  '0xc36B6B7f9F35A145E2E34c9452E99E57379aEBfF',
);
export const LIFTUP_PAIR_USDC_CIRBTC: `0x${string}` = getAddress(
  '0x5A15E9bcF7f18B4A0F93739d9C9035c4D6Bfa9C5',
);
export const LIFTUP_PAIR_EURC_CIRBTC: `0x${string}` = getAddress(
  '0xd86D2d75e5b21727F585b4CDdF631d6b9A4655f5',
);

export const ZERO_ADDRESS: `0x${string}` =
  '0x0000000000000000000000000000000000000000';

export function isLiftupAmmDeployed(): boolean {
  return LIFTUP_ROUTER !== ZERO_ADDRESS;
}

// ---------------------------------------------------------------------------
// Minimal ABIs — only the methods the frontend talks to.
// ---------------------------------------------------------------------------

export const liftupRouterAbi = [
  {
    type: 'function',
    name: 'factory',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAmountOut',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAmountIn',
    inputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
    ],
    outputs: [{ name: 'amountIn', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPairInfo',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
    ],
    outputs: [
      { name: 'pair', type: 'address' },
      { name: 'reserveA', type: 'uint256' },
      { name: 'reserveB', type: 'uint256' },
      { name: 'totalSupply', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'swapExactTokensForTokens',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'addLiquidity',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'amountADesired', type: 'uint256' },
      { name: 'amountBDesired', type: 'uint256' },
      { name: 'amountAMin', type: 'uint256' },
      { name: 'amountBMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [
      { name: 'amountA', type: 'uint256' },
      { name: 'amountB', type: 'uint256' },
      { name: 'liquidity', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'removeLiquidity',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'liquidity', type: 'uint256' },
      { name: 'amountAMin', type: 'uint256' },
      { name: 'amountBMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [
      { name: 'amountA', type: 'uint256' },
      { name: 'amountB', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
] as const;

export const liftupPairAbi = [
  {
    type: 'function',
    name: 'getReserves',
    inputs: [],
    outputs: [
      { name: 'reserve0', type: 'uint112' },
      { name: 'reserve1', type: 'uint112' },
      { name: 'blockTimestampLast', type: 'uint32' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'token0',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'token1',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalSupply',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;
