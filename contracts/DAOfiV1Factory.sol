// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.7.4;
pragma experimental ABIEncoderV2;

import './interfaces/IDAOfiV1Factory.sol';
import './DAOfiV1Pair.sol';

contract DAOfiV1Factory is IDAOfiV1Factory {
    mapping(address => mapping(address => mapping(bytes => address))) public override pairs;
    address[] public override allPairs;
    address public override formula;

    constructor(address _formula) {
        formula = _formula;
    }

    function getPair(address token0, address token1, uint32 reserveRatio, uint32 fee)
        public override view returns (address pair)
    {
        return pairs[token0][token1][abi.encode(reserveRatio, fee)];
    }

    function allPairsLength() external override view returns (uint) {
        return allPairs.length;
    }

    function createPair(
        address router,
        address tokenA,
        address tokenB,
        address baseToken,
        address pairOwner,
        uint32 reserveRatio,
        uint32 fee
    ) external override returns (address pair) {
        require(tokenA != tokenB, 'DAOfiV1: IDENTICAL_ADDRESSES');
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), 'DAOfiV1: ZERO_ADDRESS');
        require(getPair(token0, token1, reserveRatio, fee) == address(0), 'DAOfiV1: PAIR_EXISTS'); // single check is sufficient
        bytes memory bytecode = type(DAOfiV1Pair).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(token0, token1, reserveRatio, fee));
        assembly {
            pair := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        IDAOfiV1Pair(pair).initialize(router, token0, token1, baseToken, pairOwner, reserveRatio, fee);
        pairs[token0][token1][abi.encode(reserveRatio, fee)] = pair;
        pairs[token1][token0][abi.encode(reserveRatio, fee)] = pair; // populate mapping in the reverse direction
        allPairs.push(pair);
        emit PairCreated(token0, token1, baseToken, pairOwner, reserveRatio, fee, pair, allPairs.length);
    }
}
