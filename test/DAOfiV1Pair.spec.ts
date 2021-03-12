import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'
import { ethers } from 'hardhat'
import { getReserveForStartPrice, expandTo18Decimals, expandToDecimals } from './shared/utilities'
import { pairFixture, factoryFixture } from './shared/fixtures'

const zero = ethers.BigNumber.from(0)

let factory: Contract
let formula: Contract
let tokenBase: Contract
let tokenQuote: Contract
let pair: Contract
let wallet: SignerWithAddress

async function addLiquidity(baseAmount: BigNumber, quoteAmount: BigNumber) {
  if (baseAmount.gt(zero)) await tokenBase.transfer(pair.address, baseAmount)
  if (quoteAmount.gt(zero)) await tokenQuote.transfer(pair.address, quoteAmount)
  await pair.deposit(wallet.address)
}

describe('DAOfiV1Pair: reverts', () => {
  beforeEach(async () => {
    const Token = await ethers.getContractFactory("ERC20")
    wallet = (await ethers.getSigners())[0]
    const fixture = await factoryFixture(wallet)
    factory = fixture.factory
    formula = fixture.formula
    tokenBase = await Token.deploy(ethers.BigNumber.from('0x033b2e3c9fd0803ce8000000')) // 1e9 tokens
    tokenQuote =  await Token.deploy(ethers.BigNumber.from('0x033b2e3c9fd0803ce8000000')) // 1e9 tokens
  })

  it('initialize:', async () => {
    const Pair = await ethers.getContractFactory("DAOfiV1Pair")
    const wallet2 = (await ethers.getSigners())[1]
    pair = await Pair.deploy()
    // factory is the initial wallet in this case, switch wallet to test restriction
    pair = await pair.connect(wallet2)
    await expect(pair.initialize(
      wallet.address, // formulat doesn't matter
      wallet2.address,
      tokenBase.address,
      tokenQuote.address,
      wallet2.address,
      1e6,
      1,
      0
    )).to.be.revertedWith('DAOfiV1: FORBIDDEN')
    // switch back to wallet1
    pair = await pair.connect(wallet)
    // invalid slope
    await expect(pair.initialize(
      wallet.address, // formulat doesn't matter
      wallet.address,
      tokenBase.address,
      tokenQuote.address,
      wallet.address,
      0,
      1,
      0
    )).to.be.revertedWith('DAOfiV1: INVALID_SLOPE_NUMERATOR')
    await expect(pair.initialize(
      wallet.address, // formulat doesn't matter
      wallet.address,
      tokenBase.address,
      tokenQuote.address,
      wallet.address,
      (1e6 * 100) + 1,
      1,
      0
    )).to.be.revertedWith('DAOfiV1: INVALID_SLOPE_NUMERATOR')
    // invalid exponent
    await expect(pair.initialize(
      wallet.address, // formulat doesn't matter
      wallet.address,
      tokenBase.address,
      tokenQuote.address,
      wallet.address,
      1e6,
      0,
      0
    )).to.be.revertedWith('DAOfiV1: INVALID_N')
    await expect(pair.initialize(
      wallet.address, // formulat doesn't matter
      wallet.address,
      tokenBase.address,
      tokenQuote.address,
      wallet.address,
      1e6,
      2,
      0
    )).to.be.revertedWith('DAOfiV1: INVALID_N')
    // invalid fee
    await expect(pair.initialize(
      wallet.address, // formulat doesn't matter
      wallet.address,
      tokenBase.address,
      tokenQuote.address,
      wallet.address,
      1e6,
      1,
      11
    )).to.be.revertedWith('DAOfiV1: INVALID_FEE')
  })

  it('setPairOwner:', async () => {
    const wallet2 = (await ethers.getSigners())[1]
    const wallet3 = (await ethers.getSigners())[2]
    pair = (await pairFixture(wallet, 1e6, 1, 0)).pair
    // owner is the initial wallet in this case, switch wallet to test restriction
    pair = await pair.connect(wallet2)
    await expect(pair.setPairOwner(wallet3.address)).to.be.revertedWith('DAOfiV1: FORBIDDEN_PAIR_OWNER')
    // switch back to wallet1
    pair = await pair.connect(wallet)
    // invalid owner
    await expect(pair.setPairOwner('0x0')).to.be.reverted // DAOfiV1: INVALID_OWNER
  })

  it('deposit:', async () => {
    const wallet2 = (await ethers.getSigners())[1]
    const wallet3 = (await ethers.getSigners())[2]
    const fixture = await pairFixture(wallet, 1e6, 1, 0)
    pair = fixture.pair
    tokenBase = fixture.tokenBase
    // router is the initial wallet in this case, switch wallet to test restriction
    pair = await pair.connect(wallet2)
    await expect(pair.deposit(wallet3.address)).to.be.revertedWith('DAOfiV1: FORBIDDEN_DEPOSIT')
    // switch back to wallet1
    pair = await pair.connect(wallet)
    // insufficient base
    await expect(pair.deposit(wallet.address)).to.be.revertedWith('DAOfiV1: INSUFICCIENT_BASE_RESERVE');
    // successfull deposit
    tokenBase.transfer(pair.address, expandTo18Decimals(1))
    await pair.deposit(wallet.address)
    // double deposit
    await expect(pair.deposit(wallet.address)).to.be.revertedWith('DAOfiV1: DOUBLE_DEPOSIT')
  })

  it('withdraw:', async () => {
    const wallet2 = (await ethers.getSigners())[1]
    const wallet3 = (await ethers.getSigners())[2]
    const fixture = await pairFixture(wallet, 1e6, 1, 0)
    pair = fixture.pair
    tokenBase = fixture.tokenBase
    // router is the initial wallet in this case, switch wallet to test restriction
    pair = await pair.connect(wallet2)
    await expect(pair.withdraw(wallet3.address)).to.be.revertedWith('DAOfiV1: FORBIDDEN_WITHDRAW')
    // switch back to wallet1
    pair = await pair.connect(wallet)
    // not deposited
    await expect(pair.withdraw(wallet.address)).to.be.revertedWith('DAOfiV1: UNINITIALIZED')
    // successfull deposit
    tokenBase.transfer(pair.address, expandTo18Decimals(1))
    await pair.deposit(wallet.address)
    // empty withdraw
    await expect(pair.withdraw(wallet.address)).to.not.be.revertedWith('DAOfiV1: UNINITIALIZED')
  })

  it('withdrawPlatformFees:', async () => {
    pair = (await pairFixture(wallet, 1e6, 1, 0)).pair
    await expect(pair.withdrawPlatformFees(wallet.address)).to.be.revertedWith('DAOfiV1: FORBIDDEN_WITHDRAW')
  })

  it('swap: initial requires', async () => {
    const wallet2 = (await ethers.getSigners())[1]
    const fixture = await pairFixture(wallet, 1e6, 1, 0)
    pair = fixture.pair
    tokenBase = fixture.tokenBase
    tokenQuote = fixture.tokenQuote
    // router is the initial wallet in this case, switch wallet to test restriction
    pair = await pair.connect(wallet2)
    await expect(pair.swap(
      tokenQuote.address,
      tokenBase.address,
      expandTo18Decimals(1),
      ethers.BigNumber.from('99306510000000000'),
      wallet.address
    )).to.be.revertedWith('DAOfiV1: FORBIDDEN_SWAP')
    // switch back to wallet1
    pair = await pair.connect(wallet)
    // not deposited
    await expect(pair.swap(
      tokenQuote.address,
      tokenBase.address,
      expandTo18Decimals(1),
      ethers.BigNumber.from('99306510000000000'),
      wallet.address
    )).to.be.revertedWith('DAOfiV1: UNINITIALIZED_SWAP')
    // successfull deposit
    tokenBase.transfer(pair.address, expandTo18Decimals(1))
    await pair.deposit(wallet.address)
    // invalid token
    await expect(pair.swap(
      pair.address,
      tokenBase.address,
      expandTo18Decimals(1),
      ethers.BigNumber.from('99306510000000000'),
      wallet.address
    )).to.be.revertedWith('DAOfiV1: INCORRECT_TOKENS')
    // invalid to
    await expect(pair.swap(
      tokenQuote.address,
      tokenBase.address,
      expandTo18Decimals(1),
      ethers.BigNumber.from('99306510000000000'),
      tokenBase.address
    )).to.be.revertedWith('DAOfiV1: INVALID_TO')
    await expect(pair.swap(
      tokenQuote.address,
      tokenBase.address,
      expandTo18Decimals(1),
      ethers.BigNumber.from('99306510000000000'),
      tokenQuote.address
    )).to.be.revertedWith('DAOfiV1: INVALID_TO')
    // amount in / out
    await expect(pair.swap(
      tokenQuote.address,
      tokenBase.address,
      zero,
      ethers.BigNumber.from('99306510000000000'),
      wallet.address
    )).to.be.revertedWith('DAOfiV1: INSUFFICIENT_IO_AMOUNT')
    await expect(pair.swap(
      tokenQuote.address,
      tokenBase.address,
      expandTo18Decimals(1),
      zero,
      wallet.address
    )).to.be.revertedWith('DAOfiV1: INSUFFICIENT_IO_AMOUNT')
  })

  it('swap: amount requires', async () => {
    const fixture = await pairFixture(wallet, 1e6, 1, 0)
    pair = fixture.pair
    tokenBase = fixture.tokenBase
    tokenQuote = fixture.tokenQuote
    await addLiquidity(expandTo18Decimals(1e3), expandTo18Decimals(50))
    // input not sent to contract
    await expect(pair.swap(
      tokenQuote.address,
      tokenBase.address,
      expandTo18Decimals(1),
      ethers.BigNumber.from('99306510000000000'),
      wallet.address
    )).to.be.revertedWith('DAOfiV1: INCORRECT_INPUT_AMOUNT')
    // transfer input to contract
    await tokenQuote.transfer(pair.address, expandTo18Decimals(1))
    // invalid base output
    await expect(pair.swap(
      tokenQuote.address,
      tokenBase.address,
      expandTo18Decimals(1),
      ethers.BigNumber.from('9900000000000000000'),
      wallet.address
    )).to.be.revertedWith('DAOfiV1: INVALID_BASE_OUTPUT')
  })

  it('price:', async () => {
    const fixture = await pairFixture(wallet, 1e6, 1, 0)
    pair = fixture.pair
    await expect(pair.price()).to.be.revertedWith('DAOfiV1: UNINITIALIZED_BASE_PRICE')
  })

  it('getBaseOut:', async () => {
    const fixture = await pairFixture(wallet, 1e6, 1, 0)
    pair = fixture.pair
    await expect(pair.getBaseOut(expandTo18Decimals(1))).to.be.revertedWith('DAOfiV1: UNINITIALIZED_BASE_OUT')
  })

  it('getQuoteOut:', async () => {
    const fixture = await pairFixture(wallet, 1e6, 1, 0)
    pair = fixture.pair
    await expect(pair.getQuoteOut(expandTo18Decimals(1))).to.be.revertedWith('DAOfiV1: UNINITIALIZED_QUOTE_OUT')
  })
})

