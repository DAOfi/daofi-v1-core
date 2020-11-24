// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.7.4;
pragma experimental ABIEncoderV2;

import './libraries/SafeMath.sol';

/**
 * bancor formula by bancor
 * https://github.com/bancorprotocol/contracts
 * Modified from the original by Slava Balasanov
 * Further modified by Alex Lewis
 * Split Power.sol out from BancorFormula.sol
 * Licensed to the Apache Software Foundation (ASF) under one or more contributor license agreements;
 * and to You under the Apache License, Version 2.0. "
 */

contract Power {
    using SafeMath  for uint8;
    using SafeMath  for uint32;
    using SafeMath  for uint256;

    uint256 private constant ONE = 1;
    uint8 private constant MIN_PRECISION = 8;
    uint8 private constant MAX_PRECISION = 107;

    /*
      The values below depend on MAX_PRECISION. If you choose to change it:
      Apply the same change in file 'PrintIntScalingFactors.py', run it and paste the results below.
    */
    uint256 private constant FIXED_1 = 0x00000000000800000000000000000000000000;
    uint256 private constant FIXED_2 = 0x00000000001000000000000000000000000000;
    uint256 private constant MAX_NUM = 0x20000000000000000000000000000000000000;

    /*
      The values below depend on MAX_PRECISION. If you choose to change it:
      Apply the same change in file 'PrintLn2ScalingFactors.py', run it and paste the results below.
    */
    uint256 private constant LN2_NUMERATOR   = 0x36fad87bb4671655e7f24149e112f20933a5;
    uint256 private constant LN2_DENOMINATOR = 0x4f51b5c2bb50b9df3ef088f0b69983850eb2;

    /*
      The values below depend on MIN_PRECISION and MAX_PRECISION. If you choose to change either one of them:
      Apply the same change in file 'PrintMaxExpArray.py', run it and paste the results below.
    */
    uint256[128] private maxExpArray;

    constructor() {
        // maxExpArray[  0] = 0x6bfffffffffffffffffffffffffff;
        // maxExpArray[  1] = 0x67fffffffffffffffffffffffffff;
        // maxExpArray[  2] = 0x637ffffffffffffffffffffffffff;
        // maxExpArray[  3] = 0x5f6ffffffffffffffffffffffffff;
        // maxExpArray[  4] = 0x5b77fffffffffffffffffffffffff;
        // maxExpArray[  5] = 0x57b3fffffffffffffffffffffffff;
        // maxExpArray[  6] = 0x5419fffffffffffffffffffffffff;
        // maxExpArray[  7] = 0x50a2fffffffffffffffffffffffff;
        maxExpArray[  8] = 0x4d517ffffffffffffffffffffffff;
        maxExpArray[  9] = 0x4a233ffffffffffffffffffffffff;
        maxExpArray[ 10] = 0x47165ffffffffffffffffffffffff;
        maxExpArray[ 11] = 0x4429affffffffffffffffffffffff;
        maxExpArray[ 12] = 0x415bc7fffffffffffffffffffffff;
        maxExpArray[ 13] = 0x3eab73fffffffffffffffffffffff;
        maxExpArray[ 14] = 0x3c1771fffffffffffffffffffffff;
        maxExpArray[ 15] = 0x399e96fffffffffffffffffffffff;
        maxExpArray[ 16] = 0x373fc47ffffffffffffffffffffff;
        maxExpArray[ 17] = 0x34f9e8fffffffffffffffffffffff;
        maxExpArray[ 18] = 0x32cbfd5ffffffffffffffffffffff;
        maxExpArray[ 19] = 0x30b5057ffffffffffffffffffffff;
        maxExpArray[ 20] = 0x2eb40f9ffffffffffffffffffffff;
        maxExpArray[ 21] = 0x2cc8340ffffffffffffffffffffff;
        maxExpArray[ 22] = 0x2af09481fffffffffffffffffffff;
        maxExpArray[ 23] = 0x292c5bddfffffffffffffffffffff;
        maxExpArray[ 24] = 0x277abdcdfffffffffffffffffffff;
        maxExpArray[ 25] = 0x25daf6657ffffffffffffffffffff;
        maxExpArray[ 26] = 0x244c49c65ffffffffffffffffffff;
        maxExpArray[ 27] = 0x22ce03cd5ffffffffffffffffffff;
        maxExpArray[ 28] = 0x215f77c047fffffffffffffffffff;
        maxExpArray[ 29] = 0x1ffffffffffffffffffffffffffff;
        maxExpArray[ 30] = 0x1eaefdbdabfffffffffffffffffff;
        maxExpArray[ 31] = 0x1d6bd8b2ebfffffffffffffffffff;
        maxExpArray[ 32] = 0x1c35fedd14fffffffffffffffffff;
        maxExpArray[ 33] = 0x1b0ce43b323ffffffffffffffffff;
        maxExpArray[ 34] = 0x19f0028ec1fffffffffffffffffff;
        maxExpArray[ 35] = 0x18ded91f0e7ffffffffffffffffff;
        maxExpArray[ 36] = 0x17d8ec7f0417fffffffffffffffff;
        maxExpArray[ 37] = 0x16ddc6556cdbfffffffffffffffff;
        maxExpArray[ 38] = 0x15ecf52776a1fffffffffffffffff;
        maxExpArray[ 39] = 0x15060c256cb2fffffffffffffffff;
        maxExpArray[ 40] = 0x1428a2f98d72fffffffffffffffff;
        maxExpArray[ 41] = 0x13545598e5c23ffffffffffffffff;
        maxExpArray[ 42] = 0x1288c4161ce1dffffffffffffffff;
        maxExpArray[ 43] = 0x11c592761c666ffffffffffffffff;
        maxExpArray[ 44] = 0x110a688680a757fffffffffffffff;
        maxExpArray[ 45] = 0x1056f1b5bedf77fffffffffffffff;
        maxExpArray[ 46] = 0x0faadceceeff8bfffffffffffffff;
        maxExpArray[ 47] = 0x0f05dc6b27edadfffffffffffffff;
        maxExpArray[ 48] = 0x0e67a5a25da4107ffffffffffffff;
        maxExpArray[ 49] = 0x0dcff115b14eedfffffffffffffff;
        maxExpArray[ 50] = 0x0d3e7a392431239ffffffffffffff;
        maxExpArray[ 51] = 0x0cb2ff529eb71e4ffffffffffffff;
        maxExpArray[ 52] = 0x0c2d415c3db974affffffffffffff;
        maxExpArray[ 53] = 0x0bad03e7d883f69bfffffffffffff;
        maxExpArray[ 54] = 0x0b320d03b2c343d5fffffffffffff;
        maxExpArray[ 55] = 0x0abc25204e02828dfffffffffffff;
        maxExpArray[ 56] = 0x0a4b16f74ee4bb207ffffffffffff;
        maxExpArray[ 57] = 0x09deaf736ac1f569fffffffffffff;
        maxExpArray[ 58] = 0x0976bd9952c7aa957ffffffffffff;
        maxExpArray[ 59] = 0x09131271922eaa606ffffffffffff;
        maxExpArray[ 60] = 0x08b380f3558668c46ffffffffffff;
        maxExpArray[ 61] = 0x0857ddf0117efa215bfffffffffff;
        maxExpArray[ 62] = 0x07fffffffffffffffffffffffffff;
        maxExpArray[ 63] = 0x07abbf6f6abb9d087ffffffffffff;
        maxExpArray[ 64] = 0x075af62cbac95f7dfa7ffffffffff;
        maxExpArray[ 65] = 0x070d7fb7452e187ac13ffffffffff;
        maxExpArray[ 66] = 0x06c3390ecc8af379295ffffffffff;
        maxExpArray[ 67] = 0x067c00a3b07ffc01fd6ffffffffff;
        maxExpArray[ 68] = 0x0637b647c39cbb9d3d27fffffffff;
        maxExpArray[ 69] = 0x05f63b1fc104dbd39587fffffffff;
        maxExpArray[ 70] = 0x05b771955b36e12f7235fffffffff;
        maxExpArray[ 71] = 0x057b3d49dda84556d6f6fffffffff;
        maxExpArray[ 72] = 0x054183095b2c8ececf30fffffffff;
        maxExpArray[ 73] = 0x050a28be635ca2b888f77ffffffff;
        maxExpArray[ 74] = 0x04d5156639708c9db33c3ffffffff;
        maxExpArray[ 75] = 0x04a23105873875bd52dfdffffffff;
        maxExpArray[ 76] = 0x0471649d87199aa990756ffffffff;
        maxExpArray[ 77] = 0x04429a21a029d4c1457cfbfffffff;
        maxExpArray[ 78] = 0x0415bc6d6fb7dd71af2cb3fffffff;
        maxExpArray[ 79] = 0x03eab73b3bbfe282243ce1fffffff;
        maxExpArray[ 80] = 0x03c1771ac9fb6b4c18e229fffffff;
        maxExpArray[ 81] = 0x0399e96897690418f785257ffffff;
        maxExpArray[ 82] = 0x0373fc456c53bb779bf0ea9ffffff;
        maxExpArray[ 83] = 0x034f9e8e490c48e67e6ab8bffffff;
        maxExpArray[ 84] = 0x032cbfd4a7adc790560b3337fffff;
        maxExpArray[ 85] = 0x030b50570f6e5d2acca94613fffff;
        maxExpArray[ 86] = 0x02eb40f9f620fda6b56c2861fffff;
        maxExpArray[ 87] = 0x02cc8340ecb0d0f520a6af58fffff;
        maxExpArray[ 88] = 0x02af09481380a0a35cf1ba02fffff;
        maxExpArray[ 89] = 0x0292c5bdd3b92ec810287b1b3ffff;
        maxExpArray[ 90] = 0x0277abdcdab07d5a77ac6d6b9ffff;
        maxExpArray[ 91] = 0x025daf6654b1eaa55fd64df5effff;
        maxExpArray[ 92] = 0x0244c49c648baa98192dce88b7fff;
        maxExpArray[ 93] = 0x022ce03cd5619a311b2471268bfff;
        maxExpArray[ 94] = 0x0215f77c045fbe885654a44a0ffff;
        maxExpArray[ 95] = 0x01fffffffffffffffffffffffffff;
        maxExpArray[ 96] = 0x01eaefdbdaaee7421fc4d3ede5fff;
        maxExpArray[ 97] = 0x01d6bd8b2eb257df7e8ca57b09bff;
        maxExpArray[ 98] = 0x01c35fedd14b861eb0443f7f133ff;
        maxExpArray[ 99] = 0x01b0ce43b322bcde4a56e8ada5aff;
        maxExpArray[100] = 0x019f0028ec1fff007f5a195a39dff;
        maxExpArray[101] = 0x018ded91f0e72ee74f49b15ba527f;
        maxExpArray[102] = 0x017d8ec7f04136f4e5615fd41a63f;
        maxExpArray[103] = 0x016ddc6556cdb84bdc8d12d22e6ff;
        maxExpArray[104] = 0x015ecf52776a1155b5bd8395814f7;
        maxExpArray[105] = 0x015060c256cb23b3b3cc3754cf40f;
        maxExpArray[106] = 0x01428a2f98d728ae223ddab715be3;
        maxExpArray[107] = 0x013545598e5c23276ccf0ede68034;
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
