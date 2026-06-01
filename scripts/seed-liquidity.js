// Seeds USDC + EURC liquidity into LiftupPair on Arc Testnet.
//
//   pnpm seed:pool                 # default 100 USDC + 98 EURC (1:0.98 ≈ Circle mid)
//   USDC_AMOUNT=50 EURC_AMOUNT=49 pnpm seed:pool   # custom amounts (keep ~0.98 ratio)
//
// IMPORTANT — only use this script for the FIRST seed of an empty pair.
// After MINIMUM_LIQUIDITY (1000 wei LP) is locked the pool ratio is
// pinned forever; subsequent addLiquidity matches the existing ratio
// regardless of what you pass. To re-anchor the price (e.g. after a
// full LP withdrawal), use `scripts/reseed-pool.js` which performs a
// dust-arb swap first, then adds at the target ratio.
//
// Sequence:
//   1. Read addresses from public/arc-contracts.json (populated by deploy:pool).
//   2. Approve LiftupRouter on USDC + EURC for the chosen amounts.
//   3. Call router.addLiquidity(USDC, EURC, ...) with 5% slippage tolerance.
//   4. Confirm the resulting LP balance for the deployer.
//
// USDC and EURC are both 6-decimal ERC-20 tokens on Arc Testnet, even
// though USDC's native unit is 18-decimal. The router only touches the
// ERC-20 surface so we work in 6-decimal land here.

const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

const TOKEN_DECIMALS = 6;
const SLIPPAGE_BPS = 500; // 5%

async function main() {
  const cfgPath = path.join(__dirname, '..', 'public', 'arc-contracts.json');
  if (!fs.existsSync(cfgPath)) {
    throw new Error(
      `Missing ${cfgPath}. Run 'pnpm deploy:pool' first so the addresses are recorded.`,
    );
  }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const router = cfg.LiftupRouter;
  const usdc = cfg.USDC;
  const eurc = cfg.EURC;
  if (!router || !usdc || !eurc) {
    throw new Error('arc-contracts.json is missing LiftupRouter / USDC / EURC.');
  }

  const usdcAmount = process.env.USDC_AMOUNT ?? '100';
  const eurcAmount = process.env.EURC_AMOUNT ?? '98';

  const [deployer] = await hre.ethers.getSigners();
  console.log('Deployer:', deployer.address);
  console.log('Seeding:', `${usdcAmount} USDC + ${eurcAmount} EURC`);

  const erc20Abi = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function balanceOf(address) external view returns (uint256)',
    'function decimals() external view returns (uint8)',
  ];
  const usdcContract = new hre.ethers.Contract(usdc, erc20Abi, deployer);
  const eurcContract = new hre.ethers.Contract(eurc, erc20Abi, deployer);

  const usdcWei = hre.ethers.parseUnits(usdcAmount, TOKEN_DECIMALS);
  const eurcWei = hre.ethers.parseUnits(eurcAmount, TOKEN_DECIMALS);

  // Sanity check balances.
  const usdcBal = await usdcContract.balanceOf(deployer.address);
  const eurcBal = await eurcContract.balanceOf(deployer.address);
  console.log(
    'Balances: ',
    hre.ethers.formatUnits(usdcBal, TOKEN_DECIMALS),
    'USDC,',
    hre.ethers.formatUnits(eurcBal, TOKEN_DECIMALS),
    'EURC',
  );
  if (usdcBal < usdcWei) throw new Error('Deployer has insufficient USDC.');
  if (eurcBal < eurcWei) throw new Error('Deployer has insufficient EURC.');

  console.log('\n→ Approving LiftupRouter on USDC…');
  await (await usdcContract.approve(router, usdcWei)).wait();
  console.log('  done.');

  console.log('→ Approving LiftupRouter on EURC…');
  await (await eurcContract.approve(router, eurcWei)).wait();
  console.log('  done.');

  console.log('\n→ Calling router.addLiquidity…');
  const Router = await hre.ethers.getContractAt('LiftupRouter', router, deployer);
  const minA = (usdcWei * BigInt(10_000 - SLIPPAGE_BPS)) / 10_000n;
  const minB = (eurcWei * BigInt(10_000 - SLIPPAGE_BPS)) / 10_000n;
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const tx = await Router.addLiquidity(
    usdc,
    eurc,
    usdcWei,
    eurcWei,
    minA,
    minB,
    deployer.address,
    deadline,
  );
  const rcpt = await tx.wait();
  console.log(`  done. tx ${rcpt.hash}`);

  // Read back final pool state.
  const pairInfo = await Router.getPairInfo(usdc, eurc);
  console.log('\n✓ Pool seeded.');
  console.log('  Pair:        ', pairInfo[0]);
  console.log('  Reserves:    ', hre.ethers.formatUnits(pairInfo[1], TOKEN_DECIMALS), 'USDC');
  console.log('               ', hre.ethers.formatUnits(pairInfo[2], TOKEN_DECIMALS), 'EURC');
  console.log('  LP supply:   ', pairInfo[3].toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
