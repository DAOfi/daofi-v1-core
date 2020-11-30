// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.7.4;
pragma experimental ABIEncoderV2;

import 'hardhat/console.sol';
import './interfaces/IDAOfiV1Callee.sol';
import './interfaces/IDAOfiV1Factory.sol';
import './interfaces/IDAOfiV1Pair.sol';
import './interfaces/IERC20.sol';
import './libraries/Math.sol';
import './libraries/SafeMath.sol';
import './Power.sol';

contract DAOfiV1Pair is IDAOfiV1Pair, Power {
    using SafeMath for int;
    using SafeMath for uint;
    using SafeMath for uint8;
    using SafeMath for uint32;
    using SafeMath for uint256;

    uint32 public constant SLOPE_DENOM = 10**6; // used to divide slope m
    uint256 public constant MAX_SLOPE = SLOPE_DENOM * 3; // y = mx ** n, cap m to 3
    uint256 public constant MAX_FEE = 10; // 1%
    uint256 public constant MAX_N = 3; // y = mx ** n, cap n to 3
    bytes4 private constant SELECTOR = bytes4(keccak256(bytes('transfer(address,uint256)')));
    int8 private constant INTERNAL_DECIMALS = 6;
    uint private constant INTERNAL_CEIL = 10 ** 5;
    int8 private constant S_DECIMALS = 3;
    uint private constant S_CEIL = 10 ** 2;
    address public override factory;
    address public override token0;
    address public override token1;
    // uint256 public override price0CumulativeLast;
    // uint256 public override price1CumulativeLast;
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
    int8 private baseDecimals;
    int8 private quoteDecimals;

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

    function _roundDiv(uint256 _n, uint256 _d) internal pure returns (uint256) {
        return _n / _d + (_n % _d) / (_d - _d / 2);
    }

    function _convertToDecimals(uint256 amountIn, int8 from, int8 to) internal pure returns (uint256 amountOut) {
        amountOut = amountIn;
        if (amountIn > 0) {
            int8 diff = to - from;
            // expand or contract resolution
            uint factor = (10 ** Math.abs(diff));
            if (diff < 0) {
                amountOut = _roundDiv(amountIn, factor);
            } else if (diff > 0 ) {
                amountOut = amountIn * factor;
            }
        }
    }

    function _power(uint256 bN, uint256 bD, uint32 eN, uint32 eD) internal view returns (uint256) {
        (uint256 result, uint32 precision) = power(bN, bD, eN, eD);
        return (result >> precision);
    }

    function setPairOwner(address _nextOwner) external override {
        require(msg.sender == pairOwner, 'DAOfiV1: FORBIDDEN');
        pairOwner = _nextOwner;
    }

    function deposit(address to) external override lock returns (uint256 amountBaseOut) {
        require(msg.sender == router, 'DAOfiV1: FORBIDDEN');
        require(deposited == false, 'DAOfiV1: DOUBLE_DEPOSIT');
        baseDecimals = int8(IERC20(baseToken).decimals());
        quoteDecimals = int8(IERC20(quoteToken).decimals());
        reserveBase = IERC20(baseToken).balanceOf(address(this));
        reserveQuote = IERC20(quoteToken).balanceOf(address(this));
        // set initial s from quoteReserve
        // quoteReserve = (slopeN * (s ** (n + 1))) / (slopeD * (n + 1))
        // solve for s
        // s = ((quoteReserve * slopeD * (n + 1)) / slopeN) ** (1 / (n + 1))
        if (reserveQuote > 0) {
            uint256 scaledQuote = _convertToDecimals(reserveQuote, quoteDecimals, INTERNAL_DECIMALS);
            s = Math.ceil(
                _power(scaledQuote.mul(SLOPE_DENOM).mul(n + 1), m, uint32(1), (n + 1)),
                S_CEIL
            );
        }
        if (s > 0) {
            amountBaseOut = _convertToDecimals(s, S_DECIMALS, baseDecimals);
            // send s initial base to the specified address
            _safeTransfer(baseToken, to, amountBaseOut);
            // update reserves
            reserveBase = reserveBase.sub(amountBaseOut);
        }

        // this function is locked and the contract can not reset reserves
        deposited = true;

        emit Deposit(msg.sender, reserveBase, reserveQuote, amountBaseOut, to);
    }

    function withdraw(address to) external override lock returns (uint256 amountBase, uint256 amountQuote) {
        require(msg.sender == router, 'DAOfiV1: FORBIDDEN');
        require(deposited, 'DAOfiV1: UNINITIALIZED');
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
        require(deposited, 'DAOfiV1: UNINITIALIZED');
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
            s = s.add(_convertToDecimals(amountBaseOut, baseDecimals, S_DECIMALS));
            reserveQuote = reserveQuote.add(amountInWithFee);
            reserveBase = reserveBase.sub(amountBaseOut);
            feesQuote = feesQuote.add(amountQuoteIn).sub(amountInWithFee);
        }
        // now trade base to quote
        if (amountBaseIn > 0) {
            uint256 amountInWithFee = amountBaseIn.mul(1000 - fee) / 1000;
            require(getQuoteOut(amountInWithFee) == amountQuoteOut, 'DAOfiV1: INVALID_QUOTE_OUTPUT');
            s = s.sub(_convertToDecimals(amountInWithFee, baseDecimals, S_DECIMALS));
            reserveQuote = reserveQuote.sub(amountQuoteOut);
            reserveBase = reserveBase.add(amountInWithFee);
            feesBase = feesBase.add(amountBaseIn).sub(amountInWithFee);
        }

        require(_convertToDecimals(s, INTERNAL_DECIMALS, baseDecimals) <= IERC20(baseToken).totalSupply(), 'DAOfiV1: INSUFFICIENT_SUPPLY');

        emit Swap(msg.sender, amountBaseIn, amountQuoteIn, amountBaseOut, amountQuoteOut, to);
    }



    function basePrice() public view override returns (uint256 price)
    {
        require(deposited, 'DAOfiV1: UNINITIALIZED');
        // y = mx^n, where x = token supply s
        uint256 result = _power(s, uint256(1), n, uint32(1));
        price = _convertToDecimals(
            Math.ceil(_roundDiv(result.mul(m), SLOPE_DENOM), S_CEIL),
            S_DECIMALS,
            quoteDecimals
        );
    }

    function quotePrice() public view override returns (uint256 price)
    {
        require(deposited, 'DAOfiV1: UNINITIALIZED');
        price = getBaseOut(10 ** uint(quoteDecimals));
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
        amountBaseOut = _convertToDecimals(
            Math.ceil(result.sub(s), S_CEIL),
            S_DECIMALS,
            baseDecimals
        );
    }

    function getQuoteOut(uint256 amountBaseIn) public view override returns (uint256 amountQuoteOut)
    {
        amountBaseIn = _convertToDecimals(amountBaseIn, baseDecimals, S_DECIMALS);
        if (s <= amountBaseIn) {
            // return all the quote
            amountQuoteOut = reserveQuote;
        } else if (s > amountBaseIn) {
            uint256 result = _power(
                s.sub(amountBaseIn),
                uint256(1),
                (n + 1),
                uint32(1)
            );
            amountQuoteOut = reserveQuote.sub(_convertToDecimals(
                Math.ceil(_roundDiv(result.mul(m), SLOPE_DENOM.mul(n + 1)), INTERNAL_CEIL),
                INTERNAL_DECIMALS,
                quoteDecimals
            ));
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
        amountBaseIn = _convertToDecimals(
            Math.ceil(s.sub(result), S_CEIL),
            S_DECIMALS,
            baseDecimals
        );
    }

    function getQuoteIn(uint256 amountBaseOut) public view override returns (uint256 amountQuoteIn)
    {
        amountBaseOut = _convertToDecimals(amountBaseOut, baseDecimals, S_DECIMALS);
        uint256 result = _power(
            s.add(amountBaseOut),
            uint256(1),
            (n + 1),
            uint32(1)
        );
        uint256 reserveAtSupply = _convertToDecimals(
            Math.ceil(_roundDiv(result.mul(m), SLOPE_DENOM.mul(n + 1)), INTERNAL_CEIL),
            INTERNAL_DECIMALS,
            quoteDecimals
        );
        if (reserveAtSupply >= reserveQuote) {
            amountQuoteIn = reserveAtSupply.sub(reserveQuote);
        }
    }
}
