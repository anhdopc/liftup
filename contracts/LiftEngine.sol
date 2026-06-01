// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LiftEngine
 * @notice Stablecoin liquidity & loyalty layer — fee-redirect
 *         distribution model with conviction-tier + tenure weighting.
 *         Replaces v0 LiftupRewardDistributor's lottery model.
 *
 * Spec: docs/lift-engine-spec.md
 *
 * Architecture:
 *   - Inflow: LiftupPair sends 100% of swap fees here (factory.feeTo()).
 *             Circle App Kit's 10 bps customFee also lands here.
 *   - Split:  immutable 10/31.5/31.5/22.5/4.5 bucket weights. Each of
 *             daily/weekly/monthly is further split 60/40 trader/LP
 *             into two independent sub-buckets — no order dependency
 *             between trader and LP accruals.
 *   - Accrue: off-chain bot calls accrueTraderInstant (per-swap) +
 *             accrueLpDaily / accrueTraderWeekly / accrueLpWeekly /
 *             accrueTraderMonthly / accrueLpMonthly (on cron) with
 *             batched (recipients[], amounts[]) per spec §4 formulas.
 *   - Claim:  user calls claim(tokens[]) to receive accumulated
 *             rewards. Sub-cent gas on Arc.
 *
 * Trust model:
 *   - Bucket weights are `constant`. Owner cannot change splits or
 *     redirect rewards.
 *   - Per-pair launch boost is owner-config but bounded:
 *       multiplier ≤ 2.0×, duration ≤ 30 days, set ONCE per pair.
 *   - accrue* functions trust the bot; bot's submissions are
 *     reproducible from public swap/transfer events (verifiable).
 *   - Owner-withdrawable: only `growth[token]` balance. Never user
 *     accrued balances.
 */
