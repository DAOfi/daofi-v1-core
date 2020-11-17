// reserve balances for uniswap style and bonding curve
let baseReserve = 0
let quoteReserve = 0
let slope = 1
let n = 1
let s = 0

function logRes(useS: boolean = false) {
  console.log(`base reserve: ${baseReserve}, quote reserve: ${quoteReserve}` + (useS ? `, s: ${s}` : ''))
}

function initRes(
  slopeN: number,
  slopeD: number,
  exp: number,
  baseR: number,
  quoteR: number,
) {
  baseReserve = baseR
  quoteReserve = quoteR
  slope = slopeN / slopeD
  n = exp
  // y' = (slopeN * x ** (n + 1)) / (slopeD * (n + 1))
  // given y' = quoteReserve and x = s, solve for s
  s = (quoteReserve / (slope / (n + 1))) ** (1 / (n + 1))
}

// amountOut = (amountIn x reserveOut) / (amountIn + reserveIn)
function uniswap(amountIn: number, isQuote: boolean) {
  let amountOut = isQuote ? (amountIn * baseReserve) / (quoteReserve + amountIn) :
    (amountIn * quoteReserve) / (baseReserve + amountIn)

  if (isQuote) {
    quoteReserve += amountIn
    baseReserve -= amountOut
    console.log(`swapped ${amountIn} quote for ${amountOut} base`)
  } else {
    quoteReserve -= amountOut
    baseReserve += amountIn
    console.log(`swapped ${amountIn} base for ${amountOut} quote`)
  }

  logRes()
  return amountOut
}


// y = mx ** n
// given y = price and x = s, solve for s
// then plug s into the antiderivative
// y' = (slopeN * x ** (n + 1)) / (slopeD * (n + 1))
// y' = quote reserve at price
function getReserveForStartPrice(price: number, slopeN: number, slopeD: number, exp: number) {
  let s = (price * (slopeD / slopeN)) ** (1 / exp)
  return (slope * (s ** (n + 1))) / (n + 1)
}

// y = mx ** n
// y' = (slopeN * x ** (n + 1)) / (slopeD * (n + 1))
// given y' = (quote in + quote reserve) and x = s, solve for s
// subtract from previous s to get net base
function exchangeQuote(quoteIn: number) {
  let baseOut = (((quoteReserve + quoteIn) / (slope / (n + 1))) ** (1 / (n + 1))) - s
  s += baseOut
  quoteReserve += quoteIn
  baseReserve -= baseOut
  console.log(`swapped ${quoteIn} quote for ${baseOut} base`)
  logRes(true)
  return baseOut
}

// y = mx ** n
// y' = (slopeN * x ** (n + 1)) / (slopeD * (n + 1))
// given y'(s) = quoteReserve
// subtract y'(s) - y'(s - k)
function exchangeBase(baseIn: number) {
  let quoteOut = quoteReserve - ((slope / (n + 1)) * ((s - baseIn) ** (n + 1)))
  s -= baseIn
  baseReserve += baseIn
  quoteReserve -= quoteOut
  console.log(`swapped ${baseIn} base for ${quoteOut} quote`)
  logRes(true)
  return quoteOut
}

console.log('\nuniswap slope 1 n 1:')
initRes(1, 1, 1, 1000, 1000)
uniswap(uniswap(100, true), false)

console.log('\nparameterized reserve slope 1 n 1:')
initRes(1, 1, 1, 1000, 0)
exchangeBase(exchangeQuote(100))

console.log('\nparameterized reserve slope 1 exp 2')
initRes(1, 1, 2, 1000, 0)
exchangeBase(exchangeQuote(100))

console.log('\nparameterized reserve slope 1/2 exp 1')
initRes(1, 2, 1, 1000, 0)
exchangeBase(exchangeQuote(100))

console.log('\nparameterized reserve slope 1/2 exp 2')
initRes(1, 2, 2, 1000, 0)
exchangeBase(exchangeQuote(100))

console.log('\nparameterized reserve slope 2 exp 1')
initRes(2, 1, 1, 1000, 0)
exchangeBase(exchangeQuote(100))

console.log('\nparameterized reserve slope 2 exp 2')
initRes(2, 1, 2, 1000, 0)
exchangeBase(exchangeQuote(100))

// continuous token model
let tokensMinted = 0
let poolBalance = 0

function logCont() {
  console.log(`tokens minted: ${tokensMinted}, pool balance: ${poolBalance}`)
}

function initCont(
  slopeN: number,
  slopeD: number,
  exp: number
) {
  tokensMinted = 0
  poolBalance = 0
  slope = slopeN / slopeD
  n = exp
}

function buyTokens(poolIn: number) {
  let tokensOut = (((poolBalance + poolIn) / (slope / (n + 1))) ** (1 / (n + 1))) - tokensMinted
  tokensMinted += tokensOut
  poolBalance += poolIn
  console.log(`swapped ${poolIn} pool in for ${tokensOut} tokens`)
  logCont()
  return tokensOut
}

function sellTokens(tokensIn: number) {
  let poolOut = poolBalance - ((slope / (n + 1)) * ((tokensMinted - tokensIn) ** (n + 1)))
  tokensMinted -= tokensIn
  poolBalance -= poolOut
  console.log(`swapped ${tokensIn} tokens for ${poolOut} pool out`)
  logCont()
  return poolOut
}

console.log('\ncontinous slope 1 n 1:')
initCont(1, 1, 1)
sellTokens(buyTokens(100))

console.log('\ncontinuous slope 1 exp 2')
initCont(1, 1, 2)
sellTokens(buyTokens(100))

console.log('\ncontinuous slope 1/2 exp 1')
initCont(1, 2, 1)
sellTokens(buyTokens(100))

console.log('\ncontinuous slope 1/2 exp 2')
initCont(1, 2, 2)
sellTokens(buyTokens(100))

console.log('\ncontinuous slope 2 exp 1')
initCont(2, 1, 1)
sellTokens(buyTokens(100))

console.log('\ncontinuous slope 2 exp 2')
initCont(2, 1, 2)
sellTokens(buyTokens(100))




