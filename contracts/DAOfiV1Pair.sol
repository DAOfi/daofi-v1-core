// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.7.4;
pragma experimental ABIEncoderV2;

import '@daofi/bancor/solidity/contracts/converter/interfaces/IBancorFormula.sol';
// import 'hardhat/console.sol';
import './interfaces/IDAOfiV1Callee.sol';
import './interfaces/IDAOfiV1Factory.sol';
import './interfaces/IDAOfiV1Pair.sol';
import './interfaces/IERC20.sol';
import "./libraries/SafeMath.sol";

contract DAOfiV1Pair is IDAOfiV1Pair {
    using SafeMath for *;

    uint32 private constant MAX_WEIGHT = 1000000;
    uint256 public constant MAX_FEE = 10; // 1%
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
    uint32 public reserveRatio;

    address public override baseToken;
    address public override quoteToken;
    address public override pairOwner;
    uint256 public override supply; // track base tokens issued
    uint32 public override fee;

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

    function _getFormula() private view returns (IBancorFormula) {
        return IBancorFormula(IDAOfiV1Factory(factory).formula());
    }

    constructor() {
        factory = msg.sender;
        reserveRatio = MAX_WEIGHT >> 1; // max weight / 2 for default curve y = x
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
        uint32 _reserveRatio,
        uint32 _fee
    ) external override {
        require(msg.sender == factory, 'DAOfiV1: FORBIDDEN'); // sufficient check
        require(_baseToken == _token0 || _baseToken == _token1, 'DAOfiV1: INVALID_BASETOKEN');
        // restrict reserve ratio to only allow curves with whole number exponents
        require(_reserveRatio > 0 && _reserveRatio <= (MAX_WEIGHT >> 1), 'DAOfiV1: INVALID_RESERVE_RATIO');
        require(_fee <= MAX_FEE, 'DAOfiV1: INVALID_FEE');
        router = _router;
        token0 = _token0;
        token1 = _token1;
        baseToken = _baseToken;
        quoteToken = token0 == baseToken ? token1 : token0;
        pairOwner = _pairOwner;
        reserveRatio = _reserveRatio;
        fee = _fee;
        supply = 0;
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
        require(reserveQuote > 0 && reserveBase > 0, 'DAOfiV1: ZERO_RESERVE');
        // set initial supply from quoteReserve
        // https://github.com/bancorprotocol/contracts-solidity/blob/master/solidity/contracts/converter/types/liquidity-pool-v2/LiquidityPoolV2Converter.sol#L506
        supply = amountBaseOut = reserveQuote;
        reserveBase = reserveBase.sub(amountBaseOut);
        _safeTransfer(baseToken, to, amountBaseOut);

        // this function is locked and the contract can not reset reserves
        deposited = true;
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
    function swap(uint256 amountBaseOut, uint256 amountQuoteOut, address to, bytes calldata data) external override lock {
        require(deposited, 'DAOfiV1: UNINITIALIZED_SWAP');
        require(amountBaseOut > 0 || amountQuoteOut > 0, 'DAOfiV1: INSUFFICIENT_OUTPUT_AMOUNT');
        (uint256 _reserveBase, uint256 _reserveQuote)  = getReserves(); // gas savings
        require(amountBaseOut <= _reserveBase && amountQuoteOut <= reserveQuote, 'DAOfiV1: INSUFFICIENT_LIQUIDITY');
        uint256 balanceBase;
        uint256 balanceQuote;
        { // scope for _token{Base,Quote}, avoids stack too deep errors
        address _tokenBase = baseToken;
        address _tokenQuote = quoteToken;
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
            supply = supply.add(amountBaseOut);
            reserveQuote = _reserveQuote.add(amountInWithFee);
            reserveBase = _reserveBase.sub(amountBaseOut);
            feesQuote = feesQuote.add(amountQuoteIn).sub(amountInWithFee);
        }
        // now trade base to quote
        if (amountBaseIn > 0) {
            uint256 amountInWithFee = amountBaseIn.mul(1000 - fee) / 1000;
            require(getQuoteOut(amountInWithFee) == amountQuoteOut, 'DAOfiV1: INVALID_QUOTE_OUTPUT');
            supply = supply.sub(amountInWithFee);
            reserveQuote = _reserveQuote.sub(amountQuoteOut);
            reserveBase = _reserveBase.add(amountInWithFee);
            feesBase = feesBase.add(amountBaseIn).sub(amountInWithFee);
        }
        require(supply <= IERC20(baseToken).totalSupply(), 'DAOfiV1: INSUFFICIENT_SUPPLY');
        emit Swap(msg.sender, amountBaseIn, amountQuoteIn, amountBaseOut, amountQuoteOut, to);
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
        amountBaseOut = _getFormula().purchaseTargetAmount(supply, reserveQuote, reserveRatio, amountQuoteIn);
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
        amountQuoteOut = _getFormula().saleTargetAmount(supply, reserveQuote, reserveRatio, amountBaseIn);
    }

    function getBaseIn(uint256 amountQuoteOut) public view override returns (uint256 amountBaseIn) {
        //amountBaseIn = _getFormula().fundSupplyAmount(supply, reserveQuote, reserveRatio, amountQuoteOut);
    }

    function getQuoteIn(uint256 amountBaseOut) public view override returns (uint256 amountQuoteIn) {
        //amountQuoteIn = _getFormula().fundCost(supply, reserveQuote, reserveRatio, amountBaseOut);
    }
}
