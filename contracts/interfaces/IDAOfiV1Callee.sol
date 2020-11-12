pragma solidity =0.6.6;
pragma experimental ABIEncoderV2;

interface IDAOfiV1Callee {
    function daofiV1Call(address sender, uint amount0, uint amount1, bytes calldata data) external;
}
