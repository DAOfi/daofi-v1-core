// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity =0.7.4;
pragma experimental ABIEncoderV2;

library Math {
    /**
     * @dev returns the number of decimal digits in a given positive integer
     *
     * @param _x   positive integer
     *
     * @return the number of decimal digits in the given positive integer
     */
    function decimalLength(uint256 _x) internal pure returns (uint256) {
        uint256 y = 0;
        for (uint256 x = _x; x > 0; x /= 10) y++;
        return y;
    }
}
