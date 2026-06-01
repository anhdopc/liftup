// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

interface ILiftupRouter {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getPairInfo(address tokenA, address tokenB)
        external
        view
        returns (address pair, uint256 reserveA, uint256 reserveB, uint256 totalSupply);
}

/// @title LiftupOracleGuard
/// @notice Wraps LiftupRouter swaps with a Pyth on-chain price check.
///         Refuses to forward a swap if the pool's implied price deviates
///         from the live Pyth feed by more than maxDeviationBps.
///
///         The existing LiftupRouter is intentionally NOT modified — this
///         contract is an opt-in additional layer. Users (or the UI)
///         approve the guard instead of the router, and call the guard's
///         swap function which:
///           1. Updates Pyth with caller-supplied price update bytes
///              (pyth.updatePriceFeeds, fee paid in msg.value)
///           2. Reads the relevant feed for the swap path
///           3. Compares pool reserve ratio to oracle price
///           4. Forwards to the underlying router if within tolerance
///
///         Direct calls to LiftupRouter still work — by design — so
///         operator scripts (repair-cirbtc-pools.js, drain, etc.) keep
///         working without changes. The guard only protects the user-
///         facing UI path.
///
/// Design notes
///   • Only cirBTC pools are protected in v1 — that's where the actual
///     attack happened. Pairs without a registered feed pass through
///     unchecked, so the guard is safe to add to all paths.
///   • The owner can register/unregister price feeds per pair and tune
///     maxDeviationBps. Owner can also flip emergencyPaused to refuse
///     ALL swaps (kill switch for true oracle suspect events).
///   • Pyth's `getPriceNoOlderThan(id, 60)` rejects any feed older than
///     60 seconds — that's the upstream defense against stale oracles.
contract LiftupOracleGuard is Ownable {
    using SafeERC20 for IERC20;

    IPyth public immutable pyth;
    ILiftupRouter public immutable router;

    /// @dev pairKey(tokenA,tokenB) → Pyth feed ID for the non-USD side.
    ///      For a USDC/cirBTC pair the feed is BTC/USD; the guard treats
    ///      USDC as $1.00.
    mapping(bytes32 => bytes32) public feedIdFor;
    uint256 public maxDeviationBps; // 500 = 5%
    bool public emergencyPaused;

    event FeedRegistered(address indexed tokenA, address indexed tokenB, bytes32 feedId);
    event FeedRemoved(address indexed tokenA, address indexed tokenB);
    event DeviationUpdated(uint256 oldBps, uint256 newBps);
    event EmergencyPause(bool paused);
    event Guarded(address indexed tokenIn, address indexed tokenOut, uint256 poolPrice, uint256 oraclePrice, uint256 driftBps);

    error PairDeviates(uint256 driftBps, uint256 maxBps);
    error Paused();
    error InvalidPath();
    error PythUpdateFailed();

    constructor(address _pyth, address _router, uint256 _maxDeviationBps) Ownable(msg.sender) {
        require(_pyth != address(0) && _router != address(0), "guard: zero address");
        require(_maxDeviationBps > 0 && _maxDeviationBps <= 5000, "guard: bad bps");
        pyth = IPyth(_pyth);
        router = ILiftupRouter(_router);
        maxDeviationBps = _maxDeviationBps;
    }

    // ─────────────────────────── ADMIN ───────────────────────────

    function registerFeed(address tokenA, address tokenB, bytes32 feedId) external onlyOwner {
        require(feedId != bytes32(0), "guard: empty feed id");
        feedIdFor[_pairKey(tokenA, tokenB)] = feedId;
        emit FeedRegistered(tokenA, tokenB, feedId);
    }

    function removeFeed(address tokenA, address tokenB) external onlyOwner {
        delete feedIdFor[_pairKey(tokenA, tokenB)];
        emit FeedRemoved(tokenA, tokenB);
    }

    function setMaxDeviation(uint256 newBps) external onlyOwner {
        require(newBps > 0 && newBps <= 5000, "guard: bad bps");
        emit DeviationUpdated(maxDeviationBps, newBps);
        maxDeviationBps = newBps;
    }

    function setEmergencyPause(bool paused) external onlyOwner {
        emergencyPaused = paused;
        emit EmergencyPause(paused);
    }

    // ─────────────────────────── SWAP ───────────────────────────

    /// @notice Pyth-checked swap. Forwards to LiftupRouter.swapExactTokensForTokens.
    /// @param priceUpdate Caller-supplied Pyth price update bytes (from Hermes).
    ///                    Pass an empty array `new bytes[](0)` to skip the on-chain
    ///                    update step — the guard will then read whatever price
    ///                    Pyth currently has on-chain (must be ≤60s old).
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline,
        bytes[] calldata priceUpdate
    ) external payable returns (uint256[] memory amounts) {
        if (emergencyPaused) revert Paused();
        if (path.length != 2) revert InvalidPath();

        // 1. Optionally push fresh Pyth update on-chain.
        if (priceUpdate.length > 0) {
            uint256 fee = pyth.getUpdateFee(priceUpdate);
            require(msg.value >= fee, "guard: insufficient pyth fee");
            try pyth.updatePriceFeeds{value: fee}(priceUpdate) {
                if (msg.value > fee) {
                    (bool ok, ) = msg.sender.call{value: msg.value - fee}("");
                    require(ok, "guard: refund failed");
                }
            } catch {
                revert PythUpdateFailed();
            }
        } else {
            require(msg.value == 0, "guard: msg.value without update");
        }

        // 2. If a feed is registered for this pair, enforce deviation check.
        bytes32 feedId = feedIdFor[_pairKey(path[0], path[1])];
        if (feedId != bytes32(0)) {
            _checkDeviation(path[0], path[1], feedId);
        }

        // 3. Pull tokens, approve router (one-shot), forward call.
        IERC20(path[0]).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(path[0]).forceApprove(address(router), amountIn);
        amounts = router.swapExactTokensForTokens(amountIn, amountOutMin, path, to, deadline);
    }

    // ────────────────────────── INTERNAL ──────────────────────────

    /// @dev Symmetric pair key so feedIdFor(A,B) == feedIdFor(B,A).
    function _pairKey(address a, address b) internal pure returns (bytes32) {
        return a < b
            ? keccak256(abi.encodePacked(a, b))
            : keccak256(abi.encodePacked(b, a));
    }

    /// @dev Compares the pool's implied price (tokenOut per tokenIn) against
    ///      the Pyth feed. Both prices are normalised to 1e18 fixed point.
    ///      Assumes the non-cirBTC side is a $1 stablecoin (USDC/EURC) —
    ///      EUR-side pairs need a tiny extension to also fetch EUR/USD.
    function _checkDeviation(address tokenIn, address tokenOut, bytes32 feedId) internal {
        (, uint256 reserveIn, uint256 reserveOut, ) = router.getPairInfo(tokenIn, tokenOut);
        require(reserveIn > 0 && reserveOut > 0, "guard: empty pool");

        uint8 decIn = IERC20Metadata(tokenIn).decimals();
        uint8 decOut = IERC20Metadata(tokenOut).decimals();

        // Pool price = tokenOut per 1 tokenIn, scaled to 1e18.
        uint256 poolPrice = (reserveOut * (10 ** (18 + decIn))) / (reserveIn * (10 ** decOut));

        // Pyth price for the non-stable side. getPriceNoOlderThan reverts
        // if the latest publishTime is more than 60 seconds in the past.
        PythStructs.Price memory p = pyth.getPriceNoOlderThan(feedId, 60);
        require(p.price > 0, "guard: bad pyth price");
        uint256 oraclePrice = uint256(uint64(p.price)) * (10 ** uint32(18 + p.expo));
        // ^ expo is negative (e.g. -8), so 18+expo = 10 for an 8-dp Pyth
        //   feed → produces a 1e18-scaled USD price per 1 unit of base.

        uint256 diff = poolPrice > oraclePrice ? poolPrice - oraclePrice : oraclePrice - poolPrice;
        uint256 driftBps = (diff * 10_000) / oraclePrice;

        if (driftBps > maxDeviationBps) revert PairDeviates(driftBps, maxDeviationBps);
        emit Guarded(tokenIn, tokenOut, poolPrice, oraclePrice, driftBps);
    }
}

interface IERC20Metadata {
    function decimals() external view returns (uint8);
}
