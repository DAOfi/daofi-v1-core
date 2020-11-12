pragma solidity =0.6.6;
pragma experimental ABIEncoderV2;

interface IDAOfiV1Pair {
    event Deposit(address indexed sender, uint256 amount0, uint256 amount1, uint256 s);
    event Withdraw(address indexed sender, uint256 amountQuote, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );

    function factory() external view returns (address);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint256 reserve0, uint256 reserve1, uint32 blockTimestampLast);
    function getCurveParams() external view returns (bytes memory params);
    function price0CumulativeLast() external view returns (uint256);
    function price1CumulativeLast() external view returns (uint256);
    function deposit() external;
    function withdraw(address to) external;
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;
    function initialize(address, address, address, address, uint256, uint32, uint32) external;
    function setPairOwner(address) external;
}
