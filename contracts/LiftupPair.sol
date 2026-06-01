// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

interface ILiftupFactory {
    function feeTo() external view returns (address);
}

/**
 * @title LiftupPair
 * @notice Constant-product AMM pool (x * y = k) for one pair of ERC-20 tokens.
 *         Forked from ChordSwap (giwaov/chordswap, MIT) with brand renames and
 *         a 0.05% LP fee tuned for stablecoin pairs (Aerodrome / Curve range)
 *         so LiftUp Pool stays competitive against Circle App Kit on
 *         USDC ↔ EURC quotes.
 */
contract LiftupPair is ERC20, ReentrancyGuard {
    using Math for uint256;

    address public immutable token0;
    address public immutable token1;
    address public immutable factory;

    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;

    uint256 public constant MINIMUM_LIQUIDITY = 1000;
    // Stable-pair fee tier — 0.05% per swap. Matches Aerodrome /
    // Velodrome stable pools and is within Curve's range (0.04%).
    // Lower than V2's default 0.30% so LiftUp Pool stays competitive
    // against Circle App Kit's FX quote on USDC ↔ EURC.
    uint256 public constant FEE_NUMERATOR = 9995;    // 0.05% LP fee
    uint256 public constant FEE_DENOMINATOR = 10000;

    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);

    constructor(address _token0, address _token1) ERC20("LiftUp LP", "LIFTUP-LP") {
        require(_token0 != address(0) && _token1 != address(0), "LiftupPair: zero address");
        require(_token0 != _token1, "LiftupPair: identical addresses");
        factory = msg.sender;
        token0 = _token0;
        token1 = _token1;
    }

    function getReserves()
        public
        view
        returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)
    {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
        _blockTimestampLast = blockTimestampLast;
    }

    function _update(uint256 balance0, uint256 balance1) private {
        require(balance0 <= type(uint112).max && balance1 <= type(uint112).max, "LiftupPair: overflow");
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = uint32(block.timestamp % 2 ** 32);
        emit Sync(reserve0, reserve1);
    }

    function mint(address to) external nonReentrant returns (uint256 liquidity) {
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves();
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - _reserve0;
        uint256 amount1 = balance1 - _reserve1;

        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) {
            liquidity = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(address(0xdead), MINIMUM_LIQUIDITY); // permanently lock
        } else {
            liquidity = Math.min(
                (amount0 * _totalSupply) / _reserve0,
                (amount1 * _totalSupply) / _reserve1
            );
        }
        require(liquidity > 0, "LiftupPair: insufficient liquidity minted");
        _mint(to, liquidity);
        _update(balance0, balance1);
        emit Mint(msg.sender, amount0, amount1);
    }

    function burn(address to) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 liquidity = balanceOf(address(this));

        uint256 _totalSupply = totalSupply();
        amount0 = (liquidity * balance0) / _totalSupply;
        amount1 = (liquidity * balance1) / _totalSupply;
        require(amount0 > 0 && amount1 > 0, "LiftupPair: insufficient liquidity burned");

        _burn(address(this), liquidity);
        _safeTransfer(token0, to, amount0);
        _safeTransfer(token1, to, amount1);

        balance0 = IERC20(token0).balanceOf(address(this));
        balance1 = IERC20(token1).balanceOf(address(this));
        _update(balance0, balance1);

        emit Burn(msg.sender, amount0, amount1, to);
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to) external nonReentrant {
        require(amount0Out > 0 || amount1Out > 0, "LiftupPair: insufficient output amount");
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves();
        require(amount0Out < _reserve0 && amount1Out < _reserve1, "LiftupPair: insufficient liquidity");
        require(to != token0 && to != token1, "LiftupPair: invalid to");

        if (amount0Out > 0) _safeTransfer(token0, to, amount0Out);
        if (amount1Out > 0) _safeTransfer(token1, to, amount1Out);

        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));

        uint256 amount0In = balance0 > _reserve0 - amount0Out ? balance0 - (_reserve0 - amount0Out) : 0;
        uint256 amount1In = balance1 > _reserve1 - amount1Out ? balance1 - (_reserve1 - amount1Out) : 0;
        require(amount0In > 0 || amount1In > 0, "LiftupPair: insufficient input amount");

        {
            uint256 b0Adj = balance0 * FEE_DENOMINATOR - amount0In * (FEE_DENOMINATOR - FEE_NUMERATOR);
            uint256 b1Adj = balance1 * FEE_DENOMINATOR - amount1In * (FEE_DENOMINATOR - FEE_NUMERATOR);
            require(
                b0Adj * b1Adj >= uint256(_reserve0) * uint256(_reserve1) * FEE_DENOMINATOR ** 2,
                "LiftupPair: K"
            );
        }

        // 100% of the LP fee leaves the pool to factory.feeTo() — typically
        // the RewardDistributor contract. The K invariant above already
        // accounts for the fee being removed (mathematically equivalent to
        // V2's "balance adjusted" formula), so transferring the fee out
        // here preserves K exactly. If feeTo is unset (zero), the fee stays
        // in pool and behaves like vanilla V2 (LPs auto-compound).
        address feeRecipient = ILiftupFactory(factory).feeTo();
        if (feeRecipient != address(0)) {
            uint256 feeUnit = FEE_DENOMINATOR - FEE_NUMERATOR;
            uint256 feeAmt0 = (amount0In * feeUnit) / FEE_DENOMINATOR;
            uint256 feeAmt1 = (amount1In * feeUnit) / FEE_DENOMINATOR;
            if (feeAmt0 > 0) {
                _safeTransfer(token0, feeRecipient, feeAmt0);
                balance0 -= feeAmt0;
            }
            if (feeAmt1 > 0) {
                _safeTransfer(token1, feeRecipient, feeAmt1);
                balance1 -= feeAmt1;
            }
        }

        _update(balance0, balance1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    function sync() external nonReentrant {
        _update(
            IERC20(token0).balanceOf(address(this)),
            IERC20(token1).balanceOf(address(this))
        );
    }

    function _safeTransfer(address token, address to, uint256 value) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, value)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "LiftupPair: transfer failed");
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        public
        pure
        returns (uint256 amountOut)
    {
        require(amountIn > 0, "LiftupPair: insufficient input amount");
        require(reserveIn > 0 && reserveOut > 0, "LiftupPair: insufficient liquidity");
        uint256 amountInWithFee = amountIn * FEE_NUMERATOR;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * FEE_DENOMINATOR + amountInWithFee;
        amountOut = numerator / denominator;
    }

    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut)
        public
        pure
        returns (uint256 amountIn)
    {
        require(amountOut > 0, "LiftupPair: insufficient output amount");
        require(reserveIn > 0 && reserveOut > 0, "LiftupPair: insufficient liquidity");
        uint256 numerator = reserveIn * amountOut * FEE_DENOMINATOR;
        uint256 denominator = (reserveOut - amountOut) * FEE_NUMERATOR;
        amountIn = (numerator / denominator) + 1;
    }
}
