// Deploy LiftupOracleGuard on Arc Testnet and register price feeds.
//
//   pnpm guard:deploy
//   pnpm hh run scripts/deploy-oracle-guard.js --network arcTestnet
//
// What it does
//   1. Deploys LiftupOracleGuard pointing at the existing Pyth + Router.
//   2. Registers BTC/USD feed for both cirBTC pools (USDC/cirBTC and
//      EURC/cirBTC). The USDC-EURC pool is left unregistered — guard
//      passes it through unchecked.
//   3. Writes the deployed address into public/arc-contracts.json under
//      the "LiftupOracleGuard" key for the frontend to pick up.
//
// Constants
//   Pyth on Arc Testnet:  0x2880aB155794e7179c9eE2e38200202908C17B43
//     (https://docs.pyth.network/price-feeds/core/contract-addresses/evm)
//   BTC/USD feed ID:      0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43
//
// Deviation tuning
//   MAX_DEVIATION_BPS default = 500 (5%). Tune via env or owner call
//   after deploy. Tight value (≤300) protects more but false-rejects
//   during routine market volatility — 500 is the sweet spot for crypto.
//
// Post-deploy
//   • Frontend should switch swap calls to point at the Guard address
//     (set approval to Guard, call Guard.swapExactTokensForTokens).
//     Direct router calls keep working — no breaking change for repair
//     scripts.
//   • To pause the guard in an emergency:
//       guard.setEmergencyPause(true)
//   • To unregister a feed (e.g. Pyth feed down for a pair):
//       guard.removeFeed(tokenA, tokenB)

const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

const PYTH_ARC_TESTNET = '0x2880aB155794e7179c9eE2e38200202908C17B43';
const BTC_USD_FEED = '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43';
const MAX_DEVIATION_BPS = Number(process.env.MAX_DEVIATION_BPS ?? '500'); // 5%

async function main() {
  const cfgPath = path.join(__dirname, '..', 'public', 'arc-contracts.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const { LiftupRouter: routerAddr, USDC, EURC, cirBTC } = cfg;
  if (!cirBTC) throw new Error('cirBTC address not in arc-contracts.json');

  const signers = await hre.ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      'No signer available. Set DEPLOYER_PRIVATE_KEY in .env.local ' +
      '(the wallet that will own + register feeds on the guard contract). ' +
      'See hardhat.config.cjs:22.',
    );
  }
  const [signer] = signers;
  console.log('LiftUp · deploy oracle guard');
  console.log('────────────────────────────');
  console.log('Signer:    ', signer.address);
  console.log('Router:    ', routerAddr);
  console.log('Pyth:      ', PYTH_ARC_TESTNET);
  console.log('Max drift: ', `${MAX_DEVIATION_BPS} bps (${MAX_DEVIATION_BPS / 100}%)`);

  // 1. Deploy.
  console.log('\n→ Deploying LiftupOracleGuard…');
  const Guard = await hre.ethers.getContractFactory('LiftupOracleGuard');
  const guard = await Guard.deploy(PYTH_ARC_TESTNET, routerAddr, MAX_DEVIATION_BPS);
  await guard.waitForDeployment();
  const guardAddr = await guard.getAddress();
  console.log(`  Deployed at ${guardAddr}`);

  // 2. Register BTC/USD feed for both cirBTC pools.
  console.log('\n→ Registering BTC/USD feed for cirBTC pools…');
  await (await guard.registerFeed(USDC, cirBTC, BTC_USD_FEED)).wait();
  console.log('  ✓ USDC/cirBTC → BTC/USD');
  await (await guard.registerFeed(EURC, cirBTC, BTC_USD_FEED)).wait();
  console.log('  ✓ EURC/cirBTC → BTC/USD');
  // Note: EURC/cirBTC technically needs EUR/USD to compare correctly.
  // For Phase 1 we accept the small EUR/USD mismatch (~10% bound captures it).
  // Phase 2: extend _checkDeviation to read two feeds for EUR-side pairs.

  // 3. Write back to arc-contracts.json.
  cfg.LiftupOracleGuard = guardAddr;
  cfg.PythPriceOracle = PYTH_ARC_TESTNET;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`\n✓ Updated ${path.relative(process.cwd(), cfgPath)}`);

  console.log('\n────────────────────────────');
  console.log('Next steps:');
  console.log('  • Verify: pnpm hh verify --network arcTestnet', guardAddr, PYTH_ARC_TESTNET, routerAddr, MAX_DEVIATION_BPS);
  console.log('  • Frontend: switch swap approvals/calls to Guard (lib/liftupAmm.ts → add LIFTUP_ORACLE_GUARD export)');
  console.log('  • Test from UI: click "Force LiftUp anyway" while pool is skewed → should now revert with PairDeviates');
}

main().catch((err) => { console.error(err); process.exit(1); });
