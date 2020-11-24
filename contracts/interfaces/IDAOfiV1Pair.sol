// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.7.4;
pragma experimental ABIEncoderV2;

interface IDAOfiV1Pair {
    event Deposit(address indexed sender, uint256 amountBase, uint256 amountQuote, uint256 output, address indexed to);
    event WithdrawFees(address indexed sender, uint256 amountQuote, address indexed to);
    event Withdraw(address indexed sender, uint256 amountBase, uint256 amountQuote, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amountBaseIn,
        uint256 amountQuoteIn,
        uint256 amountBaseOut,
        uint256 amountQuoteOut,
        address indexed to
    );

    function factory() external view returns (address);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function baseToken() external view returns (address);
    function quoteToken() external view returns (address);
    function pairOwner() external view returns (address);
    function m() external view returns (uint32);
    function n() external view returns (uint32);
    function fee() external view returns (uint32);
    function s() external view returns (uint256);
    function initialize(address, address, address, address, address, uint32, uint32, uint32) external;
    function setPairOwner(address) external;
    function getReserves() external view returns (uint256 reserveBase, uint256 reserveQuote, uint32 blockTimestampLast);
    function getCurveParams() external view returns (bytes memory params);
    // function price0CumulativeLast() external view returns (uint256);
    // function price1CumulativeLast() external view returns (uint256);
    function deposit(address to) external returns (uint256 amountBase);
    function withdraw(address to) external returns (uint256 amountBase, uint256 amountQuote);
    function swap(uint256 amountBaseOut, uint256 amountQuoteOut, address to, bytes calldata data) external;
    function getBaseOut(uint256 amountQuoteIn) external view returns (uint256 amountBaseOut);
    function getQuoteOut(uint256 amountBaseIn) external view returns (uint256 amountQuoteOut);
    function getBaseIn(uint256 amountQuoteOut) external view returns (uint256 amountBaseIn);
    function getQuoteIn(uint256 amountBaseOut) external view returns (uint256 amountQuoteIn);
}
