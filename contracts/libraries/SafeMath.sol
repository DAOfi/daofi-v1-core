// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity =0.7.4;
pragma experimental ABIEncoderV2;

/**
 * @dev This library supports basic math operations with overflow/underflow protection.
 */
library SafeMath {
    /**
     * @dev returns the sum of _x and _y, reverts if the calculation overflows
     *
     * @param _x   value 1
     * @param _y   value 2
     *
     * @return sum
     */
    function add(uint256 _x, uint256 _y) internal pure returns (uint256) {
        uint256 z = _x + _y;
        require(z >= _x, "ERR_OVERFLOW");
        return z;
    }

    /**
     * @dev returns the difference of _x minus _y, reverts if the calculation underflows
     *
     * @param _x   minuend
     * @param _y   subtrahend
     *
     * @return difference
     */
    function sub(uint256 _x, uint256 _y) internal pure returns (uint256) {
        require(_x >= _y, "ERR_UNDERFLOW");
        return _x - _y;
    }

    /**
     * @dev returns the product of multiplying _x by _y, reverts if the calculation overflows
     *
     * @param _x   factor 1
     * @param _y   factor 2
     *
     * @return product
     */
    function mul(uint256 _x, uint256 _y) internal pure returns (uint256) {
        // gas optimization
        if (_x == 0) return 0;

        uint256 z = _x * _y;
        require(z / _x == _y, "ERR_OVERFLOW");
        return z;
    }

    /**
     * @dev Integer division of two numbers truncating the quotient, reverts on division by zero.
     *
     * @param _x   dividend
     * @param _y   divisor
     *
     * @return quotient
     */
    function div(uint256 _x, uint256 _y) internal pure returns (uint256) {
        require(_y > 0, "ERR_DIVIDE_BY_ZERO");
        uint256 c = _x / _y;
        return c;
    }

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
