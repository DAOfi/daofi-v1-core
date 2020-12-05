// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.7.4;
pragma experimental ABIEncoderV2;

interface IDAOfiV1Callee {
    function daofiV1Call(address sender, address tokenIn, address tokenOut, uint256 amountOut, bytes calldata data) external;
}
