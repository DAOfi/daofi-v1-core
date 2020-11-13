pragma solidity =0.6.6;
pragma experimental ABIEncoderV2;

import './interfaces/IDAOfiV1Callee.sol';
import './interfaces/IDAOfiV1Factory.sol';
import './interfaces/IDAOfiV1Pair.sol';
import './interfaces/IERC20.sol';
import './libraries/Math.sol';
import './libraries/SafeMath.sol';
import './Power.sol';

contract DAOfiV1Pair is IDAOfiV1Pair, Power {
    using SafeMath  for uint;

    uint32 public constant SLOPE_DENOM = 10**6; // used to divide slope m
    uint256 public constant MAX_FEE = 10; // 1%
    uint256 public constant MAX_N = 10; // y = mx ** n
    bytes4 private constant SELECTOR = bytes4(keccak256(bytes('transfer(address,uint256)')));

    address public override factory;
    address public override token0;
    address public override token1;
    uint256 public override price0CumulativeLast;
    uint256 public override price1CumulativeLast;
    address public baseToken;
    address public pairOwner;
    uint256 public s; // track base tokens issued
    // price = m(s ** n)
    uint32 public m; // m / SLOPE_DENOM
    uint32 public n; //
    uint32 public fee;

    uint256 private reserveBase;           // uses single storage slot, accessible via getReserves
    uint256 private reserveQuote;           // uses single storage slot, accessible via getReserves
    uint32  public blockTimestampLast; // uses single storage slot, accessible via getReserves

    bool private deposited = false;
    uint private unlocked = 1;

    event Debug(uint256 value);
    event Deposit(address indexed sender, uint256 amountBase, uint256 amountQuote, uint256 s);
    event Withdraw(address indexed sender, uint256 amountQuote, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amountBaseIn,
        uint256 amountQuoteIn,
        uint256 amountBaseOut,
        uint256 amountQuoteOut,
        address indexed to
    );

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

    constructor() public {
        factory = msg.sender;
        m = SLOPE_DENOM;
        n = 1;
        fee = 3;
        s = 0;
    }

    // called once by the factory at time of deployment
    function initialize(
        address _token0,
        address _token1,
        address _baseToken,
        address _pairOwner,
        uint32 _slope,
        uint32 _exp,
        uint32 _fee
    ) external override {
        require(msg.sender == factory, 'DAOfiV1: FORBIDDEN'); // sufficient check
        require(_exp >= 1 && _exp <= MAX_N, 'DAOfiV1: exponent must be >= 1 and <= 10');
        require(_slope >= 1, 'DAOfiV1: slope must be >= 1');
        require(_fee >= 1 && _fee <= MAX_FEE, 'DAOfiV1: fee must be >= 1 and <= 10');
        token0 = _token0;
        token1 = _token1;
        baseToken = _baseToken;
        pairOwner = _pairOwner;
        m = _slope;
        n = _exp;
        fee = _fee;
        s = 0;
    }

    function setPairOwner(address _nextOwner) external override {
        require(msg.sender == pairOwner, 'DAOfiV1: FORBIDDEN');
        pairOwner = _nextOwner;
    }

    function deposit() external override {
        require(msg.sender == pairOwner, 'DAOfiV1: FORBIDDEN');
        require(deposited == false, 'DAOfiV1: DOUBLE_DEPOSIT');
        reserveBase = IERC20(baseToken).balanceOf(address(this));
        reserveQuote = IERC20(token0 == baseToken ? token1 : token0).balanceOf(address(this));
        // set initial s from quoteReserve
        // quoteReserve = (slopeN * (s ** (n + 1))) / (slopeD * (n + 1))
        // solve for s
        // s = ((quoteReserve * slopeD * (n + 1)) / slopeN) ** (1 / (n + 1))
        (uint256 result, uint8 precision) = power(reserveQuote.mul(SLOPE_DENOM).mul(n + 1), m, uint32(1), (n + 1));
        deposited = true;
        s = result >> precision;
        emit Deposit(msg.sender, reserveBase, reserveQuote, s);
    }

    function withdraw(address to) external override lock {
        require(msg.sender == pairOwner, 'DAOfiV1: FORBIDDEN');
        address quoteToken = token0 == baseToken ? token1 : token0;
        uint256 quoteSurplus = IERC20(quoteToken).balanceOf(address(this)) - reserveQuote;
        _safeTransfer(quoteToken, to, quoteSurplus);
        emit Withdraw(msg.sender, quoteSurplus, to);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function swap(uint256 amountBaseOut, uint256 amountQuoteOut, address to, bytes calldata data) external override lock {
        // require(amount0Out > 0 || amount1Out > 0, 'DAOfiV1: INSUFFICIENT_OUTPUT_AMOUNT');
        // (uint256 _reserve0, uint256 _reserve1,)  = getReserves(); // gas savings
        // require(amount0Out < _reserve0 && amount1Out < _reserve1, 'DAOfiV1: INSUFFICIENT_LIQUIDITY');
        // uint256 balance0;
        // uint256 balance1;
        // { // scope for _token{0,1}, avoids stack too deep errors
        // address _token0 = token0;
        // address _token1 = token1;
        // require(to != _token0 && to != _token1, 'DAOfiV1: INVALID_TO');
        // if (amount0Out > 0) _safeTransfer(_token0, to, amount0Out); // optimistically transfer tokens
        // if (amount1Out > 0) _safeTransfer(_token1, to, amount1Out); // optimistically transfer tokens
        // if (data.length > 0) IDAOfiV1Callee(to).daofiV1Call(msg.sender, amount0Out, amount1Out, data);
        // balance0 = IERC20(_token0).balanceOf(address(this));
        // balance1 = IERC20(_token1).balanceOf(address(this));
        // }
        // uint256 amount0In = balance0 > _reserve0 - amount0Out ? balance0 - (_reserve0 - amount0Out) : 0;
        // uint256 amount1In = balance1 > _reserve1 - amount1Out ? balance1 - (_reserve1 - amount1Out) : 0;
        // require(amount0In > 0 || amount1In > 0, 'DAOfiV1: INSUFFICIENT_INPUT_AMOUNT');

        // TODO replace this with our own balance check
        // { // scope for reserve{0,1}Adjusted, avoids stack too deep errors
        // uint balance0Adjusted = balance0.mul(1000).sub(amount0In.mul(fee));
        // uint balance1Adjusted = balance1.mul(1000).sub(amount1In.mul(fee));
        // require(balance0Adjusted.mul(balance1Adjusted) >= uint(_reserve0).mul(_reserve1).mul(1000**2), 'DAOfiV1: K');
        // }

        emit Swap(msg.sender, 0, 0, amountBaseOut, amountQuoteOut, to);
    }
}
