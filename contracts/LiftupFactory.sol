// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./LiftupPair.sol";

/**
 * @title LiftupFactory
 * @notice Factory contract for creating LiftupPair pools.
 *         Forked from ChordSwap's ArcFactory (MIT).
 */
contract LiftupFactory {
    address public feeTo;
    address public feeToSetter;

    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint256 pairIndex);

    constructor(address _feeToSetter) {
        feeToSetter = _feeToSetter;
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "LiftupFactory: identical addresses");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "LiftupFactory: zero address");
        require(getPair[token0][token1] == address(0), "LiftupFactory: pair exists");

        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        LiftupPair newPair = new LiftupPair{salt: salt}(token0, token1);
        pair = address(newPair);

        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function setFeeTo(address _feeTo) external {
        require(msg.sender == feeToSetter, "LiftupFactory: forbidden");
        feeTo = _feeTo;
    }

    function setFeeToSetter(address _feeToSetter) external {
        require(msg.sender == feeToSetter, "LiftupFactory: forbidden");
        feeToSetter = _feeToSetter;
    }

    function getPairAddress(address tokenA, address tokenB) external view returns (address) {
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        return getPair[token0][token1];
    }

    function getAllPairs() external view returns (address[] memory) {
        return allPairs;
    }
}
