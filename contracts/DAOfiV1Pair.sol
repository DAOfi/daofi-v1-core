// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.7.4;
pragma experimental ABIEncoderV2;

import '@daofi/bancor/solidity/contracts/converter/interfaces/IBancorFormula.sol';
// import 'hardhat/console.sol';
import './interfaces/IDAOfiV1Factory.sol';
import './interfaces/IDAOfiV1Pair.sol';
import './interfaces/IERC20.sol';
import "./libraries/SafeMath.sol";

contract DAOfiV1Pair is IDAOfiV1Pair {
    using SafeMath for *;

    uint32 private constant MAX_WEIGHT = 1000000;
    uint32 private constant SLOPE_DENOM = 1000;
    uint32 private constant MAX_N = 3;
    uint8 public constant MAX_FEE = 10; // 1%
    uint8 public constant override PLATFORM_FEE = 1; // 0.1%
    address public constant PLATFORM = 0x31b2d5f134De0A737360693Ed5D5Bd42b705bCa2;
    bytes4 private constant SELECTOR = bytes4(keccak256(bytes('transfer(address,uint256)')));

    address public override factory;
    /*
    * @dev reserve ratio, represented in ppm, 1-1000000
    * 1/3 corresponds to y = slope * x^2
    * 1/2 corresponds to y = slope * x
    * 2/3 corresponds to y = slope * x^1/2
    *
    * Note, we are specifically disallowing values > MAX_WEIGHT / 2 to force positive exponents
    */
    uint32 public override reserveRatio;
    // slope = slopeNumerator / SLOPE_DENOM, this values is baked into the equations by the initial supply
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
    uint256 private feesBaseOwner;
    uint256 private feesQuoteOwner;
    uint256 private feesBasePlatform;
    uint256 private feesQuotePlatform;
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
        address _baseToken,
        address _quoteToken,
        address _pairOwner,
        uint32 _slopeNumerator,
        uint32 _n,
        uint32 _fee
    ) external override {
        require(msg.sender == factory, 'DAOfiV1: FORBIDDEN');
        require(_slopeNumerator > 0 && _slopeNumerator <= SLOPE_DENOM, 'DAOfiV1: INVALID_SLOPE_NUMERATOR');
        require(_n > 0 && _n <= MAX_N, 'DAOfiV1: INVALID_N');
        require(_fee <= MAX_FEE, 'DAOfiV1: INVALID_FEE');
        router = _router;
        baseToken = _baseToken;
        quoteToken = _quoteToken;
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
        amountBase = IERC20(baseToken).balanceOf(address(this)).sub(feesBasePlatform);
        amountQuote = IERC20(quoteToken).balanceOf(address(this)).sub(feesQuotePlatform);
        _safeTransfer(baseToken, to, amountBase);
        _safeTransfer(quoteToken, to, amountQuote);
        reserveBase = 0;
        reserveQuote = 0;
        emit Withdraw(msg.sender, amountBase, amountQuote, to);
    }

    function withdrawPlatformFees(address to) external override lock returns (uint256 amountBase, uint256 amountQuote) {
        require(msg.sender == PLATFORM, 'DAOfiV1: FORBIDDEN_WITHDRAW');
        require(deposited, 'DAOfiV1: UNINITIALIZED');
        amountBase = feesBasePlatform;
        amountQuote = feesQuotePlatform;
        _safeTransfer(baseToken, to, amountBase);
        _safeTransfer(quoteToken, to, amountQuote);
        feesBasePlatform = 0;
        feesQuotePlatform = 0;
        emit Withdraw(msg.sender, amountBase, amountQuote, to);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, address to) external override lock {
        require(deposited, 'DAOfiV1: UNINITIALIZED_SWAP');
        require(
            (tokenIn == baseToken || tokenIn == quoteToken) && (tokenOut == baseToken || tokenOut == quoteToken),
            'DAOfiV1: INCORRECT_TOKENS'
        );
        require(to != baseToken && to != quoteToken, 'DAOfiV1: INVALID_TO');
        require(amountOut > 0 && amountIn > 0, 'DAOfiV1: INSUFFICIENT_IO_AMOUNT');
        _safeTransfer(tokenOut, to, amountOut); // optimistically transfer tokens
        uint256 balanceIn;
        uint256 reserveIn;
        if (tokenIn == baseToken) {
            reserveIn = reserveBase;
            balanceIn = IERC20(baseToken).balanceOf(address(this))
                .sub(feesBaseOwner)
                .sub(feesBasePlatform);
        } else if (tokenIn == quoteToken) {
            reserveIn = reserveQuote;
            balanceIn = IERC20(quoteToken).balanceOf(address(this))
                .sub(feesQuoteOwner)
                .sub(feesQuotePlatform);
        }
        uint256 surplus = balanceIn > reserveIn ? balanceIn - reserveIn : 0;
        require(amountIn <= surplus, 'DAOfiV1: INCORRECT_INPUT_AMOUNT');
        // Check that inputs equal output
        uint256 amountInSubOwnerFee = amountIn.mul(1000 - fee) / 1000;
        uint256 amountInSubPlatformFee = amountIn.mul(1000 - PLATFORM_FEE) / 1000;
        uint256 amountInSubFees = amountIn.mul(1000 - (fee + PLATFORM_FEE)) / 1000;
        // handle quote to base
        if (tokenOut == baseToken) {
            require(getBaseOut(amountInSubFees) == amountOut, 'DAOfiV1: INVALID_BASE_OUTPUT');
            require(amountOut <= reserveBase, 'DAOfiV1: INSUFFICIENT_BASE_RESERVE');
            supply = supply.add(amountOut);
            reserveQuote = reserveQuote.add(amountInSubFees);
            reserveBase = reserveBase.sub(amountOut);
            feesQuoteOwner = feesQuoteOwner.add(amountIn).sub(amountInSubOwnerFee);
            feesQuotePlatform = feesQuotePlatform.add(amountIn).sub(amountInSubPlatformFee);
        } else if (tokenOut == quoteToken) {
            require(getQuoteOut(amountInSubFees) == amountOut, 'DAOfiV1: INVALID_QUOTE_OUTPUT');
            require(amountOut <= reserveQuote, 'DAOfiV1: INSUFFICIENT_QUOTE_RESERVE');
            supply = supply.sub(amountInSubFees);
            reserveQuote = reserveQuote.sub(amountOut);
            reserveBase = reserveBase.add(amountInSubFees);
            feesBaseOwner = feesBaseOwner.add(amountIn).sub(amountInSubOwnerFee);
            feesBasePlatform = feesBasePlatform.add(amountIn).sub(amountInSubPlatformFee);
        }
        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut, to);
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
    }

    /**
    * @dev given the base token supply, quote reserve, weight and a base input amount,
    * calculates the return for a given conversion (in the quote token)
    *
    * Formula:
    * quote out = reserveQuote * (1 - (1 - amountBaseIn / supply) ^ (1000000 / reserveRatio)))
    *
    * @param amountBaseIn base token input amount
    *
    * @return amountQuoteOut
    */
    function getQuoteOut(uint256 amountBaseIn) public view override returns (uint256 amountQuoteOut) {
        require(deposited, 'DAOfiV1Pair: UNINITIALIZED');
        amountQuoteOut = _getFormula().saleTargetAmount(supply, reserveQuote, reserveRatio, amountBaseIn);
    }
}
