pragma solidity =0.6.6;
pragma experimental ABIEncoderV2;

interface IDAOfiV1Callee {
    function daofiV1Call(address sender, uint256 amountBaseOut, uint256 amountQuoteOut, bytes calldata data) external;
}