contract LiftEngine is ReentrancyGuard {
    // ─── Bucket weights (immutable constants) ────────────────────────
    // Sum = 10000 bps. These cannot be changed by anyone.
    uint16 public constant GROWTH_BPS  = 1000;  // 10.0%
    uint16 public constant DAILY_BPS   = 3150;  // 31.5%
    uint16 public constant WEEKLY_BPS  = 3150;  // 31.5%
    uint16 public constant MONTHLY_BPS = 2250;  // 22.5%
    uint16 public constant BONUS_BPS   =  450;  //  4.5%
    uint16 public constant TOTAL_BPS   = 10000;

    // Within each cadence bucket: 60% trader path + 40% LP path. The
    // two sub-buckets are tracked independently on chain so trader
    // and LP accruals cannot interfere with each other's allowance.
    uint16 public constant TRADER_PATH_BPS = 6000;  // 60% of bucket
    uint16 public constant LP_PATH_BPS     = 4000;  // 40% of bucket
    uint16 public constant PATH_TOTAL_BPS  = 10000;

    // Launch-boost hard caps. Block counts assume Arc's ~2s/block —
    // 30 days × 86400s / 2s = 1,296,000 blocks; 7 days = 302,400 blocks.
    uint16 public constant MAX_LAUNCH_BOOST_BPS    = 20_000;     // 2.00×
    uint64 public constant MAX_LAUNCH_DURATION_BLK = 1_296_000;  // ≈ 30 days
    uint64 public constant MAX_LAUNCH_VEST_BLK     =   302_400;  // ≈  7 days
    uint16 public constant BPS_UNIT                = 10_000;     // 1.00×

    // ─── State ───────────────────────────────────────────────────────
    address public owner;
    address public growthWallet;

    // Per-token bucket accounting.
    //   growth, bonus  — single buckets (admin-controlled)
    //   {daily,weekly,monthly}LpBucket   — 40% of cadence, drained by accrueLp*
    //   {daily,weekly,monthly}TraderBucket — 60% of cadence, drained by accrueTrader*
    mapping(address => uint256) public growth;
    mapping(address => uint256) public bonus;

    mapping(address => uint256) public dailyLpBucket;
    mapping(address => uint256) public dailyTraderBucket;
    mapping(address => uint256) public weeklyLpBucket;
    mapping(address => uint256) public weeklyTraderBucket;
    mapping(address => uint256) public monthlyLpBucket;
    mapping(address => uint256) public monthlyTraderBucket;

    // Per-(user, token) accrued rewards across all cadences + trader
    // path. User claims by transferring accrued[user][token] → 0.
    mapping(address => mapping(address => uint256)) public accrued;

    // Running total of pending user claims per token. Bumped on every
    // accrue*; decremented on every claim. Used in settle() to avoid
    // double-counting user balances into new bucket allocations.
    mapping(address => uint256) public pendingClaims;

    // Per-pair launch boost. Set once by owner, then immutable per pair.
    struct LaunchBoost {
        uint64 startBlock;
        uint64 endBlock;
        uint64 vestBlocks;
        uint16 multiplierBps;  // e.g., 15_000 = 1.50×
        bool   finalized;
    }
    mapping(address => LaunchBoost) public launchBoosts;

    // ─── Events ──────────────────────────────────────────────────────
    event Settled(
        address indexed token,
        uint256 newAmount,
        uint256 toGrowth,
        uint256 toDaily,
        uint256 toWeekly,
        uint256 toMonthly,
        uint256 toBonus
    );
    event Accrued(
        bytes32 indexed cadence,    // "trader-instant" / "trader-weekly" / "trader-monthly"
                                    // / "lp-daily" / "lp-weekly" / "lp-monthly"
        address indexed token,
        address indexed recipient,
        uint256 amount
    );
    event Claimed(
        address indexed user,
        address indexed token,
        uint256 amount
    );
    event LaunchBoostSet(
        address indexed pair,
        uint64 startBlock,
        uint64 endBlock,
        uint64 vestBlocks,
        uint16 multiplierBps
    );
    event GrowthWithdrawn(address indexed token, address indexed to, uint256 amount);
    event BonusSwept(address indexed token, address indexed to, uint256 amount);
    event OwnerUpdated(address indexed oldOwner, address indexed newOwner);
    event GrowthWalletUpdated(address indexed oldWallet, address indexed newWallet);

    // ─── Modifiers ───────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "LE: forbidden");
        _;
    }

    constructor(address _owner, address _growthWallet) {
        require(_owner != address(0), "LE: zero owner");
        require(_growthWallet != address(0), "LE: zero growth wallet");
        owner = _owner;
        growthWallet = _growthWallet;
    }

    // ────────────────────────────────────────────────────────────────
    // Settlement — allocate fresh inflow into 8 sub-buckets
    // ────────────────────────────────────────────────────────────────

    /// @notice Allocate any unaccounted-for `token` balance per the
    ///         immutable weights. Anyone may call.
    function settle(address token) public {
        uint256 totalBal = IERC20(token).balanceOf(address(this));
        uint256 accounted = growth[token]
            + bonus[token]
            + dailyLpBucket[token]    + dailyTraderBucket[token]
            + weeklyLpBucket[token]   + weeklyTraderBucket[token]
            + monthlyLpBucket[token]  + monthlyTraderBucket[token]
            + pendingClaims[token];
        require(totalBal >= accounted, "LE: balance < accounted");
        uint256 newAmt = totalBal - accounted;
        if (newAmt == 0) return;

        // Cadence-level allocation.
        uint256 toGrowth  = (newAmt * GROWTH_BPS)  / TOTAL_BPS;
        uint256 toDaily   = (newAmt * DAILY_BPS)   / TOTAL_BPS;
        uint256 toWeekly  = (newAmt * WEEKLY_BPS)  / TOTAL_BPS;
        uint256 toMonthly = (newAmt * MONTHLY_BPS) / TOTAL_BPS;
        // Rounding dust → bonus so nothing is stranded.
        uint256 toBonus   = newAmt - toGrowth - toDaily - toWeekly - toMonthly;

        // Within each cadence, 60/40 split into trader + LP sub-buckets.
        // Rounding dust goes to LP side.
        uint256 dT = (toDaily   * TRADER_PATH_BPS) / PATH_TOTAL_BPS;
        uint256 wT = (toWeekly  * TRADER_PATH_BPS) / PATH_TOTAL_BPS;
        uint256 mT = (toMonthly * TRADER_PATH_BPS) / PATH_TOTAL_BPS;

        growth[token]               += toGrowth;
        bonus[token]                += toBonus;
        dailyTraderBucket[token]    += dT;
        dailyLpBucket[token]        += (toDaily   - dT);
        weeklyTraderBucket[token]   += wT;
        weeklyLpBucket[token]       += (toWeekly  - wT);
        monthlyTraderBucket[token]  += mT;
        monthlyLpBucket[token]      += (toMonthly - mT);

        emit Settled(token, newAmt, toGrowth, toDaily, toWeekly, toMonthly, toBonus);
    }

    function settleMany(address[] calldata tokens) external {
        for (uint256 i = 0; i < tokens.length; i++) {
            settle(tokens[i]);
        }
    }

    // ────────────────────────────────────────────────────────────────
    // Accrual — bot-callable; moves from sub-buckets → user accrued
    // ────────────────────────────────────────────────────────────────

    function accrueTraderInstant(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyOwner nonReentrant {
        _accrue("trader-instant", token, recipients, amounts, dailyTraderBucket);
    }

    function accrueTraderWeekly(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyOwner nonReentrant {
        _accrue("trader-weekly", token, recipients, amounts, weeklyTraderBucket);
    }

    function accrueTraderMonthly(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyOwner nonReentrant {
        _accrue("trader-monthly", token, recipients, amounts, monthlyTraderBucket);
    }

    function accrueLpDaily(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyOwner nonReentrant {
        _accrue("lp-daily", token, recipients, amounts, dailyLpBucket);
    }

    function accrueLpWeekly(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyOwner nonReentrant {
        _accrue("lp-weekly", token, recipients, amounts, weeklyLpBucket);
    }

    function accrueLpMonthly(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyOwner nonReentrant {
        _accrue("lp-monthly", token, recipients, amounts, monthlyLpBucket);
    }

    function _accrue(
        bytes32 cadence,
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts,
        mapping(address => uint256) storage bucket
    ) private {
        require(recipients.length == amounts.length, "LE: length mismatch");
        require(recipients.length > 0, "LE: empty");
        settle(token);

        uint256 total = _sum(amounts);
        require(total <= bucket[token], "LE: exceeds bucket");
        bucket[token] -= total;

        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "LE: zero recipient");
            accrued[recipients[i]][token] += amounts[i];
            pendingClaims[token] += amounts[i];
            emit Accrued(cadence, token, recipients[i], amounts[i]);
        }
    }

    function _sum(uint256[] calldata arr) private pure returns (uint256 s) {
        for (uint256 i = 0; i < arr.length; i++) s += arr[i];
    }

    // ────────────────────────────────────────────────────────────────
    // Claim — user-callable
    // ────────────────────────────────────────────────────────────────

    /// @notice Transfer all accrued rewards for the given tokens to msg.sender.
    ///         Accrued balance persists indefinitely until claimed.
    function claim(address[] calldata tokens) external nonReentrant {
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            uint256 amt = accrued[msg.sender][token];
            if (amt == 0) continue;
            accrued[msg.sender][token] = 0;
            pendingClaims[token] -= amt;
            _safeTransfer(token, msg.sender, amt);
            emit Claimed(msg.sender, token, amt);
        }
    }

    /// @notice View helper — total pending across N tokens for `user`.
    function pendingFor(address user, address[] calldata tokens)
        external
        view
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            amounts[i] = accrued[user][tokens[i]];
        }
    }

    // ────────────────────────────────────────────────────────────────
    // Owner ops
    // ────────────────────────────────────────────────────────────────

    function withdrawGrowth(address token, uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        settle(token);
        require(growth[token] >= amount, "LE: insufficient growth");
        growth[token] -= amount;
        _safeTransfer(token, growthWallet, amount);
        emit GrowthWithdrawn(token, growthWallet, amount);
    }

    /// @notice Sweep bonus bucket to growth wallet (default behavior
    ///         until a community-event program is activated).
    function sweepBonus(address token, uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        settle(token);
        require(bonus[token] >= amount, "LE: insufficient bonus");
        bonus[token] -= amount;
        _safeTransfer(token, growthWallet, amount);
        emit BonusSwept(token, growthWallet, amount);
    }

    /// @notice One-time launch boost for a pair. After call,
    ///         launchBoosts[pair].finalized = true and can never be
    ///         modified — owner cannot retroactively change a boost.
    function setLaunchBoost(
        address pair,
        uint64 startBlock,
        uint64 endBlock,
        uint64 vestBlocks,
        uint16 multiplierBps
    ) external onlyOwner {
        require(pair != address(0), "LE: zero pair");
        require(!launchBoosts[pair].finalized, "LE: already set");
        require(endBlock > startBlock, "LE: bad block range");
        require(endBlock - startBlock <= MAX_LAUNCH_DURATION_BLK, "LE: duration > cap");
        require(vestBlocks <= MAX_LAUNCH_VEST_BLK, "LE: vest > cap");
        require(multiplierBps > BPS_UNIT, "LE: boost <= 1.00x");
        require(multiplierBps <= MAX_LAUNCH_BOOST_BPS, "LE: boost > cap");
        launchBoosts[pair] = LaunchBoost({
            startBlock:    startBlock,
            endBlock:      endBlock,
            vestBlocks:    vestBlocks,
            multiplierBps: multiplierBps,
            finalized:     true
        });
        emit LaunchBoostSet(pair, startBlock, endBlock, vestBlocks, multiplierBps);
    }

    function setOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "LE: zero owner");
        emit OwnerUpdated(owner, newOwner);
        owner = newOwner;
    }

    function setGrowthWallet(address newGrowth) external onlyOwner {
        require(newGrowth != address(0), "LE: zero wallet");
        emit GrowthWalletUpdated(growthWallet, newGrowth);
        growthWallet = newGrowth;
    }

    // ────────────────────────────────────────────────────────────────
    // Views
    // ────────────────────────────────────────────────────────────────

    function getBuckets(address token)
        external
        view
        returns (
            uint256 growth_,
            uint256 bonus_,
            uint256 dailyLp_,    uint256 dailyTrader_,
            uint256 weeklyLp_,   uint256 weeklyTrader_,
            uint256 monthlyLp_,  uint256 monthlyTrader_,
            uint256 pendingClaims_,
            uint256 unsettled_
        )
    {
        growth_         = growth[token];
        bonus_          = bonus[token];
        dailyLp_        = dailyLpBucket[token];
        dailyTrader_    = dailyTraderBucket[token];
        weeklyLp_       = weeklyLpBucket[token];
        weeklyTrader_   = weeklyTraderBucket[token];
        monthlyLp_      = monthlyLpBucket[token];
        monthlyTrader_  = monthlyTraderBucket[token];
        pendingClaims_  = pendingClaims[token];
        uint256 totalBal = IERC20(token).balanceOf(address(this));
        uint256 acc = growth_ + bonus_
            + dailyLp_   + dailyTrader_
            + weeklyLp_  + weeklyTrader_
            + monthlyLp_ + monthlyTrader_
            + pendingClaims_;
        unsettled_ = totalBal > acc ? totalBal - acc : 0;
    }

    // ────────────────────────────────────────────────────────────────
    // Plumbing
    // ────────────────────────────────────────────────────────────────

    function _safeTransfer(address token, address to, uint256 value) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, value)
        );
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "LE: transfer failed"
        );
    }
}
