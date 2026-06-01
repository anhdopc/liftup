// Seed the two cirBTC pools on Arc Testnet at live BTC market rate.
//
//   pnpm hh run scripts/seed-cirbtc-pools.js --network arcTestnet
//
// What it does
//   1. Fetches BTC/USD + BTC/EUR from CoinGecko + Coinbase, takes the
//      median so neither source can grief the seed price.
//   2. Approves Router on USDC, EURC, cirBTC for the seed amounts.
//   3. Calls router.addLiquidity for USDC/cirBTC and EURC/cirBTC. The
//      router auto-creates each pair via factory.createPair when it
//      doesn't exist yet, so this is the "first add" — sets the locked
//      MINIMUM_LIQUIDITY ratio that defines the pool's starting price.
//   4. Reads the resulting pair addresses from the factory and prints
//      them for me to wire into public/arc-contracts.json + lib code.
//
// Budget (deployer wallet snapshot at seed time)
//   cirBTC balance is the bottleneck (~0.0002 from the Circle faucet),
//   so we allocate 0.00008 cirBTC per pool and keep 0.00004 in reserve
//   for the rebalance bot. USDC + EURC are sized to match BTC value.

const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

const TOKEN_DECIMALS = { USDC: 6, EURC: 6, cirBTC: 8 };
const SLIPPAGE_BPS = 1000; // 10% — first add, locked-in ratio matters

// Per-pool cirBTC seed amount (raw 8-decimal units → 0.00008 cirBTC).
const CIRBTC_PER_POOL_RAW = 8_000n;

async function fetchMedianBtcRates() {
  // CoinGecko + Coinbase — both public, no auth. Median across two
  // independent sources defends against a single quote spiking.
  const sources = [];
  try {
    const r = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur',
    );
    const j = await r.json();
    if (j?.bitcoin?.usd > 0 && j?.bitcoin?.eur > 0) {
      sources.push({ name: 'coingecko', usd: j.bitcoin.usd, eur: j.bitcoin.eur });
    }
  } catch (e) {
    console.warn('  [rate] CoinGecko failed:', e.message);
  }
  try {
    const r = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=BTC');
    const j = await r.json();
    const usd = parseFloat(j?.data?.rates?.USD ?? '0');
    const eur = parseFloat(j?.data?.rates?.EUR ?? '0');
    if (usd > 0 && eur > 0) {
      sources.push({ name: 'coinbase', usd, eur });
    }
  } catch (e) {
    console.warn('  [rate] Coinbase failed:', e.message);
  }
  if (sources.length === 0) {
    throw new Error('Both BTC rate sources failed; refusing to seed at a fallback price');
  }
  const usd = sources.reduce((s, x) => s + x.usd, 0) / sources.length;
  const eur = sources.reduce((s, x) => s + x.eur, 0) / sources.length;
  return { usd, eur, sources };
}