describe('DAOfiV1Pair: (y = 100x) m = 100, n = 1, fee = 0', () => {
  beforeEach(async () => {
    wallet = (await ethers.getSigners())[0]
    const fixture = await pairFixture(wallet, 1e6 * 100, 1, 0)

    factory = fixture.factory
    formula = fixture.formula
    tokenBase = fixture.tokenBase
    tokenQuote = fixture.tokenQuote
    pair = fixture.pair
  })

  // price in quote, expected base returned
  const depositTestCases: any[][] = [
    // 5e-19 too small for ethereum
    [0.00000001,  '0'],
    // Too small for formula
    [0.00000009,  '0'],
    // stable
    [0.0000001,   '1000000000'], // coresponds to bancor input 1
    [0.000001,    '9000000000'],
    [0.00001,     '99000000000'],
    [0.0001,      '999000000000'],
    [0.001,       '9999000000000'],
    [0.01,        '99999000000000'],
    [0.1,         '999999000000000'],
    [1,           '9999310000000000'],
    [10,          '99927200000000000'],
    [100,         '995443602000000000'],
  ]

  // Deposit tests which return base:
  depositTestCases.forEach((depositTestCase, i) => {
    it(`deposit: ${i}`, async () => {
      const [quotePrice, baseOut] = depositTestCase
      const baseSupply = expandTo18Decimals(1e9)
      const quoteReserveFloat = Math.trunc(getReserveForStartPrice(quotePrice, 1e8, 1) * 1e18)
      const quoteReserve = ethers.BigNumber.from(quoteReserveFloat.toString())
      const baseOutput = ethers.BigNumber.from(baseOut)
      const expectedS = baseOutput
      const expectedBaseReserve = baseSupply.sub(baseOutput)

      await tokenBase.transfer(pair.address, baseSupply)
      await tokenQuote.transfer(pair.address, quoteReserve)
      await expect(pair.deposit(wallet.address))
        .to.emit(pair, 'Deposit')
        .withArgs(wallet.address, expectedBaseReserve, quoteReserve, baseOutput, wallet.address)
      expect(await pair.supply()).to.eq(expectedS)
      expect(await tokenBase.balanceOf(wallet.address)).to.eq(baseOutput)
      expect(await tokenBase.balanceOf(pair.address)).to.eq(expectedBaseReserve)
      expect(await tokenQuote.balanceOf(pair.address)).to.eq(quoteReserve)

      const reserves = await pair.getReserves()
      expect(reserves[0]).to.eq(expectedBaseReserve)
      expect(reserves[1]).to.eq(quoteReserve)
    })
  })

  it('price:', async () => {
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1e8, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(expandTo18Decimals(1e9), quoteReserve)
    const price = await pair.price()
    expect(ethers.BigNumber.from('999931000000000000')).to.eq(price)
  })

  it('getBaseOut:', async () => {
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1e8, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(expandTo18Decimals(1e9), quoteReserve)
    const quoteIn = expandTo18Decimals(1)
    const baseOut = await pair.getBaseOut(quoteIn)
    expect(ethers.BigNumber.from('131765376349231909')).to.eq(baseOut)
  })

  it('getQuoteOut:', async () => {
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1e8, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(expandTo18Decimals(1e9), quoteReserve)
    const baseIn = ethers.BigNumber.from('9999000000000000') // the exact supply
    const quoteOut = await pair.getQuoteOut(baseIn)
    expect(ethers.BigNumber.from('4999999995171718')).to.eq(quoteOut)
  })

  it('swap: quote for base and back to quote', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    // price 1
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1e8, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    const baseReturned = ethers.BigNumber.from('9999310000000000')
    await addLiquidity(baseSupply, quoteReserve)
    // account for platform fee
    const quoteAmountIn = expandTo18Decimals(1)
    const quoteAmountInWithFee = ethers.BigNumber.from('999000000000000000')
    const baseAmountOut = await pair.getBaseOut(quoteAmountInWithFee)
    // transfer and swap
    await tokenQuote.transfer(pair.address, quoteAmountIn)
    await expect(pair.swap(tokenQuote.address, tokenBase.address, quoteAmountIn, baseAmountOut, wallet.address))
      .to.emit(tokenBase, 'Transfer')
      .withArgs(pair.address, wallet.address, baseAmountOut)
      .to.emit(pair, 'Swap')
      .withArgs(pair.address, wallet.address, tokenQuote.address, tokenBase.address, quoteAmountIn, baseAmountOut, wallet.address)
    // check reserves at point A
    const reservesA = await pair.getReserves()
    expect(reservesA[0]).to.eq(baseSupply.sub(baseAmountOut).sub(baseReturned))
    expect(reservesA[1]).to.eq(quoteAmountInWithFee.add(quoteReserve))
    // reserves + fees
    expect(await tokenBase.balanceOf(pair.address)).to.eq(baseSupply.sub(baseAmountOut).sub(baseReturned))
    expect(await tokenQuote.balanceOf(pair.address)).to.eq(quoteAmountIn.add(quoteReserve))
    // wallet balances
    expect(await tokenBase.balanceOf(wallet.address)).to.eq(baseAmountOut.add(baseReturned))
    expect(await tokenQuote.balanceOf(wallet.address)).to.eq((await tokenQuote.totalSupply()).sub(quoteReserve).sub(quoteAmountIn))

    const baseAmountIn = baseAmountOut
    const baseAmountInWithFee = ethers.BigNumber.from('131563134271995388')
    const quoteAmountOut = await pair.getQuoteOut(baseAmountInWithFee)
    await tokenBase.transfer(pair.address, baseAmountIn)
    await expect(pair.swap(tokenBase.address, tokenQuote.address, baseAmountIn, quoteAmountOut, wallet.address))
      .to.emit(tokenQuote, 'Transfer')
      .withArgs(pair.address, wallet.address, quoteAmountOut)
      .to.emit(pair, 'Swap')
      .withArgs(pair.address, wallet.address, tokenBase.address, tokenQuote.address, baseAmountIn, quoteAmountOut, wallet.address)
    // check reserves at point B
    const reservesB = await pair.getReserves()
    expect(reservesB[0]).to.eq(baseSupply.sub(baseAmountOut).sub(baseReturned).add(baseAmountInWithFee))
    expect(reservesB[1]).to.eq(quoteReserve.add(quoteAmountInWithFee).sub(quoteAmountOut))
    // reserves + fees
    expect(await tokenBase.balanceOf(pair.address)).to.eq(baseSupply.sub(baseAmountOut).sub(baseReturned).add(baseAmountIn))
    expect(await tokenQuote.balanceOf(pair.address)).to.eq(quoteAmountIn.add(quoteReserve).sub(quoteAmountOut))
    // wallet balances
    expect(await tokenBase.balanceOf(wallet.address)).to.eq(baseReturned)
    expect(await tokenQuote.balanceOf(wallet.address)).to.eq(
      (await tokenQuote.totalSupply()).sub(quoteReserve).sub(quoteAmountIn).add(quoteAmountOut)
    )
  })

  // supply, price
  const prices = [
    ['99928199000000000', '9992819900000000000'],
    ['457706063953742539', '45770606395374253900'],
    ['639534234427423994', '63953423442742399400'],
    ['780072581898194370', '78007258189819437000'],
    ['898900678080709324', '89890067808070932400'],
    ['1003758748444367417', '100375874844436741700'],
    ['1098654095292620625', '109865409529262062500'],
    ['1185980614145058685', '118598061414505868500'],
    ['1267303915070309575', '126730391507030957500']
  ]

  it('swap: verify price at supply', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    // price 10
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(10, 1e8, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(baseSupply, quoteReserve)
    // account for platform fee
    const quoteAmountIn = expandTo18Decimals(10)
    const quoteAmountInWithFee = ethers.BigNumber.from('9990000000000000000')
    for (let i = 0; i < prices.length; ++i) {
      const supply = ethers.BigNumber.from(prices[i][0])
      const expectedPrice = ethers.BigNumber.from(prices[i][1])
      // verify price
      const price = await pair.price()
      expect(price).to.eq(price)
      const contractSupply = await pair.supply()
      expect(supply).to.eq(contractSupply)
      const baseAmountOut = await pair.getBaseOut(quoteAmountInWithFee)
      // console.log(`supply ${i}:`, contractSupply.toString())
      // console.log(`price ${i}:`, price.toString())
      // transfer and swap
      await tokenQuote.transfer(pair.address, quoteAmountIn)
      await pair.swap(tokenQuote.address, tokenBase.address, quoteAmountIn, baseAmountOut, wallet.address)
    }
  })

  it('withdrawPlatformFees:', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    // price 1
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1e8, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(baseSupply, quoteReserve)
    // account for platform fee
    const quoteAmountIn = expandTo18Decimals(1)
    const quoteAmountInWithFee = ethers.BigNumber.from('999000000000000000')
    const baseAmountOut = await pair.getBaseOut(quoteAmountInWithFee)
    // transfer and swap
    await tokenQuote.transfer(pair.address, quoteAmountIn)
    await pair.swap(tokenQuote.address, tokenBase.address, quoteAmountIn, baseAmountOut, wallet.address)
    await expect(pair.withdrawPlatformFees())
      .to.emit(pair, 'WithdrawFees')
      .withArgs(wallet.address, zero, quoteAmountIn.sub(quoteAmountInWithFee), await pair.PLATFORM())
  })
})

