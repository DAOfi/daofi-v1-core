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
    uint8 private constant MIN_PRECISION = 32;
    uint8 private constant MAX_PRECISION = 120;

    /*
      The values below depend on MAX_PRECISION. If you choose to change it:
      Apply the same change in file 'PrintIntScalingFactors.py', run it and paste the results below.
    */
    uint256 private constant FIXED_1 = 0x00001000000000000000000000000000000;
    uint256 private constant FIXED_2 = 0x00002000000000000000000000000000000;
    uint256 private constant MAX_NUM = 0x10000000000000000000000000000000000;

    /*
      The values below depend on MAX_PRECISION. If you choose to change it:
      Apply the same change in file 'PrintLn2ScalingFactors.py', run it and paste the results below.
    */
    uint256 private constant LN2_NUMERATOR   = 0x1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e5;
    uint256 private constant LN2_DENOMINATOR = 0x2b735936e87e1a86872f0ec7a0431dc63;

    /*
      The values below depend on MIN_PRECISION and MAX_PRECISION. If you choose to change either one of them:
      Apply the same change in file 'PrintMaxExpArray.py', run it and paste the results below.
    */
    uint256[121] private maxExpArray;

    constructor() {
    //  maxExpArray[  0] = 0xd7ffffffffffffffffffffffffffffff;
    //  maxExpArray[  1] = 0xcfffffffffffffffffffffffffffffff;
    //  maxExpArray[  2] = 0xc6ffffffffffffffffffffffffffffff;
    //  maxExpArray[  3] = 0xbedfffffffffffffffffffffffffffff;
    //  maxExpArray[  4] = 0xb6efffffffffffffffffffffffffffff;
    //  maxExpArray[  5] = 0xaf67ffffffffffffffffffffffffffff;
    //  maxExpArray[  6] = 0xa833ffffffffffffffffffffffffffff;
    //  maxExpArray[  7] = 0xa145ffffffffffffffffffffffffffff;
    //  maxExpArray[  8] = 0x9aa2ffffffffffffffffffffffffffff;
    //  maxExpArray[  9] = 0x94467fffffffffffffffffffffffffff;
    //  maxExpArray[ 10] = 0x8e2cbfffffffffffffffffffffffffff;
    //  maxExpArray[ 11] = 0x88535fffffffffffffffffffffffffff;
    //  maxExpArray[ 12] = 0x82b78fffffffffffffffffffffffffff;
    //  maxExpArray[ 13] = 0x7d56e7ffffffffffffffffffffffffff;
    //  maxExpArray[ 14] = 0x782ee3ffffffffffffffffffffffffff;
    //  maxExpArray[ 15] = 0x733d2dffffffffffffffffffffffffff;
    //  maxExpArray[ 16] = 0x6e7f88ffffffffffffffffffffffffff;
    //  maxExpArray[ 17] = 0x69f3d1ffffffffffffffffffffffffff;
    //  maxExpArray[ 18] = 0x6597fabfffffffffffffffffffffffff;
    //  maxExpArray[ 19] = 0x616a0affffffffffffffffffffffffff;
    //  maxExpArray[ 20] = 0x5d681f3fffffffffffffffffffffffff;
    //  maxExpArray[ 21] = 0x5990681fffffffffffffffffffffffff;
    //  maxExpArray[ 22] = 0x55e12903ffffffffffffffffffffffff;
    //  maxExpArray[ 23] = 0x5258b7bbffffffffffffffffffffffff;
    //  maxExpArray[ 24] = 0x4ef57b9bffffffffffffffffffffffff;
    //  maxExpArray[ 25] = 0x4bb5eccaffffffffffffffffffffffff;
    //  maxExpArray[ 26] = 0x4898938cbfffffffffffffffffffffff;
    //  maxExpArray[ 27] = 0x459c079abfffffffffffffffffffffff;
    //  maxExpArray[ 28] = 0x42beef808fffffffffffffffffffffff;
    //  maxExpArray[ 29] = 0x3fffffffffffffffffffffffffffffff;
    //  maxExpArray[ 30] = 0x3d5dfb7b57ffffffffffffffffffffff;
    //  maxExpArray[ 31] = 0x3ad7b165d7ffffffffffffffffffffff;
        maxExpArray[ 32] = 0x386bfdba29ffffffffffffffffffffff;
        maxExpArray[ 33] = 0x3619c876647fffffffffffffffffffff;
        maxExpArray[ 34] = 0x33e0051d83ffffffffffffffffffffff;
        maxExpArray[ 35] = 0x31bdb23e1cffffffffffffffffffffff;
        maxExpArray[ 36] = 0x2fb1d8fe082fffffffffffffffffffff;
        maxExpArray[ 37] = 0x2dbb8caad9b7ffffffffffffffffffff;
        maxExpArray[ 38] = 0x2bd9ea4eed43ffffffffffffffffffff;
        maxExpArray[ 39] = 0x2a0c184ad965ffffffffffffffffffff;
        maxExpArray[ 40] = 0x285145f31ae5ffffffffffffffffffff;
        maxExpArray[ 41] = 0x26a8ab31cb847fffffffffffffffffff;
        maxExpArray[ 42] = 0x2511882c39c3bfffffffffffffffffff;
        maxExpArray[ 43] = 0x238b24ec38ccdfffffffffffffffffff;
        maxExpArray[ 44] = 0x2214d10d014eafffffffffffffffffff;
        maxExpArray[ 45] = 0x20ade36b7dbeefffffffffffffffffff;
        maxExpArray[ 46] = 0x1f55b9d9ddff17ffffffffffffffffff;
        maxExpArray[ 47] = 0x1e0bb8d64fdb5bffffffffffffffffff;
        maxExpArray[ 48] = 0x1ccf4b44bb4820ffffffffffffffffff;
        maxExpArray[ 49] = 0x1b9fe22b629ddbffffffffffffffffff;
        maxExpArray[ 50] = 0x1a7cf4724862473fffffffffffffffff;
        maxExpArray[ 51] = 0x1965fea53d6e3c9fffffffffffffffff;
        maxExpArray[ 52] = 0x185a82b87b72e95fffffffffffffffff;
        maxExpArray[ 53] = 0x175a07cfb107ed37ffffffffffffffff;
        maxExpArray[ 54] = 0x16641a07658687abffffffffffffffff;
        maxExpArray[ 55] = 0x15784a409c05051bffffffffffffffff;
        maxExpArray[ 56] = 0x14962dee9dc97640ffffffffffffffff;
        maxExpArray[ 57] = 0x13bd5ee6d583ead3ffffffffffffffff;
        maxExpArray[ 58] = 0x12ed7b32a58f552affffffffffffffff;
        maxExpArray[ 59] = 0x122624e3245d54c0dfffffffffffffff;
        maxExpArray[ 60] = 0x116701e6ab0cd188dfffffffffffffff;
        maxExpArray[ 61] = 0x10afbbe022fdf442b7ffffffffffffff;
        maxExpArray[ 62] = 0x0fffffffffffffffffffffffffffffff;
        maxExpArray[ 63] = 0x0f577eded5773a10ffffffffffffffff;
        maxExpArray[ 64] = 0x0eb5ec597592befbf4ffffffffffffff;
        maxExpArray[ 65] = 0x0e1aff6e8a5c30f5827fffffffffffff;
        maxExpArray[ 66] = 0x0d86721d9915e6f252bfffffffffffff;
        maxExpArray[ 67] = 0x0cf8014760fff803fadfffffffffffff;
        maxExpArray[ 68] = 0x0c6f6c8f8739773a7a4fffffffffffff;
        maxExpArray[ 69] = 0x0bec763f8209b7a72b0fffffffffffff;
        maxExpArray[ 70] = 0x0b6ee32ab66dc25ee46bffffffffffff;
        maxExpArray[ 71] = 0x0af67a93bb508aadadedffffffffffff;
        maxExpArray[ 72] = 0x0a830612b6591d9d9e61ffffffffffff;
        maxExpArray[ 73] = 0x0a14517cc6b9457111eeffffffffffff;
        maxExpArray[ 74] = 0x09aa2acc72e1193b66787fffffffffff;
        maxExpArray[ 75] = 0x0944620b0e70eb7aa5bfbfffffffffff;
        maxExpArray[ 76] = 0x08e2c93b0e33355320eadfffffffffff;
        maxExpArray[ 77] = 0x088534434053a9828af9f7ffffffffff;
        maxExpArray[ 78] = 0x082b78dadf6fbae35e5967ffffffffff;
        maxExpArray[ 79] = 0x07d56e76777fc5044879c3ffffffffff;
        maxExpArray[ 80] = 0x0782ee3593f6d69831c453ffffffffff;
        maxExpArray[ 81] = 0x0733d2d12ed20831ef0a4affffffffff;
        maxExpArray[ 82] = 0x06e7f88ad8a776ef37e1d53fffffffff;
        maxExpArray[ 83] = 0x069f3d1c921891ccfcd5717fffffffff;
        maxExpArray[ 84] = 0x06597fa94f5b8f20ac16666fffffffff;
        maxExpArray[ 85] = 0x0616a0ae1edcba5599528c27ffffffff;
        maxExpArray[ 86] = 0x05d681f3ec41fb4d6ad850c3ffffffff;
        maxExpArray[ 87] = 0x05990681d961a1ea414d5eb1ffffffff;
        maxExpArray[ 88] = 0x055e129027014146b9e37405ffffffff;
        maxExpArray[ 89] = 0x05258b7ba7725d902050f6367fffffff;
        maxExpArray[ 90] = 0x04ef57b9b560fab4ef58dad73fffffff;
        maxExpArray[ 91] = 0x04bb5ecca963d54abfac9bebdfffffff;
        maxExpArray[ 92] = 0x04898938c9175530325b9d116fffffff;
        maxExpArray[ 93] = 0x0459c079aac334623648e24d17ffffff;
        maxExpArray[ 94] = 0x042beef808bf7d10aca948941fffffff;
        maxExpArray[ 95] = 0x03ffffffffffffffffffffffffffffff;
        maxExpArray[ 96] = 0x03d5dfb7b55dce843f89a7dbcbffffff;
        maxExpArray[ 97] = 0x03ad7b165d64afbefd194af6137fffff;
        maxExpArray[ 98] = 0x0386bfdba2970c3d60887efe267fffff;
        maxExpArray[ 99] = 0x03619c87664579bc94add15b4b5fffff;
        maxExpArray[100] = 0x033e0051d83ffe00feb432b473bfffff;
        maxExpArray[101] = 0x031bdb23e1ce5dce9e9362b74a4fffff;
        maxExpArray[102] = 0x02fb1d8fe0826de9cac2bfa834c7ffff;
        maxExpArray[103] = 0x02dbb8caad9b7097b91a25a45cdfffff;
        maxExpArray[104] = 0x02bd9ea4eed422ab6b7b072b029effff;
        maxExpArray[105] = 0x02a0c184ad96476767986ea99e81ffff;
        maxExpArray[106] = 0x0285145f31ae515c447bb56e2b7c7fff;
        maxExpArray[107] = 0x026a8ab31cb8464ed99e1dbcd0069fff;
        maxExpArray[108] = 0x02511882c39c3adea96fec2102329fff;
        maxExpArray[109] = 0x0238b24ec38ccd54c83ab403481e2fff;
        maxExpArray[110] = 0x02214d10d014ea60a2be7cdcd9fb9bff;
        maxExpArray[111] = 0x020ade36b7dbeeb8d79659d15da851ff;
        maxExpArray[112] = 0x01f55b9d9ddff141121e70ebe0104eff;
        maxExpArray[113] = 0x01e0bb8d64fdb5a60c7114c01ed7417f;
        maxExpArray[114] = 0x01ccf4b44bb4820c7bc292bab6319b7f;
        maxExpArray[115] = 0x01b9fe22b629ddbbcdf8754a6a7e5c9f;
        maxExpArray[116] = 0x01a7cf47248624733f355c5c1f0d1f1f;
        maxExpArray[117] = 0x01965fea53d6e3c82b05999ab43dc4df;
        maxExpArray[118] = 0x0185a82b87b72e956654a3081816cfdb;
        maxExpArray[119] = 0x0175a07cfb107ed35ab61430c309c0d7;
        maxExpArray[120] = 0x016641a07658687a905357ac0ebe198b;
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
