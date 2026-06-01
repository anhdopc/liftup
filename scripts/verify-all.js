// Verify every deployed contract on ArcScan in one shot.
//
//   pnpm verify:all
//
// Reads addresses from public/arc-contracts.json and submits each
// contract to ArcScan's BlockScout verification API. The factory's
// constructor takes `feeToSetter` (deployer), the router takes the
// factory address, the distributor takes (owner, growthWallet) — all
// recovered from arc-contracts.json or sane defaults.
//
// The USDC/EURC pair is created via factory.createPair() so its
// bytecode + constructor args (token0, token1) are deterministic from
// the factory. We verify it too — ArcScan resolves to the LiftupPair
// source automatically since the factory deploys with `new LiftupPair`.

const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function verifyOne(label, address, constructorArguments) {
  console.log(`→ ${label} @ ${address}`);
  try {
    await hre.run('verify:verify', {
      address,
      constructorArguments,
    });
    console.log(`  ✓ verified.`);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (
      msg.toLowerCase().includes('already verified') ||
      msg.toLowerCase().includes('smart-contract already verified')
    ) {
      console.log('  • already verified, skipping.');
    } else {
      console.warn(`  ! failed: ${msg.split('\n')[0]}`);
    }
  }
}

async function main() {
  const cfgPath = path.join(__dirname, '..', 'public', 'arc-contracts.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

  const factoryAddr = cfg.LiftupFactory;
  const routerAddr = cfg.LiftupRouter;
  const distAddr = cfg.LiftupRewardDistributor;
  const pairAddr = cfg.pairs && cfg.pairs['USDC/EURC'];

  // Derive the deployer address from the configured account (used as
  // feeToSetter on the factory + owner/growthWallet on the distributor).
  const [signer] = await hre.ethers.getSigners();
  const deployer = signer.address;

  console.log(`Network:  arcTestnet (chainId 5042002)`);
  console.log(`Deployer: ${deployer}\n`);

  await verifyOne('LiftupFactory', factoryAddr, [deployer]);
  await verifyOne('LiftupRouter', routerAddr, [factoryAddr]);
  await verifyOne('LiftupRewardDistributor', distAddr, [deployer, deployer]);

  // Pair constructor args = (token0, token1), sorted ascending.
  if (pairAddr) {
    const usdc = cfg.USDC;
    const eurc = cfg.EURC;
    const [token0, token1] =
      usdc.toLowerCase() < eurc.toLowerCase() ? [usdc, eurc] : [eurc, usdc];
    await verifyOne('LiftupPair (USDC/EURC)', pairAddr, [token0, token1]);
  }

  console.log('\nDone. Refresh the contracts on testnet.arcscan.app to see the verified source.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