describe('DAOfiV1Pair: (y = x) m = 1, n = 1, fee = 0', () => {
  beforeEach(async () => {
    wallet = (await ethers.getSigners())[0]
    const fixture = await pairFixture(wallet, 1e6, 1, 0)

    factory = fixture.factory
    tokenBase = fixture.tokenBase
    tokenQuote = fixture.tokenQuote
    pair = fixture.pair
  })

  it('deposit: zero supply', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    const quoteReserve = zero
    const expectedBaseReserve = baseSupply
    const expectedS = zero

    await tokenBase.transfer(pair.address, baseSupply)
    await tokenQuote.transfer(pair.address, quoteReserve)
    await expect(pair.deposit(wallet.address))
      .to.emit(pair, 'Deposit')
      .withArgs(wallet.address, expectedBaseReserve, quoteReserve, quoteReserve, wallet.address)
    expect(await pair.supply()).to.eq(expectedS)
    expect(await tokenBase.balanceOf(wallet.address)).to.eq(quoteReserve)
    expect(await tokenBase.balanceOf(pair.address)).to.eq(expectedBaseReserve)
    expect(await tokenQuote.balanceOf(pair.address)).to.eq(quoteReserve)

    const reserves = await pair.getReserves()
    expect(reserves[0]).to.eq(expectedBaseReserve)
    expect(reserves[1]).to.eq(quoteReserve)

    await expect(pair.deposit(wallet.address)).to.be.revertedWith('DOUBLE_DEPOSIT')
  })

  // price in quote, reserve quote, expected base returned
  const depositTestCases: any[][] = [
    // stable
    [0.00000001,  '9000000000'], // bancor input 100
    [0.0000001,   '99000000000'],
    [0.000001,    '999000000000'],
    [0.00001,     '9999000000000'],
    [0.0001,      '99999000000000'],
    [0.001,       '999999000000000'],
    [0.01,        '9999310000000000'],
    [0.1,         '99927200000000000'],
    [1,           '995443602000000000'],
    [10,          '9810134194000000000'],
    [100,         '94272026473000000000'],
  ]

  // Deposit tests which return base:
  depositTestCases.forEach((depositTestCase, i) => {
    it(`deposit: ${i}`, async () => {
      const [quotePrice, baseOut] = depositTestCase
      const baseSupply = expandTo18Decimals(1e9)
      const quoteReserveFloat = Math.trunc(getReserveForStartPrice(quotePrice, 1e6, 1) * 1e17)
      const quoteReserve = ethers.BigNumber.from(quoteReserveFloat.toString()+'0')
      const baseOutput = ethers.BigNumber.from(baseOut)
      const expectedS = baseOutput
      const expectedBaseReserve = baseSupply.sub(baseOutput)

      await tokenBase.transfer(pair.address, baseSupply)
      await tokenQuote.transfer(pair.address, quoteReserve)
      await expect(pair.deposit(wallet.address))
        .to.emit(pair, 'Deposit')
        .withArgs(wallet.address, expectedBaseReserve, quoteReserve, baseOutput, wallet.address)
      expect(await pair.supply()).to.eq(expectedS)
      expect(await tokenBase.balanceOf(wallet.address)).to.eq(baseOutput)
      expect(await tokenBase.balanceOf(pair.address)).to.eq(expectedBaseReserve)
      expect(await tokenQuote.balanceOf(pair.address)).to.eq(quoteReserve)

      const reserves = await pair.getReserves()
      expect(reserves[0]).to.eq(expectedBaseReserve)
      expect(reserves[1]).to.eq(quoteReserve)
    })
  })

  it('withdraw:', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    const quoteReserve = expandToDecimals(5, 17) // price 1
    const expectedBaseOutput = ethers.BigNumber.from('995443602000000000')
    const expectedBaseReserve = baseSupply.sub(expectedBaseOutput)

    await tokenBase.transfer(pair.address, baseSupply)
    await tokenQuote.transfer(pair.address, quoteReserve)
    await pair.deposit(wallet.address)

    await expect(pair.withdraw(wallet.address))
      .to.emit(pair, 'Withdraw')
      .withArgs(wallet.address, expectedBaseReserve, quoteReserve, wallet.address)
    expect(await tokenBase.balanceOf(wallet.address)).to.eq(baseSupply)
    expect(await tokenQuote.balanceOf(wallet.address)).to.eq(await tokenQuote.totalSupply())
    expect(await tokenBase.balanceOf(pair.address)).to.eq(zero)
    expect(await tokenQuote.balanceOf(pair.address)).to.eq(zero)

    const reserves = await pair.getReserves()
    expect(reserves[0]).to.eq(zero)
    expect(reserves[1]).to.eq(zero)
  })

  it('price:', async () => {
    await addLiquidity(expandTo18Decimals(1e9), expandToDecimals(5, 17)) // price 1
    const price = await pair.price()
    expect(ethers.BigNumber.from('995443602000000000')).to.eq(price)
  })

  it('getBaseOut:', async () => {
    await addLiquidity(expandTo18Decimals(1e9), expandToDecimals(5, 17)) // price 1
    const quoteIn = expandTo18Decimals(1)
    const baseOut = await pair.getBaseOut(quoteIn)
    expect(ethers.BigNumber.from('728715292733372076')).to.eq(baseOut)
  })

  it('getQuoteOut:', async () => {
    await addLiquidity(expandTo18Decimals(1e9), expandToDecimals(5, 17)) // price 1
    const baseIn = ethers.BigNumber.from('995443602000000000') // the exact supply
    const quoteOut = await pair.getQuoteOut(baseIn)
    expect(ethers.BigNumber.from('500000000000000000')).to.eq(quoteOut)
  })

  it('swap: quote for base and back to quote', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    const quoteReserve = expandToDecimals(5, 17) // price 1
    const baseReturned = ethers.BigNumber.from('995443602000000000')
    await addLiquidity(baseSupply, quoteReserve)
    // account for platform fee
    const quoteAmountIn = expandTo18Decimals(1)
    const quoteAmountInWithFee = ethers.BigNumber.from('999000000000000000')
    const baseAmountOut = await pair.getBaseOut(quoteAmountInWithFee)
    // transfer and swap
    await tokenQuote.transfer(pair.address, quoteAmountIn)
    await expect(pair.swap(tokenQuote.address, tokenBase.address, quoteAmountIn, baseAmountOut, wallet.address))
      .to.emit(tokenBase, 'Transfer')
      .withArgs(pair.address, wallet.address, baseAmountOut)
      .to.emit(pair, 'Swap')
      .withArgs(pair.address, wallet.address, tokenQuote.address, tokenBase.address, quoteAmountIn, baseAmountOut, wallet.address)
    // check reserves at point A
    const reservesA = await pair.getReserves()
    expect(reservesA[0]).to.eq(baseSupply.sub(baseAmountOut).sub(baseReturned))
    expect(reservesA[1]).to.eq(quoteAmountInWithFee.add(quoteReserve))
    // reserves + fees
    expect(await tokenBase.balanceOf(pair.address)).to.eq(baseSupply.sub(baseAmountOut).sub(baseReturned))
    expect(await tokenQuote.balanceOf(pair.address)).to.eq(quoteAmountIn.add(quoteReserve))
    // wallet balances
    expect(await tokenBase.balanceOf(wallet.address)).to.eq(baseAmountOut.add(baseReturned))
    expect(await tokenQuote.balanceOf(wallet.address)).to.eq((await tokenQuote.totalSupply()).sub(quoteReserve).sub(quoteAmountIn))

    const baseAmountIn = baseAmountOut
    const baseAmountInWithFee = ethers.BigNumber.from('727412336805963597')
    const quoteAmountOut = await pair.getQuoteOut(baseAmountInWithFee)
    await tokenBase.transfer(pair.address, baseAmountIn)
    await expect(pair.swap(tokenBase.address, tokenQuote.address, baseAmountIn, quoteAmountOut, wallet.address))
      .to.emit(tokenQuote, 'Transfer')
      .withArgs(pair.address, wallet.address, quoteAmountOut)
      .to.emit(pair, 'Swap')
      .withArgs(pair.address, wallet.address, tokenBase.address, tokenQuote.address, baseAmountIn, quoteAmountOut, wallet.address)
    // check reserves at point B
    const reservesB = await pair.getReserves()
    expect(reservesB[0]).to.eq(baseSupply.sub(baseAmountOut).sub(baseReturned).add(baseAmountInWithFee))
    expect(reservesB[1]).to.eq(quoteReserve.add(quoteAmountInWithFee).sub(quoteAmountOut))
    // reserves + fees
    expect(await tokenBase.balanceOf(pair.address)).to.eq(baseSupply.sub(baseAmountOut).sub(baseReturned).add(baseAmountIn))
    expect(await tokenQuote.balanceOf(pair.address)).to.eq(quoteAmountIn.add(quoteReserve).sub(quoteAmountOut))
    // wallet balances
    expect(await tokenBase.balanceOf(wallet.address)).to.eq(baseReturned)
    expect(await tokenQuote.balanceOf(wallet.address)).to.eq(
      (await tokenQuote.totalSupply()).sub(quoteReserve).sub(quoteAmountIn).add(quoteAmountOut)
    )
  })

  // supply, price
  const prices = [
    ['9810134194000000000', '9810134194000000000'],
    ['10745568004464202261', '10745568004464202261'],
    ['11605848981131950187', '11605848981131950187'],
    ['12406620386193746782',  '12406620386193746782'],
    ['13158751013732079232', '13158751013732079232'],
    ['13870155985989190422', '13870155985989190422'],
    ['14546811537582678101', '14546811537582678101'],
    ['15193361206271154393', '15193361206271154393'],
    ['15813498144891977569', '15813498144891977569']
  ]

  it('swap: verify price at supply', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    // price 10
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(10, 1e6, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(baseSupply, quoteReserve)
    // account for platform fee
    const quoteAmountIn = expandTo18Decimals(10)
    const quoteAmountInWithFee = ethers.BigNumber.from('9990000000000000000')
    for (let i = 0; i < prices.length; ++i) {
      const supply = ethers.BigNumber.from(prices[i][0])
      const expectedPrice = ethers.BigNumber.from(prices[i][1])
      // verify price
      const price = await pair.price()
      expect(expectedPrice).to.eq(price)
      const contractSupply = await pair.supply()
      expect(supply).to.eq(contractSupply)
      const baseAmountOut = await pair.getBaseOut(quoteAmountInWithFee)
      // console.log(`supply ${i}:`, contractSupply.toString())
      // console.log(`price ${i}:`, price.toString())
      // transfer and swap
      await tokenQuote.transfer(pair.address, quoteAmountIn)
      await pair.swap(tokenQuote.address, tokenBase.address, quoteAmountIn, baseAmountOut, wallet.address)
    }
  })

  it('withdrawPlatformFees:', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    // price 1
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1e6, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(baseSupply, quoteReserve)
    // account for platform fee
    const quoteAmountIn = expandTo18Decimals(1)
    const quoteAmountInWithFee = ethers.BigNumber.from('999000000000000000')
    const baseAmountOut = await pair.getBaseOut(quoteAmountInWithFee)
    // transfer and swap
    await tokenQuote.transfer(pair.address, quoteAmountIn)
    await pair.swap(tokenQuote.address, tokenBase.address, quoteAmountIn, baseAmountOut, wallet.address)

    // check platform quote fees
    const fees = await pair.getPlatformFees()
    expect(fees[1]).to.eq(quoteAmountIn.sub(quoteAmountInWithFee))
  })
})

