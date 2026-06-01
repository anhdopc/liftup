// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LiftupRewardDistributor
 * @notice On-chain custody of protocol fees with the 5-bucket split
 *         that funds the LiftUp lottery model.
 *
 *  Inflow  : LiftupPair sends 100% of swap fees here whenever
 *            factory.feeTo() points at this contract. Circle App Kit
 *            also sends its 10 bps LiftUp surcharge here.
 *
 *  Settle  : `settle(token)` (anyone-callable) allocates new inflow
 *            into 5 buckets per spec:
 *                 1000 bps (10%)   →  growth
 *                 3150 bps (31.5%) →  daily (TODAY's accruing pot)
 *                 3150 bps (31.5%) →  weekly
 *                 2250 bps (22.5%) →  monthly
 *                  450 bps  (4.5%) →  bonus
 *                = 10000 bps total
 *
 *  Rollover: `rolloverDaily(token)` freezes today's accumulated daily
 *            bucket into `dailyYesterday`, which is what the 24
 *            hourly draws today actually pay out from. Callable by
 *            anyone, gated to once every 23 hours per token so the
 *            cron can self-correct if it ever drifts.
 *
 *  Payout  : `owner` (admin / off-chain bot) calls `distributeDaily`
 *            etc. to pay winners.
 *              · distributeDaily   draws from dailyYesterday
 *              · distributeWeekly  draws from weekly
 *              · distributeMonthly draws from monthly
 *              · distributeBonus   draws from bonus
 *              · withdrawGrowth    draws from growth
 *
 *  Trust   : Owner CANNOT pull arbitrary funds — only from buckets
 *            that already hold balance. Splits are constants, not
 *            setters. Migrate ownership to a multi-sig before mainnet.
 */
contract LiftupRewardDistributor is ReentrancyGuard {
    // ── Bucket weights (sum = 10000 bps) ────────────────────────────
    uint16 public constant GROWTH_BPS = 1000;
    uint16 public constant DAILY_BPS = 3150;
    uint16 public constant WEEKLY_BPS = 3150;
    uint16 public constant MONTHLY_BPS = 2250;
    uint16 public constant BONUS_BPS = 450;
    uint16 public constant TOTAL_BPS = 10000;

    // Rollover gate — anyone can trigger after this window.
    uint256 public constant ROLLOVER_INTERVAL = 23 hours;

    address public owner;
    address public growthWallet;

    // Per-token bucket accounting.
    mapping(address => uint256) public growth;
    mapping(address => uint256) public dailyToday;     // accumulates from settle()
    mapping(address => uint256) public dailyYesterday; // distributable via distributeDaily()
    mapping(address => uint256) public weekly;
    mapping(address => uint256) public monthly;
    mapping(address => uint256) public bonus;

    // Rollover timestamps (per token, so USDC + EURC roll independently).
    mapping(address => uint256) public lastDailyRollover;

    event Settled(
        address indexed token,
        uint256 newAmount,
        uint256 toGrowth,
        uint256 toDailyToday,
        uint256 toWeekly,
        uint256 toMonthly,
        uint256 toBonus
    );
    event DailyRolledOver(
        address indexed token,
        uint256 frozenAmount,
        uint256 unspentCarryover
    );
    event GrowthWithdrawn(address indexed token, address indexed to, uint256 amount);
    event Distributed(
        bytes32 indexed bucket,
        address indexed token,
        address indexed recipient,
        uint256 amount
    );
    event OwnerUpdated(address indexed oldOwner, address indexed newOwner);
    event GrowthWalletUpdated(address indexed oldWallet, address indexed newWallet);

    modifier onlyOwner() {
        require(msg.sender == owner, "LRD: forbidden");
        _;
    }

    constructor(address _owner, address _growthWallet) {
        require(_owner != address(0), "LRD: zero owner");
        require(_growthWallet != address(0), "LRD: zero growth wallet");
        owner = _owner;
        growthWallet = _growthWallet;
    }

    // ── Settlement ───────────────────────────────────────────────────

    /// @notice Allocate any unaccounted-for `token` balance into the 5
    ///         buckets. Anyone may call.
    function settle(address token) public {
        uint256 totalBal = IERC20(token).balanceOf(address(this));
        uint256 accounted = growth[token]
            + dailyToday[token]
            + dailyYesterday[token]
            + weekly[token]
            + monthly[token]
            + bonus[token];
        require(totalBal >= accounted, "LRD: balance < accounted");
        uint256 newAmt = totalBal - accounted;
        if (newAmt == 0) return;

        uint256 toGrowth = (newAmt * GROWTH_BPS) / TOTAL_BPS;
        uint256 toDaily = (newAmt * DAILY_BPS) / TOTAL_BPS;
        uint256 toWeekly = (newAmt * WEEKLY_BPS) / TOTAL_BPS;
        uint256 toMonthly = (newAmt * MONTHLY_BPS) / TOTAL_BPS;
        // Rounding dust falls into bonus so nothing is stranded.
        uint256 toBonus = newAmt - toGrowth - toDaily - toWeekly - toMonthly;

        growth[token] += toGrowth;
        dailyToday[token] += toDaily;
        weekly[token] += toWeekly;
        monthly[token] += toMonthly;
        bonus[token] += toBonus;

        emit Settled(token, newAmt, toGrowth, toDaily, toWeekly, toMonthly, toBonus);
    }

    function settleMany(address[] calldata tokens) external {
        for (uint256 i = 0; i < tokens.length; i++) {
            settle(tokens[i]);
        }
    }

    // ── Daily rollover (Model B: snapshot per spec) ──────────────────

    /// @notice Move today's accumulated daily bucket into the
    ///         distributable yesterday bucket so the hourly bot can
    ///         start paying out a fresh snapshot. Anyone may trigger
    ///         once per ROLLOVER_INTERVAL per token — if the cron ever
    ///         drifts or misses a day, the next caller catches up
    ///         (any unpaid leftover from prior days rolls forward).
    function rolloverDaily(address token) public {
        require(
            block.timestamp >= lastDailyRollover[token] + ROLLOVER_INTERVAL,
            "LRD: rollover too soon"
        );
        // Make sure any pending inflow lands in dailyToday before freezing.
        settle(token);

        uint256 carryover = dailyYesterday[token]; // unpaid leftover
        uint256 frozen = dailyToday[token];
        dailyYesterday[token] = carryover + frozen;
        dailyToday[token] = 0;
        lastDailyRollover[token] = block.timestamp;

        emit DailyRolledOver(token, frozen, carryover);
    }

    /// @notice Convenience: rollover multiple tokens in one tx.
    function rolloverDailyMany(address[] calldata tokens) external {
        for (uint256 i = 0; i < tokens.length; i++) {
            rolloverDaily(tokens[i]);
        }
    }

    // ── Views ────────────────────────────────────────────────────────

    /// @notice Return current bucket balances for a token after a fresh settle().
    function getBuckets(address token)
        external
        view
        returns (
            uint256 growth_,
            uint256 dailyToday_,
            uint256 dailyYesterday_,
            uint256 weekly_,
            uint256 monthly_,
            uint256 bonus_,
            uint256 unsettled_
        )
    {
        growth_ = growth[token];
        dailyToday_ = dailyToday[token];
        dailyYesterday_ = dailyYesterday[token];
        weekly_ = weekly[token];
        monthly_ = monthly[token];
        bonus_ = bonus[token];
        uint256 totalBal = IERC20(token).balanceOf(address(this));
        uint256 accounted =
            growth_ + dailyToday_ + dailyYesterday_ + weekly_ + monthly_ + bonus_;
        unsettled_ = totalBal > accounted ? totalBal - accounted : 0;
    }

    /// @notice True if rollover is callable for this token right now.
    function rolloverDue(address token) external view returns (bool) {
        return block.timestamp >= lastDailyRollover[token] + ROLLOVER_INTERVAL;
    }

    // ── Owner-gated distributions ────────────────────────────────────

    function withdrawGrowth(address token, uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        settle(token);
        require(growth[token] >= amount, "LRD: insufficient growth");
        growth[token] -= amount;
        _safeTransfer(token, growthWallet, amount);
        emit GrowthWithdrawn(token, growthWallet, amount);
    }

    function distributeDaily(
        address token,
        address[] calldata winners,
        uint256[] calldata amounts
    ) external onlyOwner nonReentrant {
        // Daily pays out from yesterday's frozen snapshot, NOT today's
        // accruing pot. Today's fees won't be distributable until the
        // next rollover (one per ROLLOVER_INTERVAL).
        _distribute("daily", token, winners, amounts, dailyYesterday);
    }

    function distributeWeekly(
        address token,
        address[] calldata winners,
        uint256[] calldata amounts
    ) external onlyOwner nonReentrant {
        _distribute("weekly", token, winners, amounts, weekly);
    }

    function distributeMonthly(
        address token,
        address[] calldata winners,
        uint256[] calldata amounts
    ) external onlyOwner nonReentrant {
        _distribute("monthly", token, winners, amounts, monthly);
    }

    function distributeBonus(
        address token,
        address[] calldata winners,
        uint256[] calldata amounts
    ) external onlyOwner nonReentrant {
        _distribute("bonus", token, winners, amounts, bonus);
    }

    function _distribute(
        bytes32 bucket,
        address token,
        address[] calldata winners,
        uint256[] calldata amounts,
        mapping(address => uint256) storage pool
    ) private {
        require(winners.length == amounts.length, "LRD: length mismatch");
        require(winners.length > 0, "LRD: empty");
        settle(token);

        uint256 total = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            total += amounts[i];
        }
        require(pool[token] >= total, "LRD: insufficient bucket");
        pool[token] -= total;

        for (uint256 i = 0; i < winners.length; i++) {
            require(winners[i] != address(0), "LRD: zero recipient");
            _safeTransfer(token, winners[i], amounts[i]);
            emit Distributed(bucket, token, winners[i], amounts[i]);
        }
    }

    // ── Admin ────────────────────────────────────────────────────────

    function setOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "LRD: zero owner");
        emit OwnerUpdated(owner, newOwner);
        owner = newOwner;
    }

    function setGrowthWallet(address newGrowth) external onlyOwner {
        require(newGrowth != address(0), "LRD: zero wallet");
        emit GrowthWalletUpdated(growthWallet, newGrowth);
        growthWallet = newGrowth;
    }

    // ── Plumbing ─────────────────────────────────────────────────────

    function _safeTransfer(address token, address to, uint256 value) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, value)
        );
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "LRD: transfer failed"
        );
    }
}
