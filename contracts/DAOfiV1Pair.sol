// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.7.4;
pragma experimental ABIEncoderV2;

import '@daofi/bancor/solidity/contracts/converter/interfaces/IBancorFormula.sol';
import 'hardhat/console.sol';
import './interfaces/IDAOfiV1Callee.sol';
import './interfaces/IDAOfiV1Factory.sol';
import './interfaces/IDAOfiV1Pair.sol';
import './interfaces/IERC20.sol';
import "./libraries/SafeMath.sol";

contract DAOfiV1Pair is IDAOfiV1Pair {
    using SafeMath for *;

    uint32 private constant MAX_WEIGHT = 1000000;
    uint32 private constant SLOPE_DENOM = 1000;
    uint32 private constant MAX_N = 3;
    uint256 public constant MAX_FEE = 10; // 1%
    int8 private constant INTERNAL_DECIMALS = 5;
    bytes4 private constant SELECTOR = bytes4(keccak256(bytes('transfer(address,uint256)')));
    address public override factory;
    address public override token0;
    address public override token1;
    /*
    * @dev reserve ratio, represented in ppm, 1-1000000
    * 1/3 corresponds to y = multiple * x^2
    * 1/2 corresponds to y = multiple * x
    * 2/3 corresponds to y = multiple * x^1/2
    * multiple depends on deposit, specifically supply and reserveQuote parameters
    * Note, we are specifically disallowing values > MAX_WEIGHT / 2 to force positive exponents
    */
    uint32 public override reserveRatio;
    uint32 public override slopeNumerator;
    uint32 public override n;
    uint32 public override fee;
    address public override baseToken;
    address public override quoteToken;
    address public override pairOwner;
    uint256 public override supply; // track base tokens issued

    address private router;
    uint256 private reserveBase;       // uses single storage slot, accessible via getReserves
    uint256 private reserveQuote;      // uses single storage slot, accessible via getReserves
    uint256 private feesBase;
    uint256 private feesQuote;

    bool private deposited = false;
    uint private unlocked = 1;

    modifier lock() {
        require(unlocked == 1, 'DAOfiV1: LOCKED');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    function _safeTransfer(address token, address to, uint256 value) private {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(SELECTOR, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), 'DAOfiV1: TRANSFER_FAILED');
    }

    function _abs(int256 x) internal pure returns (uint256 y) {
        if (x < 0) {
            y = uint256(-x);
        } else if (x > 0) {
            y = uint256(x);
        } else {
            y = 0;
        }
    }

    function _convertToDecimals(uint256 amountIn, int8 from, int8 to) internal pure returns (uint256 amountOut) {
        amountOut = amountIn;
        if (amountIn > 0) {
            int8 diff = to - from;
            // expand or contract resolution
            uint factor = (10 ** _abs(diff));
            if (diff < 0) {
                amountOut = amountIn.div(factor);
                amountOut = amountOut * factor;
            } else if (diff > 0 ) {
                amountOut = amountOut * factor;
                amountOut = amountOut.div(factor);
            }
        }
    }

    function _getFormula() private view returns (IBancorFormula) {
        return IBancorFormula(IDAOfiV1Factory(factory).formula());
    }

    constructor() {
        factory = msg.sender;
        reserveRatio = MAX_WEIGHT >> 1; // max weight / 2 for default curve y = x
        slopeNumerator = SLOPE_DENOM;
        n = 1;
        fee = 0;
        supply = 0;
    }

    function getReserves() public override view returns (uint256 _reserveBase, uint256 _reserveQuote) {
        _reserveBase = reserveBase;
        _reserveQuote = reserveQuote;
    }

    // called once by the factory at time of deployment
    function initialize(
        address _router,
        address _token0,
        address _token1,
        address _baseToken,
        address _pairOwner,
        uint32 _slopeNumerator,
        uint32 _n,
        uint32 _fee
    ) external override {
        require(msg.sender == factory, 'DAOfiV1: FORBIDDEN'); // sufficient check
        require(_baseToken == _token0 || _baseToken == _token1, 'DAOfiV1: INVALID_BASETOKEN');
        require(_slopeNumerator > 0 && _slopeNumerator <= SLOPE_DENOM, 'DAOfiV1: INVALID_SLOPE_NUMERATOR');
        require(_n > 0 && _n <= MAX_N, 'DAOfiV1: INVALID_N');
        require(_fee <= MAX_FEE, 'DAOfiV1: INVALID_FEE');
        router = _router;
        token0 = _token0;
        token1 = _token1;
        baseToken = _baseToken;
        quoteToken = token0 == baseToken ? token1 : token0;
        pairOwner = _pairOwner;
        slopeNumerator = _slopeNumerator;
        n = _n;
        fee = _fee;
        supply = 0;
        reserveRatio = uint32(MAX_WEIGHT.div(n + 1));  // (1 / (n + 1)) * MAX_WEIGHT
    }

    function setPairOwner(address _nextOwner) external override {
        require(msg.sender == pairOwner, 'DAOfiV1: FORBIDDEN_PAIR_OWNER');
        pairOwner = _nextOwner;
    }

    function deposit(address to) external override lock returns (uint256 amountBaseOut) {
        require(msg.sender == router, 'DAOfiV1: FORBIDDEN_DEPOSIT');
        require(deposited == false, 'DAOfiV1: DOUBLE_DEPOSIT');
        reserveBase = IERC20(baseToken).balanceOf(address(this));
        reserveQuote = IERC20(quoteToken).balanceOf(address(this));
        // this function is locked and the contract can not reset reserves
        deposited = true;
        if (reserveQuote > 0) {
            // set initial supply from quoteReserve
            supply = amountBaseOut = getBaseOut(reserveQuote);
            console.log("base out: %s", amountBaseOut);
            if (amountBaseOut > 0) {
                _safeTransfer(baseToken, to, amountBaseOut);
                reserveBase = reserveBase.sub(amountBaseOut);
            }
        }
        emit Deposit(msg.sender, reserveBase, reserveQuote, amountBaseOut, to);
    }

    function withdraw(address to) external override lock returns (uint256 amountBase, uint256 amountQuote) {
        require(msg.sender == router, 'DAOfiV1: FORBIDDEN_WITHDRAW');
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
    function swap(address tokenIn, address tokenOut, uint256 amountOut, address to, bytes calldata data) external override lock {
        require(deposited, 'DAOfiV1: UNINITIALIZED_SWAP');
        require(amountOut > 0, 'DAOfiV1: INSUFFICIENT_OUTPUT_AMOUNT');
        uint256 reserveIn;
        uint256 balanceIn;
        { // scope for _token{Base,Quote}, avoids stack too deep errors
            address _tokenBase = baseToken;
            address _tokenQuote = quoteToken;
            require(to != _tokenBase && to != _tokenQuote, 'DAOfiV1: INVALID_TO');
            _safeTransfer(tokenOut, to, amountOut); // optimistically transfer tokens
            // allow chaining of output to another contract via interface
            if (data.length > 0) IDAOfiV1Callee(to).daofiV1Call(msg.sender, tokenIn, tokenOut, amountOut, data);

            if (tokenIn == _tokenBase) {
                reserveIn = reserveBase;
                balanceIn = IERC20(_tokenBase).balanceOf(address(this)).sub(feesBase);
            } else if (tokenIn == _tokenQuote) {
                reserveIn = reserveQuote;
                balanceIn = IERC20(_tokenQuote).balanceOf(address(this)).sub(feesQuote);
            }
        }
        uint256 amounIn = balanceIn > reserveIn ? balanceIn - reserveIn : 0;
        require(amounIn > 0, 'DAOfiV1: INSUFFICIENT_INPUT_AMOUNT');
        // Check that inputs equal output
        // handle quote to base
        if (tokenOut == baseToken) {
            uint256 amountInWithFee = amounIn.mul(1000 - fee) / 1000;
            require(getBaseOut(amountInWithFee) == amountOut, 'DAOfiV1: INVALID_BASE_OUTPUT');
            supply = supply.add(amountOut);
            reserveQuote = reserveQuote.add(amountInWithFee);
            reserveBase = reserveBase.sub(amountOut);
            feesQuote = feesQuote.add(amounIn).sub(amountInWithFee);
        } else if (tokenOut == quoteToken) {
             // handle base to quote
            uint256 amountInWithFee = amounIn.mul(1000 - fee) / 1000;
            require(getQuoteOut(amountInWithFee) == amountOut, 'DAOfiV1: INVALID_QUOTE_OUTPUT');
            supply = supply.sub(amountInWithFee);
            reserveQuote = reserveQuote.sub(amountOut);
            reserveBase = reserveBase.add(amountInWithFee);
            feesBase = feesBase.add(amounIn).sub(amountInWithFee);
        }
        require(supply <= IERC20(baseToken).totalSupply(), 'DAOfiV1: INSUFFICIENT_SUPPLY');
        emit Swap(msg.sender, tokenIn, tokenOut, amountOut, to);
    }

    // The amount of quote returned for 1 base
    function basePrice() public view override returns (uint256 price) {
        require(deposited, 'DAOfiV1: UNINITIALIZED_BASE_PRICE');
        price = getQuoteOut(10 ** IERC20(baseToken).decimals());
    }

    // The amount of base returned for 1 quote
    function quotePrice() public view override returns (uint256 price) {
        require(deposited, 'DAOfiV1: UNINITIALIZED_QUOTE_PRICE');
        price = getBaseOut(10 ** IERC20(quoteToken).decimals());
    }

    /**
    * @dev given the base token supply, quote reserve, weight and a quote input amount,
    * calculates the return for a given conversion (in the base token)
    *
    * Formula:
    * base out = supply * ((1 + amountQuoteIn / reserveQuote) ^ (reserveRatio / 1000000) - 1)
    *
    * @param amountQuoteIn quote token input amount
    *
    * @return amountBaseOut
    */
    function getBaseOut(uint256 amountQuoteIn) public view override returns (uint256 amountBaseOut) {
        require(deposited, 'DAOfiV1Pair: UNINITIALIZED');
        // Case for 0 supply, differing examples between research, bancor v1, bancor v2

        // s = (b / rm)^r
        // https://blog.relevant.community/bonding-curves-in-depth-intuition-parametrization-d3905a681e0a

        // s = b / r
        // https://github.com/DAOfi/bancor/blob/main/solidity/contracts/converter/types/liquid-token/LiquidTokenConverter.sol#L148

        // s = b
        // https://github.com/DAOfi/bancor/blob/main/solidity/contracts/converter/types/liquidity-pool-v2/LiquidityPoolV2Converter.sol#L512

        // s = b / rm
        // experimental, works well for relatively small numbers
        if (supply == 0) {
            amountBaseOut = amountQuoteIn.mul(SLOPE_DENOM).mul(MAX_WEIGHT).div(slopeNumerator.mul(reserveRatio));
        } else {
            amountBaseOut = _getFormula().purchaseTargetAmount(supply, reserveQuote, reserveRatio, amountQuoteIn);
        }
        amountBaseOut = _convertToDecimals(amountBaseOut, int8(IERC20(baseToken).decimals()), INTERNAL_DECIMALS);
    }

    /**
    * @dev given the base token supply, quote reserve, weight and a base input amount,
    * calculates the return for a given conversion (in the quote token)
    *
    * Formula:
    * quote out = reserveQuote * (1 - (1 - amountBaseIn / supply) ^ (1000000 / reserveRatio)))
    *
    * @param amountBaseIn sell amount, in the token itself
    *
    * @return amountQuoteOut
    */
    function getQuoteOut(uint256 amountBaseIn) public view override returns (uint256 amountQuoteOut) {
        require(deposited, 'DAOfiV1Pair: UNINITIALIZED');
        console.log("base in: %s", amountBaseIn);
        console.log("supply: %s", supply);
        amountQuoteOut = _getFormula().saleTargetAmount(supply, reserveQuote, reserveRatio, amountBaseIn);
        console.log("quote out: %s", amountQuoteOut);
        amountQuoteOut = _convertToDecimals(amountQuoteOut, int8(IERC20(quoteToken).decimals()), INTERNAL_DECIMALS);
    }

    function getBaseIn(uint256 amountQuoteOut) public view override returns (uint256 amountBaseIn) {
        console.log("quote out: %s", amountQuoteOut);
        console.log("reserve quote: %s", reserveQuote);
        console.log("supply: %s", supply);
        // special case for 0 deposit amount
        if (amountQuoteOut == 0) return 0;
        // special case, all the quote
        if (amountQuoteOut == reserveQuote) return supply;
        // special case if the weight = 100%
        if (reserveRatio == MAX_WEIGHT) return supply.mul(amountQuoteOut) / reserveQuote;
        uint256 baseN = reserveQuote.add(amountQuoteOut);
        (uint256 result, uint8 precision) = _getFormula().power(baseN, reserveQuote, reserveRatio, MAX_WEIGHT);
        uint256 temp = (result >> precision);
        amountBaseIn = supply.sub(temp);
        console.log("base in: %s", amountBaseIn);
        amountBaseIn = _convertToDecimals(amountBaseIn, int8(IERC20(baseToken).decimals()), INTERNAL_DECIMALS);
    }

    function getQuoteIn(uint256 amountBaseOut) public view override returns (uint256 amountQuoteIn) {
        require(deposited, 'DAOfiV1Pair: UNINITIALIZED');
        // special case for 0 sell amount
        if (amountBaseOut == 0) return 0;
        // special case if the weight = 100%
        if (reserveRatio == MAX_WEIGHT) return reserveQuote.mul(amountBaseOut) / supply;
        (uint256 result, uint8 precision)  = _getFormula().power(
            supply.add(amountBaseOut),
            uint256(supply),
            MAX_WEIGHT,
            reserveRatio
        );
        uint256 reserveAtSupply = (result.mul(reserveQuote) >> precision);
        amountQuoteIn = reserveAtSupply.sub(reserveQuote);
        amountQuoteIn = _convertToDecimals(amountQuoteIn, int8(IERC20(quoteToken).decimals()), INTERNAL_DECIMALS);
    }
}
