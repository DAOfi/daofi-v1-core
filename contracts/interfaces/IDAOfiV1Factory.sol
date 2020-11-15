pragma solidity =0.6.6;
pragma experimental ABIEncoderV2;

interface IDAOfiV1Factory {
    event PairCreated(
        address indexed token0,
        address indexed token1,
        uint32 m,
        uint32 n,
        uint32 fee,
        address pair,
        uint length
    );

    function getPair(address tokenA, address tokenB, uint32 m, uint32 n, uint32 fee)
        external view returns (address pair);
    function allPairs(uint) external view returns (address pair);
    function allPairsLength() external view returns (uint);
    function createPair(
        address tokenA,
        address tokenB,
        address baseToken,
        address pairOwner,
        uint32 m,
        uint32 n,
        uint32 fee
    ) external returns (address pair);
}
