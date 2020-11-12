pragma solidity =0.6.6;
pragma experimental ABIEncoderV2;

import './interfaces/IDAOfiV1Factory.sol';
import './DAOfiV1Pair.sol';

contract DAOfiV1Factory is IDAOfiV1Factory {
    mapping(address => mapping(address => address)) public override getPair;
    address[] public override allPairs;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint);

    constructor() public {
    }

    function allPairsLength() external override view returns (uint) {
        return allPairs.length;
    }

    function createPair(address tokenA, address tokenB, address baseToken, address pairOwner, uint256 m, uint32 n, uint32 fee) external override returns (address pair) {
        require(tokenA != tokenB, 'DAOfiV1: IDENTICAL_ADDRESSES');
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), 'DAOfiV1: ZERO_ADDRESS');
        require(getPair[token0][token1] == address(0), 'DAOfiV1: PAIR_EXISTS'); // single check is sufficient
        bytes memory bytecode = type(DAOfiV1Pair).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        assembly {
            pair := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        IDAOfiV1Pair(pair).initialize(token0, token1, baseToken, pairOwner, m, n, fee);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair; // populate mapping in the reverse direction
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length);
    }
}