describe('DAOfiV1Pair: (y = 0.000001x) m = 0.000001, n = 1, fee = 0', () => {
  beforeEach(async () => {
    wallet = (await ethers.getSigners())[0]
    const fixture = await pairFixture(wallet, 1, 1, 0)

    factory = fixture.factory
    formula = fixture.formula
    tokenBase = fixture.tokenBase
    tokenQuote = fixture.tokenQuote
    pair = fixture.pair
  })

  // price in quote, reserve quote, expected base returned
  const depositTestCases: any[][] = [
    // stable
    [0.00000001,  '50000000',  '9999310000000000'], // bancor input 100000000000000
    [0.0000001,   '5000000000', '99927200000000000'],
    [0.000001,    '500000000000', '995443602000000000'],
    [0.00001,     '50000000000000', '9810134194000000000'],
    // degraded 5%, with to 10000000000000000000000 as the bancor input
    [0.0001,      '5000000000000000', '94272026473000000000'],
    // trash
    [0.001,       '500000000000000000', '866695866786000000000'],
    [0.01,        '50000000000000000000', '7484129637737000000000'],
    [0.1,         '5000000000000000000000', '59887227305500000000000'],
    [1,           '500000000000000000000000', '440758266154048000000000'],
    [10,          '50000000000000000000000000', '2976539322672258000000000'],
    // price 100 exceeds total quote supply (5b > 1b)
    // [100,         '5000000000000000000000000000', '94272026473000000000'],
  ]

  // Deposit tests which return base:
  depositTestCases.forEach((depositTestCase, i) => {
    it(`deposit: ${i}`, async () => {
      const [quotePrice, reserve, baseOut] = depositTestCase
      const baseSupply = expandTo18Decimals(1e9)
      const quoteReserve = ethers.BigNumber.from(reserve)
      const baseOutput = ethers.BigNumber.from(baseOut)
      const expectedS = baseOutput
      const expectedBaseReserve = baseSupply.sub(baseOutput)

      await tokenBase.transfer(pair.address, baseSupply)
      await tokenQuote.transfer(pair.address, quoteReserve)
      await expect(pair.deposit(wallet.address))
        .to.emit(pair, 'Deposit')
        .withArgs(wallet.address, expectedBaseReserve, quoteReserve, baseOutput, wallet.address)
      expect(await pair.supply()).to.eq(expectedS)
      expect(await tokenBase.balanceOf(wallet.address)).to.eq(baseOutput)
      expect(await tokenBase.balanceOf(pair.address)).to.eq(expectedBaseReserve)
      expect(await tokenQuote.balanceOf(pair.address)).to.eq(quoteReserve)

      const reserves = await pair.getReserves()
      expect(reserves[0]).to.eq(expectedBaseReserve)
      expect(reserves[1]).to.eq(quoteReserve)
    })
  })

  it('price:', async () => {
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(0.00001, 1, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(expandTo18Decimals(1e9), quoteReserve)
    const price = await pair.price()
    expect(ethers.BigNumber.from('9810134194000')).to.eq(price)
  })

  it('getBaseOut:', async () => {
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(0.00001, 1, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(expandTo18Decimals(1e9), quoteReserve)
    const quoteIn = expandTo18Decimals(1)
    const baseOut = await pair.getBaseOut(quoteIn)
    expect(ethers.BigNumber.from('1377587032020009852137')).to.eq(baseOut)
  })

  it('getQuoteOut:', async () => {
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(0.00001, 1, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(expandTo18Decimals(1e9), quoteReserve)
    const baseIn = ethers.BigNumber.from('9810134194000000000') // the exact supply
    const quoteOut = await pair.getQuoteOut(baseIn)
    expect(ethers.BigNumber.from('50000000000000')).to.eq(quoteOut)
  })

  it('swap: quote for base and back to quote', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    // price 1
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(0.00001, 1, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    const baseReturned = ethers.BigNumber.from('9810134194000000000')
    await addLiquidity(baseSupply, quoteReserve)
    // account for platform fee
    const quoteAmountIn = expandTo18Decimals(1)
    const quoteAmountInWithFee = ethers.BigNumber.from('999000000000000000')
    const baseAmountOut = await pair.getBaseOut(quoteAmountInWithFee)
    // transfer and swap
    await tokenQuote.transfer(pair.address, quoteAmountIn)
    await expect(pair.swap(tokenQuote.address, tokenBase.address, quoteAmountIn, baseAmountOut, wallet.address))
      .to.emit(tokenBase, 'Transfer')
      .withArgs(pair.address, wallet.address, baseAmountOut)
      .to.emit(pair, 'Swap')
      .withArgs(pair.address, wallet.address, tokenQuote.address, tokenBase.address, quoteAmountIn, baseAmountOut, wallet.address)
    // check reserves at point A
    const reservesA = await pair.getReserves()
    expect(reservesA[0]).to.eq(baseSupply.sub(baseAmountOut).sub(baseReturned))
    expect(reservesA[1]).to.eq(quoteAmountInWithFee.add(quoteReserve))
    // reserves + fees
    expect(await tokenBase.balanceOf(pair.address)).to.eq(baseSupply.sub(baseAmountOut).sub(baseReturned))
    expect(await tokenQuote.balanceOf(pair.address)).to.eq(quoteAmountIn.add(quoteReserve))
    // wallet balances
    expect(await tokenBase.balanceOf(wallet.address)).to.eq(baseAmountOut.add(baseReturned))
    expect(await tokenQuote.balanceOf(wallet.address)).to.eq((await tokenQuote.totalSupply()).sub(quoteReserve).sub(quoteAmountIn))

    const baseAmountIn = baseAmountOut
    const baseAmountInWithFee = ethers.BigNumber.from('1375516301431413650689')
    const quoteAmountOut = await pair.getQuoteOut(baseAmountInWithFee)
    await tokenBase.transfer(pair.address, baseAmountIn)
    await expect(pair.swap(tokenBase.address, tokenQuote.address, baseAmountIn, quoteAmountOut, wallet.address))
      .to.emit(tokenQuote, 'Transfer')
      .withArgs(pair.address, wallet.address, quoteAmountOut)
      .to.emit(pair, 'Swap')
      .withArgs(pair.address, wallet.address, tokenBase.address, tokenQuote.address, baseAmountIn, quoteAmountOut, wallet.address)
    // check reserves at point B
    const reservesB = await pair.getReserves()
    expect(reservesB[0]).to.eq(baseSupply.sub(baseAmountOut).sub(baseReturned).add(baseAmountInWithFee))
    expect(reservesB[1]).to.eq(quoteReserve.add(quoteAmountInWithFee).sub(quoteAmountOut))
    // reserves + fees
    expect(await tokenBase.balanceOf(pair.address)).to.eq(baseSupply.sub(baseAmountOut).sub(baseReturned).add(baseAmountIn))
    expect(await tokenQuote.balanceOf(pair.address)).to.eq(quoteAmountIn.add(quoteReserve).sub(quoteAmountOut))
    // wallet balances
    expect(await tokenBase.balanceOf(wallet.address)).to.eq(baseReturned)
    expect(await tokenQuote.balanceOf(wallet.address)).to.eq(
      (await tokenQuote.totalSupply()).sub(quoteReserve).sub(quoteAmountIn).add(quoteAmountOut)
    )
  })

  // supply, price
  const prices = [
    ['9810134194000000000', '9810134194000'],
    ['4385042197403538397254', '4385042197403538'],
    ['6201378387688208219884', '6201378387688208'],
    ['7595103208091589143012', '7595103208091589'],
    ['8770067934505404820324', '8770067934505404'],
    ['9805232807542952261033', '9805232807542952'],
    ['10741093484575646044682', '10741093484575646'],
    ['11601706257213640665346', '11601706257213640'],
    ['12402745136176381612057', '12402745136176381']
  ]

  it('swap: verify price at supply', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    // price 10
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(0.00001, 1, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(baseSupply, quoteReserve)
    // account for platform fee
    const quoteAmountIn = expandTo18Decimals(10)
    const quoteAmountInWithFee = ethers.BigNumber.from('9990000000000000000')
    for (let i = 0; i < prices.length; ++i) {
      const supply = ethers.BigNumber.from(prices[i][0])
      const expectedPrice = ethers.BigNumber.from(prices[i][1])
      // verify price
      const price = await pair.price()
      expect(price).to.eq(price)
      const contractSupply = await pair.supply()
      expect(supply).to.eq(contractSupply)
      const baseAmountOut = await pair.getBaseOut(quoteAmountInWithFee)
      // console.log(`supply ${i}:`, contractSupply.toString())
      // console.log(`price ${i}:`, price.toString())
      // transfer and swap
      await tokenQuote.transfer(pair.address, quoteAmountIn)
      await pair.swap(tokenQuote.address, tokenBase.address, quoteAmountIn, baseAmountOut, wallet.address)
    }
  })

  it('withdrawPlatformFees:', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    // price 1
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(0.00001, 1, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(baseSupply, quoteReserve)
    // account for platform fee
    const quoteAmountIn = expandTo18Decimals(1)
    const quoteAmountInWithFee = ethers.BigNumber.from('999000000000000000')
    const baseAmountOut = await pair.getBaseOut(quoteAmountInWithFee)
    // transfer and swap
    await tokenQuote.transfer(pair.address, quoteAmountIn)
    await pair.swap(tokenQuote.address, tokenBase.address, quoteAmountIn, baseAmountOut, wallet.address)

    // check platform quote fees
    const fees = await pair.getPlatformFees()
    expect(fees[1]).to.eq(quoteAmountIn.sub(quoteAmountInWithFee))
  })
})

describe('DAOfiV1Pair: (y = x) m = 1, n = 1, fee = 3', () => {
  beforeEach(async () => {
    wallet = (await ethers.getSigners())[0]
    const fixture = await pairFixture(wallet, 1e6, 1, 3)

    factory = fixture.factory
    tokenBase = fixture.tokenBase
    tokenQuote = fixture.tokenQuote
    pair = fixture.pair
  })

  it('withdraw: including fees', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    // price 1
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1e6, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    const baseReturned = ethers.BigNumber.from('995443602000000000')
    await addLiquidity(baseSupply, quoteReserve)
    // account for platform fee
    const quoteAmountIn = expandTo18Decimals(1)
    const quoteAmountInWithFee = ethers.BigNumber.from('996000000000000000')
    const baseAmountOut = await pair.getBaseOut(quoteAmountInWithFee)
    // transfer and swap
    await tokenQuote.transfer(pair.address, quoteAmountIn)
    await pair.swap(tokenQuote.address, tokenBase.address, quoteAmountIn, baseAmountOut, wallet.address)

    // check owner quote fees
    const fees = await pair.getOwnerFees()
    expect(fees[1]).to.eq(quoteAmountIn.sub(ethers.BigNumber.from('997000000000000000')))

    // check that withdraw accounts for platform and owner fees
    const expectedBaseAmount = baseSupply.sub(baseReturned).sub(baseAmountOut)
    const expectedQuoteAmount = quoteReserve.add(quoteAmountIn).sub('1000000000000000')

    await expect(pair.withdraw(wallet.address))
      .to.emit(pair, 'Withdraw')
      .withArgs(wallet.address, expectedBaseAmount, expectedQuoteAmount, wallet.address)
  })

  it('withdrawPlatformFees:', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    // price 1
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1e6, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(baseSupply, quoteReserve)
    // account for platform fee
    const quoteAmountIn = expandTo18Decimals(1)
    const quoteAmountInWithFee = ethers.BigNumber.from('996000000000000000')
    const baseAmountOut = await pair.getBaseOut(quoteAmountInWithFee)
    // transfer and swap
    await tokenQuote.transfer(pair.address, quoteAmountIn)
    await pair.swap(tokenQuote.address, tokenBase.address, quoteAmountIn, baseAmountOut, wallet.address)

    // check platform quote fees
    const fees = await pair.getPlatformFees()
    expect(fees[1]).to.eq(quoteAmountIn.sub(ethers.BigNumber.from('999000000000000000')))
  })
})