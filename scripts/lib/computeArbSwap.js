// Compute the swap input required to push a constant-product pool's
// reserve ratio (reserveOut / reserveIn) to a target value.
//
// Solving: given current reserves (rU, rE), find ΔU (or ΔE) such that
// after the swap the post-state ratio E/U equals `target`.
//
//   k = rU × rE   (constant product, fee on dust is negligible — we use
//                  the no-fee math here and let the actual swap take a
//                  tiny haircut, which leaves us slightly under target.)
//
//   Want post-state (rU + ΔU, rE - ΔE) where:
//     (rU + ΔU)(rE - ΔE) = k
//     (rE - ΔE) / (rU + ΔU) = target
//
//   Substituting:
//     (rU + ΔU) × target × (rU + ΔU) = k
//     (rU + ΔU)² = k / target
//     rU + ΔU    = sqrt(k / target)
//
// If current ratio > target → swap USDC→EURC (push USDC reserve up).
// If current ratio < target → swap EURC→USDC (push EURC reserve up).
//
// All inputs are bigint (raw 6-dp units). Returns the SAME shape so the
// caller can decide which direction to actually send.

const TOKEN_DECIMALS = 6;

function bigSqrt(n) {
  if (n < 0n) throw new Error('sqrt of negative');
  if (n < 2n) return n;
  // Newton's method on bigints.
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

/**
 * @param reserveUsdc bigint (6-dp raw)
 * @param reserveEurc bigint (6-dp raw)
 * @param targetRatio number (EURC per USDC, e.g. 0.9239)
 * @returns {{
 *   direction: 'usdc-to-eurc' | 'eurc-to-usdc' | 'none',
 *   amountIn: bigint,
 *   currentRatio: number,
 *   targetRatio: number,
 *   driftBps: number,   // |current - target| / target × 10_000
 * }}
 */
function computeArbSwap(reserveUsdc, reserveEurc, targetRatio) {
  if (reserveUsdc <= 0n || reserveEurc <= 0n) {
    throw new Error(
      `Cannot rebalance — empty pool (USDC=${reserveUsdc}, EURC=${reserveEurc}). Seed first.`,
    );
  }
  const currentRatio = Number(reserveEurc) / Number(reserveUsdc);
  const driftBps = Math.round(
    (Math.abs(currentRatio - targetRatio) / targetRatio) * 10_000,
  );

  if (driftBps === 0) {
    return {
      direction: 'none',
      amountIn: 0n,
      currentRatio,
      targetRatio,
      driftBps,
    };
  }

  // k stays constant under no-fee math; we scale up by 1e12 to keep
  // sqrt precision when reserves are in millions of raw units. The
  // result ends up in the same scale as the reserves anyway.
  const k = reserveUsdc * reserveEurc;

  // Target post-state USDC reserve: sqrt(k / target).
  // To do this in bigint with a float target, scale by 1e12 and back.
  const SCALE = 1_000_000_000_000n; // 1e12
  const targetScaled = BigInt(Math.round(targetRatio * Number(SCALE)));
  if (targetScaled === 0n) {
    throw new Error(`Bad target ratio ${targetRatio}`);
  }
  // (rU_new)² = k / target  → rU_new = sqrt(k × SCALE / targetScaled).
  const rUNewSquared = (k * SCALE) / targetScaled;
  const rUNew = bigSqrt(rUNewSquared);

  if (rUNew > reserveUsdc) {
    // Need MORE USDC in reserve → swap USDC→EURC (input USDC).
    const amountIn = rUNew - reserveUsdc;
    return {
      direction: 'usdc-to-eurc',
      amountIn,
      currentRatio,
      targetRatio,
      driftBps,
    };
  } else {
    // Less USDC in reserve means MORE EURC in reserve → swap EURC→USDC.
    // Compute symmetrically: new EURC reserve.
    const rENewSquared = k * targetScaled / SCALE;
    const rENew = bigSqrt(rENewSquared);
    if (rENew <= reserveEurc) {
      // Edge case: floating rounding made us pick the wrong branch.
      return {
        direction: 'none',
        amountIn: 0n,
        currentRatio,
        targetRatio,
        driftBps,
      };
    }
    const amountIn = rENew - reserveEurc;
    return {
      direction: 'eurc-to-usdc',
      amountIn,
      currentRatio,
      targetRatio,
      driftBps,
    };
  }
}

module.exports = { computeArbSwap, TOKEN_DECIMALS };
