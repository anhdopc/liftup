// Hardhat config — Arc Testnet only.
//
//   pnpm compile          # compile contracts
//   pnpm deploy:pool      # deploy Factory + Router + create USDC/EURC pair
//   pnpm verify <addr>    # verify a single contract on ArcScan
//
// Requires DEPLOYER_PRIVATE_KEY in .env.local (wallet pays gas in USDC,
// faucet from https://faucet.circle.com).
//
// ArcScan verification
//   ArcScan (testnet.arcscan.app) is a BlockScout-style explorer with an
//   Etherscan-compatible verification API. No API key is required for
//   public testnet contracts. To verify a contract:
//
//     npx hardhat verify --network arcTestnet <ADDRESS> [constructor args]
//
//   See README.md → "Verifying contracts on ArcScan" for the full
//   sequence (deployer-set Factory + Router + Distributor + Pair).
require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config({ path: '.env.local' });

const PK = process.env.DEPLOYER_PRIVATE_KEY;

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  paths: {
    sources: './contracts',
    artifacts: './artifacts',
    cache: './cache-hardhat',
    tests: './test',
  },
  networks: {
    arcTestnet: {
      url: 'https://rpc.testnet.arc.network',
      chainId: 5042002,
      accounts: PK ? [PK] : [],
    },
    hardhat: { chainId: 31337 },
  },
  etherscan: {
    // ArcScan accepts any non-empty value for the testnet — kept as a
    // literal so the hardhat-verify plugin doesn't bail out.
    apiKey: {
      arcTestnet: 'no-api-key-required',
    },
    customChains: [
      {
        network: 'arcTestnet',
        chainId: 5042002,
        urls: {
          apiURL: 'https://testnet.arcscan.app/api',
          browserURL: 'https://testnet.arcscan.app',
        },
      },
    ],
  },
  sourcify: {
    enabled: false, // not yet supported on Arc Testnet
  },
};
