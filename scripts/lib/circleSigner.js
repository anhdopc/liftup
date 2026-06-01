// Circle Developer-Controlled Wallets — signer adapter for hardhat scripts.
//
// Problem this solves
//   Today the rebalancer / repair / deploy scripts read a raw private key
//   from .env.local or GH Actions secrets. If that key leaks, the
//   attacker can move funds and break the pool. With this adapter the
//   bot's signing key never leaves Circle's TEE — scripts hold only an
//   API key + an entity secret encrypted per-request, neither of which
//   can sign on their own.
//
//   See docs/SECURITY.md (TODO) for the threat model.
//
// Setup (one-time, ~10 minutes)
//   1. Sign up at https://console.circle.com → Wallets → Developer-controlled
//   2. Generate + register an Entity Secret:
//        https://developers.circle.com/wallets/dev-controlled/register-entity-secret
//      (the dashboard gives a recovery file — store offline)
//   3. Create a wallet set + a wallet on Arc-Testnet (chain "ARC-TESTNET").
//      Note the walletId (UUID) and the wallet's 0x address.
//   4. Add to .env.local (and to GH Actions secrets):
//        CIRCLE_API_KEY=TEST_API_KEY:abc123…
//        CIRCLE_ENTITY_SECRET=64-hex-chars   (the raw secret, NOT the ciphertext)
//        CIRCLE_REBALANCER_WALLET_ID=11111111-2222-3333-4444-555555555555
//   5. Fund the wallet via console faucet
//
// Usage in a script
//   const { getCircleAddress, circleExecute } = require('./lib/circleSigner');
//   const address = await getCircleAddress();      // resolves once, cached
//   const tx = await circleExecute({
//     contractAddress: routerAddr,
//     abiFunctionSignature: 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
//     abiParameters: [amountIn.toString(), minOut.toString(), [tokenIn, tokenOut], address, deadline],
//   });
//   console.log('tx hash', tx.txHash);
//
// What this adapter intentionally does NOT do
//   • Implement ethers.Signer fully — Circle's API submits the tx on its
//     own and returns a Circle tx id, not raw signed bytes. Trying to
//     pretend it's an EOA inside hardhat breaks gas estimation and
//     receipts. Instead we expose a thin direct API.
//   • Hide the polling loop — Circle's API is async, this helper polls
//     /v1/w3s/transactions/{id} until it has an on-chain hash.

let _client;
let _walletId;
let _cachedAddress;

function client() {
  if (_client) return _client;
  const { initiateDeveloperControlledWalletsClient } =
    require('@circle-fin/developer-controlled-wallets');
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret) {
    throw new Error('circleSigner: set CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET in env');
  }
  _client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  return _client;
}

function walletId() {
  if (_walletId) return _walletId;
  _walletId = process.env.CIRCLE_REBALANCER_WALLET_ID;
  if (!_walletId) {
    throw new Error('circleSigner: set CIRCLE_REBALANCER_WALLET_ID (UUID from console.circle.com)');
  }
  return _walletId;
}

/** Resolve the wallet's 0x EVM address. Cached after first call. */
async function getCircleAddress() {
  if (_cachedAddress) return _cachedAddress;
  const c = client();
  const res = await c.getWallet({ id: walletId() });
  const addr = res?.data?.wallet?.address;
  if (!addr) throw new Error(`circleSigner: wallet ${walletId()} has no address`);
  _cachedAddress = addr;
  return addr;
}

/**
 * Submit a contract execution via Circle and wait for an on-chain tx hash.
 * Returns { txId, txHash, status }.
 *
 * @param {{
 *   contractAddress: string,
 *   abiFunctionSignature: string,   // e.g. "approve(address,uint256)"
 *   abiParameters: any[],           // string-encoded args
 *   feeLevel?: 'LOW' | 'MEDIUM' | 'HIGH',
 *   pollIntervalMs?: number,
 *   timeoutMs?: number,
 * }} opts
 */
async function circleExecute(opts) {
  const c = client();
  const id = walletId();
  const idempotencyKey = crypto.randomUUID();

  const submitRes = await c.createContractExecutionTransaction({
    walletId: id,
    contractAddress: opts.contractAddress,
    abiFunctionSignature: opts.abiFunctionSignature,
    abiParameters: opts.abiParameters,
    fee: { type: 'level', config: { feeLevel: opts.feeLevel ?? 'MEDIUM' } },
    idempotencyKey,
  });
  const txId = submitRes?.data?.id;
  if (!txId) {
    throw new Error(`circleSigner: submit failed: ${JSON.stringify(submitRes?.data)}`);
  }

  const poll = opts.pollIntervalMs ?? 3_000;
  const timeout = opts.timeoutMs ?? 120_000;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    await sleep(poll);
    const tx = await c.getTransaction({ id: txId });
    const t = tx?.data?.transaction;
    if (!t) continue;
    const status = t.state;
    if (status === 'COMPLETE' || status === 'CONFIRMED') {
      return { txId, txHash: t.txHash, status };
    }
    if (status === 'FAILED' || status === 'CANCELLED' || status === 'DENIED') {
      throw new Error(`circleSigner: tx ${txId} ${status}: ${t.errorReason || ''}`);
    }
    // Other states: INITIATED, PENDING_RISK_SCREENING, QUEUED, SENT — keep polling.
  }
  throw new Error(`circleSigner: tx ${txId} timed out after ${timeout}ms`);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
const crypto = require('crypto');

module.exports = { getCircleAddress, circleExecute };
