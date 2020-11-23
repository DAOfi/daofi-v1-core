// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.7.4;
pragma experimental ABIEncoderV2;

import './libraries/SafeMath.sol';

/**
 * bancor formula by bancor
 * https://github.com/bancorprotocol/contracts
 * Modified from the original by Slava Balasanov
 * Split Power.sol out from BancorFormula.sol
 * Licensed to the Apache Software Foundation (ASF) under one or more contributor license agreements;
 * and to You under the Apache License, Version 2.0. "
 */

contract Power {
    using SafeMath  for uint8;
    using SafeMath  for uint32;
    using SafeMath  for uint256;

    uint256 private constant ONE = 1;
    uint8 private constant MIN_PRECISION = 32;
    uint8 private constant MAX_PRECISION = 64;

    /*
      The values below depend on MAX_PRECISION. If you choose to change it:
      Apply the same change in file 'PrintIntScalingFactors.py', run it and paste the results below.
    */
    uint256 private constant FIXED_1 = 0x0000000000000000000000000000000010000000000000000;
    uint256 private constant FIXED_2 = 0x0000000000000000000000000000000020000000000000000;
    uint256 private constant MAX_NUM = 0x1000000000000000000000000000000000000000000000000;

    /*
      The values below depend on MAX_PRECISION. If you choose to change it:
      Apply the same change in file 'PrintLn2ScalingFactors.py', run it and paste the results below.
    */
    uint256 private constant LN2_NUMERATOR   = 0x15555555555555555571c71c71c71c71c71c97b425ed097;
    uint256 private constant LN2_DENOMINATOR = 0x1ec709dc3a03fd749fea5e8537278fbe180e779a2bdb192;


    /*
      The values below depend on MIN_PRECISION and MAX_PRECISION. If you choose to change either one of them:
      Apply the same change in file 'PrintMaxExpArray.py', run it and paste the results below.
    */
    uint256[128] private maxExpArray;

    constructor() {
        //  maxExpArray[ 0] = 0xd7ffffffffffffffff;
        //  maxExpArray[ 1] = 0xcfffffffffffffffff;
        //  maxExpArray[ 2] = 0xc6ffffffffffffffff;
        //  maxExpArray[ 3] = 0xbedfffffffffffffff;
        //  maxExpArray[ 4] = 0xb6efffffffffffffff;
        //  maxExpArray[ 5] = 0xaf67ffffffffffffff;
        //  maxExpArray[ 6] = 0xa833ffffffffffffff;
        //  maxExpArray[ 7] = 0xa145ffffffffffffff;
        //  maxExpArray[ 8] = 0x9aa2ffffffffffffff;
        //  maxExpArray[ 9] = 0x94467fffffffffffff;
        //  maxExpArray[10] = 0x8e2cbfffffffffffff;
        //  maxExpArray[11] = 0x88535fffffffffffff;
        //  maxExpArray[12] = 0x82b78fffffffffffff;
        //  maxExpArray[13] = 0x7d56e7ffffffffffff;
        //  maxExpArray[14] = 0x782ee3ffffffffffff;
        //  maxExpArray[15] = 0x733d2dffffffffffff;
        //  maxExpArray[16] = 0x6e7f88ffffffffffff;
        //  maxExpArray[17] = 0x69f3d1ffffffffffff;
        //  maxExpArray[18] = 0x6597fabfffffffffff;
        //  maxExpArray[19] = 0x616a0affffffffffff;
        //  maxExpArray[20] = 0x5d681f3fffffffffff;
        //  maxExpArray[21] = 0x5990681fffffffffff;
        //  maxExpArray[22] = 0x55e12903ffffffffff;
        //  maxExpArray[23] = 0x5258b7bbffffffffff;
        //  maxExpArray[24] = 0x4ef57b9bffffffffff;
        //  maxExpArray[25] = 0x4bb5eccaffffffffff;
        //  maxExpArray[26] = 0x4898938cbfffffffff;
        //  maxExpArray[27] = 0x459c079abfffffffff;
        //  maxExpArray[28] = 0x42beef808fffffffff;
        //  maxExpArray[29] = 0x3fffffffffffffffff;
        //  maxExpArray[30] = 0x3d5dfb7b57ffffffff;
        //  maxExpArray[31] = 0x3ad7b165d7ffffffff;
        maxExpArray[32] = 0x386bfdba29ffffffff;
        maxExpArray[33] = 0x3619c876647fffffff;
        maxExpArray[34] = 0x33e0051d83ffffffff;
        maxExpArray[35] = 0x31bdb23e1cffffffff;
        maxExpArray[36] = 0x2fb1d8fe082fffffff;
        maxExpArray[37] = 0x2dbb8caad9b7ffffff;
        maxExpArray[38] = 0x2bd9ea4eed43ffffff;
        maxExpArray[39] = 0x2a0c184ad965ffffff;
        maxExpArray[40] = 0x285145f31ae5ffffff;
        maxExpArray[41] = 0x26a8ab31cb847fffff;
        maxExpArray[42] = 0x2511882c39c3bfffff;
        maxExpArray[43] = 0x238b24ec38ccdfffff;
        maxExpArray[44] = 0x2214d10d014eafffff;
        maxExpArray[45] = 0x20ade36b7dbeefffff;
        maxExpArray[46] = 0x1f55b9d9ddff17ffff;
        maxExpArray[47] = 0x1e0bb8d64fdb5bffff;
        maxExpArray[48] = 0x1ccf4b44bb4820ffff;
        maxExpArray[49] = 0x1b9fe22b629ddbffff;
        maxExpArray[50] = 0x1a7cf4724862473fff;
        maxExpArray[51] = 0x1965fea53d6e3c9fff;
        maxExpArray[52] = 0x185a82b87b72e95fff;
        maxExpArray[53] = 0x175a07cfb107ed37ff;
        maxExpArray[54] = 0x16641a07658687abff;
        maxExpArray[55] = 0x15784a409c05051bff;
        maxExpArray[56] = 0x14962dee9dc97640ff;
        maxExpArray[57] = 0x13bd5ee6d583ead3ff;
        maxExpArray[58] = 0x12ed7b32a58f552aff;
        maxExpArray[59] = 0x122624e3245d54c0df;
        maxExpArray[60] = 0x116701e6ab0cd188df;
        maxExpArray[61] = 0x10afbbe022fdf442b7;
        maxExpArray[62] = 0x0fffffffffffffffff;
        maxExpArray[63] = 0x0f577eded5773a10ff;
        maxExpArray[64] = 0x0eb5ec597592befbf4;
    }


    /**
      General Description:
          Determine a value of precision.
          Calculate an integer approximation of (_baseN / _baseD) ^ (_expN / _expD) * 2 ^ precision.
          Return the result along with the precision used.

      Detailed Description:
          Instead of calculating "base ^ exp", we calculate "e ^ (ln(base) * exp)".
          The value of "ln(base)" is represented with an integer slightly smaller than "ln(base) * 2 ^ precision".
          The larger "precision" is, the more accurately this value represents the real value.
          However, the larger "precision" is, the more bits are required in order to store this value.
          And the exponentiation function, which takes "x" and calculates "e ^ x", is limited to a maximum exponent (maximum value of "x").
          This maximum exponent depends on the "precision" used, and it is given by "maxExpArray[precision] >> (MAX_PRECISION - precision)".
          Hence we need to determine the highest precision which can be used for the given input, before calling the exponentiation function.
          This allows us to compute "base ^ exp" with maximum accuracy and without exceeding 256 bits in any of the intermediate computations.
  */
    function power(uint256 _baseN, uint256 _baseD, uint32 _expN, uint32 _expD) internal view returns (uint256, uint8) {
        uint256 lnBaseTimesExp = ln(_baseN, _baseD) * _expN / _expD;
        uint8 precision = findPositionInMaxExpArray(lnBaseTimesExp);
        return (fixedExp(lnBaseTimesExp >> (MAX_PRECISION - precision), precision), precision);
    }

    /**
      Return floor(ln(numerator / denominator) * 2 ^ MAX_PRECISION), where:
      - The numerator   is a value between 1 and 2 ^ (256 - MAX_PRECISION) - 1
      - The denominator is a value between 1 and 2 ^ (256 - MAX_PRECISION) - 1
      - The output      is a value between 0 and floor(ln(2 ^ (256 - MAX_PRECISION) - 1) * 2 ^ MAX_PRECISION)
      This functions assumes that the numerator is larger than or equal to the denominator, because the output would be negative otherwise.
    */
    function ln(uint256 _numerator, uint256 _denominator) internal pure returns (uint256) {
        require(_numerator <= MAX_NUM, 'Power: power numerator > MAX_NUM');

        uint256 res = 0;
        uint256 x = _numerator * FIXED_1 / _denominator;

        // If x >= 2, then we compute the integer part of log2(x), which is larger than 0.
        if (x >= FIXED_2) {
          uint8 count = floorLog2(x / FIXED_1);
          x >>= count; // now x < 2
          res = count * FIXED_1;
        }

        // If x > 1, then we compute the fraction part of log2(x), which is larger than 0.
        if (x > FIXED_1) {
          for (uint8 i = MAX_PRECISION; i > 0; --i) {
            x = (x * x) / FIXED_1; // now 1 < x < 4
            if (x >= FIXED_2) {
              x >>= 1; // now 1 < x < 2
              res += ONE << (i - 1);
            }
          }
        }

        return (res * LN2_NUMERATOR) / LN2_DENOMINATOR;
    }

    /**
      Compute the largest integer smaller than or equal to the binary logarithm of the input.
    */
    function floorLog2(uint256 _n) internal pure returns (uint8) {
        uint8 res = 0;
        uint256 n = _n;

        if (n < 256) {
          // At most 8 iterations
          while (n > 1) {
            n >>= 1;
            res += 1;
          }
        } else {
          // Exactly 8 iterations
          for (uint8 s = 128; s > 0; s >>= 1) {
            if (n >= (ONE << s)) {
              n >>= s;
              res |= s;
            }
          }
        }

        return res;
    }

    /**
        The global "maxExpArray" is sorted in descending order, and therefore the following statements are equivalent:
        - This function finds the position of [the smallest value in "maxExpArray" larger than or equal to "x"]
        - This function finds the highest position of [a value in "maxExpArray" larger than or equal to "x"]
    */
    function findPositionInMaxExpArray(uint256 _x) internal view returns (uint8) {
        uint8 lo = MIN_PRECISION;
        uint8 hi = MAX_PRECISION;

        while (lo + 1 < hi) {
          uint8 mid = (lo + hi) / 2;
          if (maxExpArray[mid] >= _x)
            lo = mid;
          else
            hi = mid;
        }

        if (maxExpArray[hi] >= _x)
            return hi;
        if (maxExpArray[lo] >= _x)
            return lo;

        assert(false);
        return 0;
    }

    /**
        This function can be auto-generated by the script 'PrintFunctionFixedExp.py'.
        It approximates "e ^ x" via maclaurin summation: "(x^0)/0! + (x^1)/1! + ... + (x^n)/n!".
        It returns "e ^ (x / 2 ^ precision) * 2 ^ precision", that is, the result is upshifted for accuracy.
        The global "maxExpArray" maps each "precision" to "((maximumExponent + 1) << (MAX_PRECISION - precision)) - 1".
        The maximum permitted value for "x" is therefore given by "maxExpArray[precision] >> (MAX_PRECISION - precision)".
    */
    function fixedExp(uint256 _x, uint8 _precision) internal pure returns (uint256) {
        uint256 xi = _x;
        uint256 res = 0;

        xi = (xi * _x) >> _precision;
        res += xi * 0x03442c4e6074a82f1797f72ac0000000; // add x^2 * (33! / 2!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x0116b96f757c380fb287fd0e40000000; // add x^3 * (33! / 3!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x0045ae5bdd5f0e03eca1ff4390000000; // add x^4 * (33! / 4!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x000defabf91302cd95b9ffda50000000; // add x^5 * (33! / 5!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x0002529ca9832b22439efff9b8000000; // add x^6 * (33! / 6!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x000054f1cf12bd04e516b6da88000000; // add x^7 * (33! / 7!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x00000a9e39e257a09ca2d6db51000000; // add x^8 * (33! / 8!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x0000012e066e7b839fa050c309000000; // add x^9 * (33! / 9!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x0000001e33d7d926c329a1ad1a800000; // add x^10 * (33! / 10!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x00000002bee513bdb4a6b19b5f800000; // add x^11 * (33! / 11!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x000000003a9316fa79b88eccf2a00000; // add x^12 * (33! / 12!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x00000000048177ebe1fa812375200000; // add x^13 * (33! / 13!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x00000000005263fe90242dcbacf00000; // add x^14 * (33! / 14!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x0000000000057e22099c030d94100000; // add x^15 * (33! / 15!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x00000000000057e22099c030d9410000; // add x^16 * (33! / 16!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x000000000000052b6b54569976310000; // add x^17 * (33! / 17!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x000000000000004985f67696bf748000; // add x^18 * (33! / 18!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x0000000000000003dea12ea99e498000; // add x^19 * (33! / 19!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x000000000000000031880f2214b6e000; // add x^20 * (33! / 20!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x0000000000000000025bcff56eb36000; // add x^21 * (33! / 21!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x0000000000000000001b722e10ab1000; // add x^22 * (33! / 22!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x00000000000000000001317c70077000; // add x^23 * (33! / 23!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x000000000000000000000cba84aafa00; // add x^24 * (33! / 24!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x000000000000000000000082573a0a00; // add x^25 * (33! / 25!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x000000000000000000000005035ad900; // add x^26 * (33! / 26!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x0000000000000000000000002f881b00; // add x^27 * (33! / 27!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x00000000000000000000000001b29340; // add x^28 * (33! / 28!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x000000000000000000000000000efc40; // add x^29 * (33! / 29!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x00000000000000000000000000007fe0; // add x^30 * (33! / 30!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x00000000000000000000000000000420; // add x^31 * (33! / 31!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x00000000000000000000000000000021; // add x^32 * (33! / 32!)
        xi = (xi * _x) >> _precision;
        res += xi * 0x00000000000000000000000000000001; // add x^33 * (33! / 33!)

        return res / 0x688589cc0e9505e2f2fee5580000000 + _x + (ONE << _precision); // divide by 33! and then add x^1 / 1! + x^0 / 0!
    }
}
