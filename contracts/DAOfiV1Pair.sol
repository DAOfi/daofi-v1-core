// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.7.4;
pragma experimental ABIEncoderV2;

import '@uniswap/lib/contracts/libraries/FixedPoint.sol';
import './interfaces/IDAOfiV1Callee.sol';
import './interfaces/IDAOfiV1Factory.sol';
import './interfaces/IDAOfiV1Pair.sol';
import './interfaces/IERC20.sol';
import './libraries/ABDKMath64x64.sol';
import './libraries/Math.sol';
import './libraries/SafeMath.sol';
import './Power.sol';

contract DAOfiV1Pair is IDAOfiV1Pair, Power {
    using SafeMath for int;
    using SafeMath for uint;
    using SafeMath for uint8;
    using SafeMath for uint32;
    using SafeMath for uint256;

    uint32 public constant SLOPE_DENOM = 10**5; // used to divide slope m
    uint256 public constant MAX_SLOPE = SLOPE_DENOM * 3; // y = mx ** n, cap m to 3
    uint256 public constant MAX_FEE = 10; // 1%
    uint256 public constant MAX_N = 3; // y = mx ** n, cap n to 3
    bytes4 private constant SELECTOR = bytes4(keccak256(bytes('transfer(address,uint256)')));
    uint8 private constant INTERNAL_DECIMALS = 18;
    uint8 private constant S_DECIMALS = 9;
    address public override factory;
    address public override token0;
    address public override token1;
    uint256 public override price0CumulativeLast;
    uint256 public override price1CumulativeLast;
    address public override baseToken;
    address public override quoteToken;
    address public override pairOwner;
    uint256 public override s; // track base tokens issued
    // price = m(s ** n)
    uint32 public override m; // m / SLOPE_DENOM
    uint32 public override n; //
    uint32 public override fee;

    address private router;
    uint256 private reserveBase;       // uses single storage slot, accessible via getReserves
    uint256 private reserveQuote;      // uses single storage slot, accessible via getReserves
    uint32  public blockTimestampLast; // uses single storage slot, accessible via getReserves
    uint256 private feesBase;
    uint256 private feesQuote;

    bool private deposited = false;
    uint private unlocked = 1;
    uint8 private baseDecimals;
    uint8 private quoteDecimals;

    event Debug(uint256 value);

    modifier lock() {
        require(unlocked == 1, 'DAOfiV1: LOCKED');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    function getReserves() public override view returns (uint256 _reserveBase, uint256 _reserveQuote, uint32 _blockTimestampLast) {
        _reserveBase = reserveBase;
        _reserveQuote = reserveQuote;
        _blockTimestampLast = blockTimestampLast;
    }

    function getCurveParams() public override view returns (bytes memory params) {
        params = abi.encode(pairOwner, baseToken, m, n, fee, s);
    }

    function _safeTransfer(address token, address to, uint256 value) private {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(SELECTOR, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), 'DAOfiV1: TRANSFER_FAILED');
    }

    constructor() {
        factory = msg.sender;
        m = SLOPE_DENOM;
        n = 1;
        fee = 3;
        s = 0;
    }

    // called once by the factory at time of deployment
    function initialize(
        address _router,
        address _token0,
        address _token1,
        address _baseToken,
        address _pairOwner,
        uint32 _slope,
        uint32 _exp,
        uint32 _fee
    ) external override {
        require(msg.sender == factory, 'DAOfiV1: FORBIDDEN'); // sufficient check
        require(_baseToken == _token0 || _baseToken == _token1, 'DAOfiV1: INVALID_BASETOKEN');
        require(_slope >= 1 && _slope <= MAX_SLOPE, 'DAOfiV1: INVALID_SLOPE');
        require(_exp >= 1 && _exp <= MAX_N, 'DAOfiV1: INVALID_EXPONENT');
        require(_fee <= MAX_FEE, 'DAOfiV1: INVALID_FEE');
        router = _router;
        token0 = _token0;
        token1 = _token1;
        baseToken = _baseToken;
        quoteToken = token0 == baseToken ? token1 : token0;
        pairOwner = _pairOwner;
        m = _slope;
        n = _exp;
        fee = _fee;
        s = 0;
    }

        // update reserves and, on the first call per block, price accumulators
    // function _update(uint balance0, uint balance1, uint112 _reserve0, uint112 _reserve1) private {
    //     require(balance0 <= uint112(-1) && balance1 <= uint112(-1), 'UniswapV2: OVERFLOW');
    //     uint32 blockTimestamp = uint32(block.timestamp % 2**32);
    //     uint32 timeElapsed = blockTimestamp - blockTimestampLast; // overflow is desired
    //     if (timeElapsed > 0 && _reserve0 != 0 && _reserve1 != 0) {
    //         // * never overflows, and + overflow is desired
    //         price0CumulativeLast += uint(UQ112x112.encode(_reserve1).uqdiv(_reserve0)) * timeElapsed;
    //         price1CumulativeLast += uint(UQ112x112.encode(_reserve0).uqdiv(_reserve1)) * timeElapsed;
    //     }
    //     reserve0 = uint112(balance0);
    //     reserve1 = uint112(balance1);
    //     blockTimestampLast = blockTimestamp;
    //     emit Sync(reserve0, reserve1);
    // }

    function _fixedDiv(uint256 numer, uint256 denom) private pure returns (uint256) {
        return FixedPoint.decode(
            FixedPoint.fraction(
                uint112(numer),
                uint112(denom)
            )
        );
    }

    function _fixedMul(uint256 x, uint256 y) internal pure returns (uint256 result) {
        result = FixedPoint.decode144(
            FixedPoint.mul(
                FixedPoint.encode(uint112(x)),
                y
            )
        );
    }

    function _convertToDecimals(uint256 amountIn, uint8 from, uint8 to) internal pure returns (uint256 amountOut) {
        amountOut = amountIn;
        if (amountIn > 0) {
            int diff = to - from;
            // expand or contract resolution
            if (diff < 0) {
                amountOut = _fixedDiv(amountIn, (10 ** Math.abs(diff)));
            } else if (diff > 0 ) {
                amountOut = amountIn * (10 ** Math.abs(diff));
            }
        }
    }

    function _power(uint256 bN, uint256 bD, uint32 eN, uint32 eD) private view returns (uint256) {
        if (eN > eD) {
            // whole number exponent, use math64 approximation of x^y
            // x^y = 2^(y log_2(x))
            return uint256(ABDKMath64x64.toUInt(
                ABDKMath64x64.pow(
                    ABDKMath64x64.fromInt(2),
                    _fixedDiv(uint256(eN), uint256(eD)).mul(
                        ABDKMath64x64.toUInt(
                            ABDKMath64x64.log_2(ABDKMath64x64.fromUInt(
                                _fixedDiv(bN, bD)
                            ))
                        )
                    )
                )
            ));
        } else if (eN < eD) {
            // fractional exponent, use bancor approximation of x^y
            // x^y = (bN/bD)^(eN/eD)
            (uint256 result, uint32 precision) = power(bN, bD, eN, eD);
            return (result >> precision);
        }
        return 1;
    }

    function setPairOwner(address _nextOwner) external override {
        require(msg.sender == pairOwner, 'DAOfiV1: FORBIDDEN');
        pairOwner = _nextOwner;
    }

    function deposit(address to) external override lock returns (uint256 amountBase) {
        require(msg.sender == router, 'DAOfiV1: FORBIDDEN');
        require(deposited == false, 'DAOfiV1: DOUBLE_DEPOSIT');
        baseDecimals = IERC20(baseToken).decimals();
        quoteDecimals = IERC20(quoteToken).decimals();
        reserveBase = IERC20(baseToken).balanceOf(address(this));
        reserveQuote = IERC20(quoteToken).balanceOf(address(this));
        // set initial s from quoteReserve
        // quoteReserve = (slopeN * (s ** (n + 1))) / (slopeD * (n + 1))
        // solve for s
        // s = ((quoteReserve * slopeD * (n + 1)) / slopeN) ** (1 / (n + 1))
        if (reserveQuote > 0) {
            uint256 scaledQuote = _convertToDecimals(reserveQuote, quoteDecimals, INTERNAL_DECIMALS);
            s = _power(scaledQuote.mul(SLOPE_DENOM).mul(n + 1), m, uint32(1), (n + 1));
        }

        if (s > 0) {
            amountBase = _convertToDecimals(s, S_DECIMALS, baseDecimals);
            // send s initial base to the specified address
            _safeTransfer(baseToken, to, amountBase);
            // update reserves
            reserveBase = reserveBase.sub(amountBase);
        }

        // this function is locked and the contract can not reset reserves
        deposited = true;
        emit Debug(amountBase);
        emit Deposit(msg.sender, reserveBase, reserveQuote, amountBase, to);
    }

    function withdraw(address to) external override lock returns (uint256 amountBase, uint256 amountQuote) {
        require(msg.sender == router, 'DAOfiV1: FORBIDDEN');
        amountBase = IERC20(baseToken).balanceOf(address(this));
        amountQuote = IERC20(quoteToken).balanceOf(address(this));
        _safeTransfer(baseToken, to, amountBase);
        _safeTransfer(quoteToken, to, amountQuote);
        reserveBase = 0;
        reserveQuote = 0;
        emit Withdraw(msg.sender, amountBase, amountQuote, to);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function swap(uint256 amountBaseOut, uint256 amountQuoteOut, address to, bytes calldata data) external override lock {
        require(amountBaseOut > 0 || amountQuoteOut > 0, 'DAOfiV1: INSUFFICIENT_OUTPUT_AMOUNT');
        (uint256 _reserveBase, uint256 _reserveQuote,)  = getReserves(); // gas savings
        require(amountBaseOut <= _reserveBase && amountQuoteOut <= _reserveQuote, 'DAOfiV1: INSUFFICIENT_LIQUIDITY');

        uint256 balanceBase;
        uint256 balanceQuote;
        { // scope for _token{0,1}, avoids stack too deep errors
        address _tokenBase = baseToken;
        address _tokenQuote = token0 == baseToken ? token1 : token0;
        require(to != _tokenBase && to != _tokenQuote, 'DAOfiV1: INVALID_TO');
        if (amountBaseOut > 0) _safeTransfer(_tokenBase, to, amountBaseOut); // optimistically transfer tokens
        if (amountQuoteOut > 0) _safeTransfer(_tokenQuote, to, amountQuoteOut); // optimistically transfer tokens
        if (data.length > 0) IDAOfiV1Callee(to).daofiV1Call(msg.sender, amountBaseOut, amountQuoteOut, data);
        balanceBase = IERC20(_tokenBase).balanceOf(address(this)).sub(feesBase);
        balanceQuote = IERC20(_tokenQuote).balanceOf(address(this)).sub(feesQuote);
        }
        uint256 amountBaseIn = balanceBase > _reserveBase - amountBaseOut ? balanceBase - (_reserveBase - amountBaseOut) : 0;
        uint256 amountQuoteIn = balanceQuote > _reserveQuote - amountQuoteOut ? balanceQuote - (_reserveQuote - amountQuoteOut) : 0;
        require(amountBaseIn > 0 || amountQuoteIn > 0, 'DAOfiV1: INSUFFICIENT_INPUT_AMOUNT');
        // Check that inputs equal output
        // start with trading quote to base
        if (amountQuoteIn > 0) {
            uint256 amountInWithFee = amountQuoteIn.mul(1000 - fee) / 1000;
            require(getBaseOut(amountInWithFee) == amountBaseOut, 'DAOfiV1: INVALID_BASE_OUTPUT');
            s = s.add(_convertToDecimals(amountBaseOut, baseDecimals, INTERNAL_DECIMALS));
            reserveQuote = reserveQuote.add(amountInWithFee);
            reserveBase = reserveBase.sub(amountBaseOut);
            feesQuote = feesQuote.add(amountQuoteIn).sub(amountInWithFee);
        }
        // now trade base to quote
        if (amountBaseIn > 0) {
            uint256 amountInWithFee = amountBaseIn.mul(1000 - fee) / 1000;
            require(getQuoteOut(amountInWithFee) == amountQuoteOut, 'DAOfiV1: INVALID_QUOTE_OUTPUT');
            s = s.sub(_convertToDecimals(amountInWithFee, baseDecimals, INTERNAL_DECIMALS));
            reserveQuote = reserveQuote.sub(amountQuoteOut);
            reserveBase = reserveBase.add(amountInWithFee);
            feesBase = feesBase.add(amountBaseIn).sub(amountInWithFee);
        }

        require(_convertToDecimals(s, INTERNAL_DECIMALS, baseDecimals) <= IERC20(baseToken).totalSupply(), 'DAOfiV1: INSUFFICIENT_SUPPLY');

        emit Swap(msg.sender, amountBaseIn, amountQuoteIn, amountBaseOut, amountQuoteOut, to);
    }

    function getBaseOut(uint256 amountQuoteIn) public view override returns (uint256 amountBaseOut)
    {
        uint256 scaledReserveQuote = _convertToDecimals(
            reserveQuote.add(amountQuoteIn), quoteDecimals, INTERNAL_DECIMALS
        );
        uint256 result = _power(
            scaledReserveQuote.mul(SLOPE_DENOM).mul(n + 1),
            m,
            uint32(1),
            (n + 1)
        );
        amountBaseOut = _convertToDecimals(result.sub(s), S_DECIMALS, baseDecimals);
    }

    function getQuoteOut(uint256 amountBaseIn) public view override returns (uint256 amountQuoteOut)
    {
        amountBaseIn = _convertToDecimals(amountBaseIn, baseDecimals, 5);
        if (s >= amountBaseIn) {
            uint256 result = _power(
                s.sub(amountBaseIn),
                uint256(1),
                (n + 1),
                uint32(1)
            );
            amountQuoteOut = _convertToDecimals(
                reserveQuote.sub(result.mul(m) / SLOPE_DENOM.mul(n + 1)),
                INTERNAL_DECIMALS,
                quoteDecimals
            );
        }
    }

    function getBaseIn(uint256 amountQuoteOut) public view override returns (uint256 amountBaseIn)
    {
        uint256 scaledReserveQuote = _convertToDecimals(
            reserveQuote.sub(amountQuoteOut), quoteDecimals, INTERNAL_DECIMALS
        );
        uint256 result = _power(
            scaledReserveQuote.mul(SLOPE_DENOM).mul(n + 1),
            m,
            uint32(1),
            (n + 1)
        );
        amountBaseIn = _convertToDecimals(s.sub(result), INTERNAL_DECIMALS, baseDecimals);
    }

    function getQuoteIn(uint256 amountBaseOut) public view override returns (uint256 amountQuoteIn)
    {
        amountBaseOut = _convertToDecimals(amountBaseOut, baseDecimals, INTERNAL_DECIMALS);
        uint256 result = _power(
            s.add(amountBaseOut),
            uint32(1),
            (n + 1),
            uint32(1
        ));
        amountQuoteIn = _convertToDecimals(
            (result.mul(m) / SLOPE_DENOM.mul(n + 1)).sub(reserveQuote),
            INTERNAL_DECIMALS,
            quoteDecimals
        );
        uint256 reserveAtSupply = _fixedDiv(result.mul(m), SLOPE_DENOM.mul(n + 1));
        if (reserveAtSupply >= reserveQuote) {
            amountQuoteIn = _convertToDecimals(
                reserveAtSupply.sub(reserveQuote),
                baseDecimals,
                quoteDecimals
            );
        }
    }
}