async function main() {
  const cfgPath = path.join(__dirname, '..', 'public', 'arc-contracts.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const { LiftupFactory: factoryAddr, LiftupRouter: routerAddr, USDC, EURC } = cfg;
  const CIRBTC = '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF';

  const [signer] = await hre.ethers.getSigners();
  console.log('LiftUp · seed cirBTC pools');
  console.log('────────────────────────────');
  console.log('Signer:    ', signer.address);
  console.log('Factory:   ', factoryAddr);
  console.log('Router:    ', routerAddr);

  // ── 1. Live BTC rate
  console.log('\n→ Fetching live BTC rate…');
  const { usd: btcUsd, eur: btcEur, sources } = await fetchMedianBtcRates();
  console.log(
    `  Sources: ${sources.map((s) => `${s.name}(USD=${s.usd.toFixed(0)}, EUR=${s.eur.toFixed(0)})`).join(' · ')}`,
  );
  console.log(`  Median BTC/USD = ${btcUsd.toFixed(2)}`);
  console.log(`  Median BTC/EUR = ${btcEur.toFixed(2)}`);

  // ── 2. Compute seed amounts
  // 0.00008 cirBTC × $77620 = $6.21 USDC; 0.00008 × €66841 = €5.35 EURC.
  const cirbtcRaw = CIRBTC_PER_POOL_RAW; // 8-dp
  const cirbtcHuman = Number(cirbtcRaw) / 10 ** TOKEN_DECIMALS.cirBTC;
  const usdcHuman = cirbtcHuman * btcUsd;
  const eurcHuman = cirbtcHuman * btcEur;
  const usdcRaw = hre.ethers.parseUnits(usdcHuman.toFixed(6), TOKEN_DECIMALS.USDC);
  const eurcRaw = hre.ethers.parseUnits(eurcHuman.toFixed(6), TOKEN_DECIMALS.EURC);

  console.log('\nSeed amounts per pool:');
  console.log(`  USDC / cirBTC: ${usdcHuman.toFixed(6)} USDC + ${cirbtcHuman.toFixed(8)} cirBTC`);
  console.log(`  EURC / cirBTC: ${eurcHuman.toFixed(6)} EURC + ${cirbtcHuman.toFixed(8)} cirBTC`);
  console.log(`  Total cirBTC used: ${(cirbtcHuman * 2).toFixed(8)}`);

  // ── 3. Balance + approval
  const erc20Abi = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function balanceOf(address) external view returns (uint256)',
    'function allowance(address owner, address spender) external view returns (uint256)',
  ];
  const usdcC = new hre.ethers.Contract(USDC, erc20Abi, signer);
  const eurcC = new hre.ethers.Contract(EURC, erc20Abi, signer);
  const cirbtcC = new hre.ethers.Contract(CIRBTC, erc20Abi, signer);

  const balU = await usdcC.balanceOf(signer.address);
  const balE = await eurcC.balanceOf(signer.address);
  const balB = await cirbtcC.balanceOf(signer.address);
  console.log('\nWallet balances:');
  console.log(`  USDC:   ${hre.ethers.formatUnits(balU, 6)}`);
  console.log(`  EURC:   ${hre.ethers.formatUnits(balE, 6)}`);
  console.log(`  cirBTC: ${hre.ethers.formatUnits(balB, 8)}`);
  if (balU < usdcRaw) throw new Error('Not enough USDC');
  if (balE < eurcRaw) throw new Error('Not enough EURC');
  if (balB < cirbtcRaw * 2n) throw new Error('Not enough cirBTC (need 2× per-pool amount)');

  // Approve router for the combined amounts.
  console.log('\n→ Approving router…');
  await (await usdcC.approve(routerAddr, usdcRaw)).wait();
  await (await eurcC.approve(routerAddr, eurcRaw)).wait();
  await (await cirbtcC.approve(routerAddr, cirbtcRaw * 2n)).wait();
  console.log('  done.');

  // ── 4. addLiquidity for each pool
  const router = await hre.ethers.getContractAt('LiftupRouter', routerAddr, signer);
  const deadline = Math.floor(Date.now() / 1000) + 600;

  async function addAndPrint(label, tokenA, tokenB, amtA, amtB) {
    const minA = (amtA * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;
    const minB = (amtB * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;
    console.log(`\n→ addLiquidity ${label}…`);
    const tx = await router.addLiquidity(
      tokenA,
      tokenB,
      amtA,
      amtB,
      minA,
      minB,
      signer.address,
      deadline,
    );
    const rcpt = await tx.wait();
    console.log(`  tx: ${rcpt.hash}`);
  }

  await addAndPrint('USDC + cirBTC', USDC, CIRBTC, usdcRaw, cirbtcRaw);
  await addAndPrint('EURC + cirBTC', EURC, CIRBTC, eurcRaw, cirbtcRaw);

  // ── 5. Read new pair addresses
  const factoryAbi = [
    'function getPair(address tokenA, address tokenB) external view returns (address)',
  ];
  const factory = new hre.ethers.Contract(factoryAddr, factoryAbi, signer);
  const usdcCirbtcPair = await factory.getPair(USDC, CIRBTC);
  const eurcCirbtcPair = await factory.getPair(EURC, CIRBTC);

  console.log('\n✓ Pairs created + seeded:');
  console.log(`  USDC/cirBTC: ${usdcCirbtcPair}`);
  console.log(`  EURC/cirBTC: ${eurcCirbtcPair}`);

  // ── 6. Write back to arc-contracts.json
  cfg.pairs = cfg.pairs || {};
  cfg.pairs['USDC/cirBTC'] = usdcCirbtcPair;
  cfg.pairs['EURC/cirBTC'] = eurcCirbtcPair;
  cfg.cirBTC = CIRBTC;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`\n✓ Updated ${path.relative(process.cwd(), cfgPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
