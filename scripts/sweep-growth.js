// Sweep growth + bonus buckets into the growth wallet.
//
//   pnpm reward:sweep            # dry run, prints what would move
//   EXECUTE=1 pnpm reward:sweep  # actually withdraw + sweep
//
// Why this exists
//   The RewardDistributor allocates 10% to growth and 4.5% to bonus
//   (constants in the contract — can't be changed). For now there is
//   no scheduled bonus program, so the bonus bucket is treated as
//   additional growth funding. This script:
//
//     1. settle(USDC) + settle(EURC) so any unsettled inflow lands
//     2. withdrawGrowth(token, growth_balance) → growthWallet
//     3. distributeBonus(token, [growthWallet], [bonus_balance])
//        → growthWallet  (uses the distribute path because bonus
//        doesn't have its own withdraw; sending to a single recipient
//        is the cleanest existing primitive)
//
//   Both happen for USDC and EURC. The growthWallet is read live from
//   the contract (so setGrowthWallet() updates are honoured).
//
// Idempotent: if growth + bonus are both zero, the script no-ops.

const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

const TOKEN_DECIMALS = 6;

const DISTRIBUTOR_ABI = [
  'function settle(address token) external',
  'function growthWallet() external view returns (address)',
  'function getBuckets(address token) external view returns (uint256 growth_, uint256 dailyToday_, uint256 dailyYesterday_, uint256 weekly_, uint256 monthly_, uint256 bonus_, uint256 unsettled_)',
  'function withdrawGrowth(address token, uint256 amount) external',
  'function distributeBonus(address token, address[] winners, uint256[] amounts) external',
];

async function main() {
  const cfgPath = path.join(__dirname, '..', 'public', 'arc-contracts.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

  const distAddr = cfg.LiftupRewardDistributor;
  const usdcAddr = cfg.USDC;
  const eurcAddr = cfg.EURC;
  if (!distAddr || !usdcAddr || !eurcAddr) {
    throw new Error('arc-contracts.json missing distributor / USDC / EURC');
  }

  const execute = process.env.EXECUTE === '1';
  const [signer] = await hre.ethers.getSigners();
  const dist = new hre.ethers.Contract(distAddr, DISTRIBUTOR_ABI, signer);

  console.log('Signer:        ', signer.address);
  console.log('Distributor:   ', distAddr);
  console.log('Mode:          ', execute ? 'EXECUTE (will send tx)' : 'DRY RUN');
  console.log();

  const growthWallet = await dist.growthWallet();
  console.log('Growth wallet: ', growthWallet);
  console.log();

  // 1. Settle so any pending inflow lands in the right bucket.
  console.log('→ Settling USDC + EURC…');
  if (execute) {
    await (await dist.settle(usdcAddr)).wait();
    await (await dist.settle(eurcAddr)).wait();
    console.log('  done.\n');
  } else {
    console.log('  (skipped in dry run — would call settle on both tokens)\n');
  }

  const usdcBuckets = await dist.getBuckets(usdcAddr);
  const eurcBuckets = await dist.getBuckets(eurcAddr);

  const usdcGrowth = usdcBuckets[0];
  const usdcBonus = usdcBuckets[5];
  const eurcGrowth = eurcBuckets[0];
  const eurcBonus = eurcBuckets[5];

  console.log('Current buckets:');
  console.log(`  USDC growth:  ${fmt(usdcGrowth)}`);
  console.log(`  USDC bonus:   ${fmt(usdcBonus)}`);
  console.log(`  EURC growth:  ${fmt(eurcGrowth)}`);
  console.log(`  EURC bonus:   ${fmt(eurcBonus)}`);
  const totalUsdc = usdcGrowth + usdcBonus;
  const totalEurc = eurcGrowth + eurcBonus;
  console.log(`\nWill move to growthWallet:`);
  console.log(`  ${fmt(totalUsdc)} USDC  (growth ${fmt(usdcGrowth)} + bonus ${fmt(usdcBonus)})`);
  console.log(`  ${fmt(totalEurc)} EURC  (growth ${fmt(eurcGrowth)} + bonus ${fmt(eurcBonus)})`);

  if (totalUsdc === 0n && totalEurc === 0n) {
    console.log('\nNothing to sweep.');
    return;
  }

  if (!execute) {
    console.log('\n(DRY RUN — pass EXECUTE=1 to send the tx.)');
    return;
  }

  console.log('\n→ Sending transfers …');

  // Pull growth via the dedicated path.
  if (usdcGrowth > 0n) {
    const tx = await dist.withdrawGrowth(usdcAddr, usdcGrowth);
    const r = await tx.wait();
    console.log(`  ✓ USDC growth ${fmt(usdcGrowth)} → growthWallet · ${r.hash}`);
  }
  if (eurcGrowth > 0n) {
    const tx = await dist.withdrawGrowth(eurcAddr, eurcGrowth);
    const r = await tx.wait();
    console.log(`  ✓ EURC growth ${fmt(eurcGrowth)} → growthWallet · ${r.hash}`);
  }

  // Sweep bonus to growthWallet by passing it as the only recipient of
  // distributeBonus. Cleaner than touching distribution-path code paths
  // — the contract already validates the bucket has enough balance.
  if (usdcBonus > 0n) {
    const tx = await dist.distributeBonus(usdcAddr, [growthWallet], [usdcBonus]);
    const r = await tx.wait();
    console.log(`  ✓ USDC bonus  ${fmt(usdcBonus)} → growthWallet · ${r.hash}`);
  }
  if (eurcBonus > 0n) {
    const tx = await dist.distributeBonus(eurcAddr, [growthWallet], [eurcBonus]);
    const r = await tx.wait();
    console.log(`  ✓ EURC bonus  ${fmt(eurcBonus)} → growthWallet · ${r.hash}`);
  }

  console.log('\n✓ Sweep complete.');
}

function fmt(v) {
  return hre.ethers.formatUnits(v, TOKEN_DECIMALS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
