// Deploys LiftUp's AMM + reward stack on Arc Testnet:
//
//   pnpm compile
//   pnpm deploy:pool
//
// Sequence:
//   1. Deploy LiftupFactory (feeToSetter = deployer)
//   2. Deploy LiftupRouter pointing at the factory
//   3. Deploy LiftupRewardDistributor (owner = deployer, growthWallet = deployer)
//   4. Set factory.feeTo = distributor so 100% of swap fees skim there
//   5. Create USDC <-> EURC pair via factory.createPair
//   6. Write all addresses to public/arc-contracts.json so the frontend
//      can read them at runtime without rebuild.
//
// After deploy, seed liquidity with `pnpm seed:pool`.

const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

const USDC_ON_ARC = '0x3600000000000000000000000000000000000000';
const EURC_ON_ARC = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();
  console.log('Network: ', network.name, 'chainId', network.chainId.toString());
  console.log('Deployer:', deployer.address);

  const bal = await hre.ethers.provider.getBalance(deployer.address);
  console.log('Balance: ', hre.ethers.formatUnits(bal, 18), 'USDC (native)\n');

  // 1) LiftupFactory
  console.log('→ Deploying LiftupFactory…');
  const Factory = await hre.ethers.getContractFactory('LiftupFactory');
  const factory = await Factory.deploy(deployer.address);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log('  LiftupFactory             =', factoryAddr);

  // 2) LiftupRouter
  console.log('\n→ Deploying LiftupRouter…');
  const Router = await hre.ethers.getContractFactory('LiftupRouter');
  const router = await Router.deploy(factoryAddr);
  await router.waitForDeployment();
  const routerAddr = await router.getAddress();
  console.log('  LiftupRouter              =', routerAddr);

  // 3) LiftupRewardDistributor — owner + growthWallet default to deployer.
  // Migrate to a multi-sig before mainnet via `distributor.setOwner(...)`.
  console.log('\n→ Deploying LiftupRewardDistributor…');
  const Distributor = await hre.ethers.getContractFactory('LiftupRewardDistributor');
  const distributor = await Distributor.deploy(deployer.address, deployer.address);
  await distributor.waitForDeployment();
  const distributorAddr = await distributor.getAddress();
  console.log('  LiftupRewardDistributor   =', distributorAddr);

  // 4) Wire factory.feeTo = distributor so every LiftupPair swap skims
  //    100% of the LP fee into the distributor.
  console.log('\n→ Wiring factory.feeTo = distributor…');
  const setFeeToTx = await factory.setFeeTo(distributorAddr);
  await setFeeToTx.wait();
  console.log('  feeTo set                 =', await factory.feeTo());

  // 5) Create USDC <-> EURC pair
  console.log('\n→ Creating USDC <-> EURC pair…');
  const tx = await factory.createPair(USDC_ON_ARC, EURC_ON_ARC);
  await tx.wait();
  const pairAddr = await factory.getPair(USDC_ON_ARC, EURC_ON_ARC);
  console.log('  Pair                      =', pairAddr);

  // 6) Persist for the frontend
  const out = {
    network: 'arc-testnet',
    chainId: Number(network.chainId),
    LiftupFactory: factoryAddr,
    LiftupRouter: routerAddr,
    LiftupRewardDistributor: distributorAddr,
    USDC: USDC_ON_ARC,
    EURC: EURC_ON_ARC,
    pairs: {
      'USDC/EURC': pairAddr,
    },
    feeToSetter: deployer.address,
    growthWallet: deployer.address,
    deployedAt: new Date().toISOString(),
  };
  const outPath = path.join(__dirname, '..', 'public', 'arc-contracts.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\n✓ Wrote ${outPath}\n`);

  console.log('Next steps:');
  console.log('  1. Copy the 4 addresses above into lib/liftupAmm.ts.');
  console.log('  2. `pnpm seed:pool` to add initial USDC + EURC liquidity.');
  console.log('  3. After swaps accumulate, `pnpm reward:distribute` to settle + payout.');
  console.log('  4. Before mainnet: migrate distributor ownership to a multi-sig:');
  console.log('       distributor.setOwner(<multisig>)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
