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
      wallet.address,
      tokenBase.address,
      tokenQuote.address,
      wallet.address,
      0,
      1,
      0
    )).to.be.revertedWith('DAOfiV1: INVALID_SLOPE_NUMERATOR')
    await expect(pair.initialize(
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
      wallet.address,
      tokenBase.address,
      tokenQuote.address,
      wallet.address,
      1e6,
      0,
      0
    )).to.be.revertedWith('DAOfiV1: INVALID_N')
    await expect(pair.initialize(
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
  })

  it('deposit:', async () => {
    const wallet2 = (await ethers.getSigners())[1]
    const wallet3 = (await ethers.getSigners())[2]
    pair = (await pairFixture(wallet, 1e6, 1, 0)).pair
    // router is the initial wallet in this case, switch wallet to test restriction
    pair = await pair.connect(wallet2)
    await expect(pair.deposit(wallet3.address)).to.be.revertedWith('DAOfiV1: FORBIDDEN_DEPOSIT')
    // switch back to wallet1
    pair = await pair.connect(wallet)
    // successfull deposit
    await pair.deposit(wallet.address)
    // double deposit
    await expect(pair.deposit(wallet.address)).to.be.revertedWith('DAOfiV1: DOUBLE_DEPOSIT')
  })

  it('withdraw:', async () => {
    const wallet2 = (await ethers.getSigners())[1]
    const wallet3 = (await ethers.getSigners())[2]
    pair = (await pairFixture(wallet, 1e6, 1, 0)).pair
    // router is the initial wallet in this case, switch wallet to test restriction
    pair = await pair.connect(wallet2)
    await expect(pair.withdraw(wallet3.address)).to.be.revertedWith('DAOfiV1: FORBIDDEN_WITHDRAW')
    // switch back to wallet1
    pair = await pair.connect(wallet)
    // not deposited
    await expect(pair.withdraw(wallet.address)).to.be.revertedWith('DAOfiV1: UNINITIALIZED')
    // successfull deposit
    await pair.deposit(wallet.address)
    // empty withdraw
    await expect(pair.withdraw(wallet.address)).to.not.be.revertedWith('DAOfiV1: UNINITIALIZED')
  })

  it('withdrawPlatformFees:', async () => {
    pair = (await pairFixture(wallet, 1e6, 1, 0)).pair
    await expect(pair.withdrawPlatformFees(wallet.address)).to.be.revertedWith('DAOfiV1: FORBIDDEN_WITHDRAW')
  })

  it('swap: initial requires', async () => {
    const fixture = await pairFixture(wallet, 1e6, 1, 0)
    pair = fixture.pair
    tokenBase = fixture.tokenBase
    tokenQuote = fixture.tokenQuote
    // not deposited
    await expect(pair.swap(
      tokenQuote.address,
      tokenBase.address,
      expandTo18Decimals(1),
      ethers.BigNumber.from('99306510000000000'),
      wallet.address
    )).to.be.revertedWith('DAOfiV1: UNINITIALIZED_SWAP')
    // successfull deposit
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

  it('basePrice:', async () => {
    const fixture = await pairFixture(wallet, 1e6, 1, 0)
    pair = fixture.pair
    await expect(pair.basePrice()).to.be.revertedWith('DAOfiV1: UNINITIALIZED_BASE_PRICE')
  })

  it('quotePrice:', async () => {
    const fixture = await pairFixture(wallet, 1e6, 1, 0)
    pair = fixture.pair
    await expect(pair.quotePrice()).to.be.revertedWith('DAOfiV1: UNINITIALIZED_QUOTE_PRICE')
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

  // price in quote, expected base returned
  const depositTestCases: any[][] = [
    [1, '999900000000000000'],
    [10, '9999900000000000000'],
  ]

  // Deposit tests which return base:
  depositTestCases.forEach((depositTestCase, i) => {
    it(`deposit: ${i}`, async () => {
      const [quotePrice, baseOut] = depositTestCase
      const baseSupply = expandTo18Decimals(1e9)
      const quoteReserveFloat = Math.ceil(getReserveForStartPrice(quotePrice, 1e6, 1) * 100000)
      const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
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
    const expectedBaseOutput = ethers.BigNumber.from('999900000000000000')
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

  it('basePrice:', async () => {
    await addLiquidity(expandTo18Decimals(1e9), expandToDecimals(5, 17)) // price 1
    const price = await pair.basePrice()
    expect(ethers.BigNumber.from('500000000000000000')).to.eq(price)
  })

  it('quotePrice:', async () => {
    await addLiquidity(expandTo18Decimals(1e9), expandToDecimals(5, 17)) // price 1
    const price = await pair.quotePrice()
    expect(ethers.BigNumber.from('731977600000000000')).to.eq(price)
  })

  it('getBaseOut:', async () => {
    await addLiquidity(expandTo18Decimals(1e9), expandToDecimals(5, 17)) // price 1
    const quoteIn = expandTo18Decimals(1)
    const baseOut = await pair.getBaseOut(quoteIn)
    expect(ethers.BigNumber.from('731977600000000000')).to.eq(baseOut)
  })

  it('getQuoteOut:', async () => {
    await addLiquidity(expandTo18Decimals(1e9), expandToDecimals(5, 17)) // price 1
    const baseIn = expandTo18Decimals(1)
    const quoteOut = await pair.getQuoteOut(baseIn)
    expect(ethers.BigNumber.from('500000000000000000')).to.eq(quoteOut)
  })

  it('swap: quote for base and back to quote', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    const quoteReserve = expandToDecimals(5, 17) // price 1
    const baseReturned = ethers.BigNumber.from('999900000000000000')
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
    const baseAmountInWithFee = ethers.BigNumber.from('730668809790000000')
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

  // supply, base price
  const prices = [
    ['9999900000000000000', '9500090000000000000'],
    ['9000900000000000000', '8501070020000000000'],
    ['8001900000000000000', '7502050040000000000'],
    ['7002900000000000000',  '6503030060000000000'],
    ['6003900000000000000', '5504010080000000000'],
    ['5004900000000000000', '4504990090000000000'],
    ['4005900000000000000', '3505970120000000000'],
    ['3006900000000000000', '2506950140000000000'],
    ['2007900000000000000', '1507930160000000000']
  ]

  it('swap: verify price at supply', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    // price 10
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(10, 1e6, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(baseSupply, quoteReserve)
    // account for platform fee
    const baseAmountIn = expandTo18Decimals(1)
    const baseAmountInWithFee = ethers.BigNumber.from('999000000000000000')

    for (let i = 0; i < prices.length; ++i) {
      const supply = ethers.BigNumber.from(prices[i][0])
      const price = ethers.BigNumber.from(prices[i][1])
      // verify price
      const basePrice = await pair.basePrice()
      expect(price).to.eq(basePrice)
      const contractSupply = await pair.supply()
      expect(supply).to.eq(contractSupply)
      const quoteAmountOut = await pair.getQuoteOut(baseAmountInWithFee)
      // transfer and swap
      await tokenBase.transfer(pair.address, expandTo18Decimals(1))
      await pair.swap(tokenBase.address, tokenQuote.address, baseAmountIn, quoteAmountOut, wallet.address)
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
    [1, '9900000000000000'],
    [10, '100000000000000000'],
  ]

  // Deposit tests which return base:
  depositTestCases.forEach((depositTestCase, i) => {
    it(`deposit: ${i}`, async () => {
      const [quotePrice, baseOut] = depositTestCase
      const baseSupply = expandTo18Decimals(1e9)
      const quoteReserveFloat = Math.ceil(getReserveForStartPrice(quotePrice, 1e8, 1) * 100000)
      const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
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

  it('basePrice:', async () => {
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1e8, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(expandTo18Decimals(1e9), quoteReserve)
    const price = await pair.basePrice()
    expect(ethers.BigNumber.from('5000000000000000')).to.eq(price)
  })

  it('quotePrice:', async () => {
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1e8, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(expandTo18Decimals(1e9), quoteReserve)
    const price = await pair.quotePrice()
    expect(ethers.BigNumber.from('130456720000000000')).to.eq(price)
  })

  it('getBaseOut:', async () => {
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1e8, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(expandTo18Decimals(1e9), quoteReserve)
    const quoteIn = expandTo18Decimals(1)
    const baseOut = await pair.getBaseOut(quoteIn)
    expect(ethers.BigNumber.from('130456720000000000')).to.eq(baseOut)
  })

  it('getQuoteOut:', async () => {
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1e8, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(expandTo18Decimals(1e9), quoteReserve)
    const baseIn = expandTo18Decimals(1)
    const quoteOut = await pair.getQuoteOut(baseIn)
    expect(ethers.BigNumber.from('5000000000000000')).to.eq(quoteOut)
  })

  it('swap: quote for base and back to quote', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    // price 1
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1e8, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    const baseReturned = ethers.BigNumber.from('9900000000000000')
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
    const baseAmountInWithFee = ethers.BigNumber.from('130256483130000000')
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

  // supply, base price
  const prices = [
    ['3161514300000000000000', '3162540000000000'],
    ['3160515300000000000000', '3161540000000000'],
    ['3159516300000000000000', '3160540000000000'],
    ['3158517300000000000000', '3159540000000000'],
    ['3157518300000000000000', '3158540000000000'],
    ['3156519300000000000000', '3157540000000000'],
    ['3155520300000000000000', '3156540000000000'],
    ['3154521300000000000000', '3155540000000000'],
    ['3153522300000000000000', '3154540000000000']
  ]

  it.only('swap: verify price at reserve', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    // price 10
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(10, 1e8, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(baseSupply, quoteReserve)
    // account for platform fee
    const baseAmountIn = expandToDecimals(1, 16)
    const baseAmountInWithFee = ethers.BigNumber.from('90000000')
    for (let i = 0; i < prices.length; ++i) {
      const supply = ethers.BigNumber.from(prices[i][0])
      const price = ethers.BigNumber.from(prices[i][1])
      // verify price
      const basePrice = await pair.basePrice()
      //expect(price).to.eq(basePrice)
      const contractSupply = await pair.supply()
      //expect(supply).to.eq(contractSupply)
      const quoteAmountOut = await pair.getQuoteOut(baseAmountInWithFee)
      console.log('supply:', contractSupply.toString())
      console.log('price:', basePrice.toString())
      // transfer and swap
      await tokenBase.transfer(pair.address, expandTo18Decimals(1))
      await pair.swap(tokenBase.address, tokenQuote.address, baseAmountIn, quoteAmountOut, wallet.address)
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

  // price in quote, expected base returned
  const depositTestCases: any[][] = [
    [1, '981013419400000000000000'],
    [10, '9427202647300000000000000'],
  ]

  // Deposit tests which return base:
  depositTestCases.forEach((depositTestCase, i) => {
    it(`deposit: ${i}`, async () => {
      const [quotePrice, baseOut] = depositTestCase
      const baseSupply = expandTo18Decimals(1e9)
      const quoteReserveFloat = Math.ceil(getReserveForStartPrice(quotePrice, 1, 1) * 100000)
      const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
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

  it('basePrice:', async () => {
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(expandTo18Decimals(1e9), quoteReserve)
    const price = await pair.basePrice()
    expect(ethers.BigNumber.from('1019353520000000000')).to.eq(price)
  })

  it('quotePrice:', async () => {
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(expandTo18Decimals(1e9), quoteReserve)
    const price = await pair.quotePrice()
    expect(ethers.BigNumber.from('981012920000000000')).to.eq(price)
  })

  it('getBaseOut:', async () => {
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(expandTo18Decimals(1e9), quoteReserve)
    const quoteIn = expandTo18Decimals(1)
    const baseOut = await pair.getBaseOut(quoteIn)
    expect(ethers.BigNumber.from('981012920000000000')).to.eq(baseOut)
  })

  it('getQuoteOut:', async () => {
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(expandTo18Decimals(1e9), quoteReserve)
    const baseIn = expandTo18Decimals(1)
    const quoteOut = await pair.getQuoteOut(baseIn)
    expect(ethers.BigNumber.from('1019353520000000000')).to.eq(quoteOut)
  })

  it('swap: quote for base and back to quote', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    // price 1
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    const baseReturned = ethers.BigNumber.from('981013419400000000000000')
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
    const baseAmountInWithFee = ethers.BigNumber.from('979051878090000000')
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

  // supply, base price
  const prices = [
    ['3161514300000000000000', '3162540000000000'],
    ['3160515300000000000000', '3161540000000000'],
    ['3159516300000000000000', '3160540000000000'],
    ['3158517300000000000000', '3159540000000000'],
    ['3157518300000000000000', '3158540000000000'],
    ['3156519300000000000000', '3157540000000000'],
    ['3155520300000000000000', '3156540000000000'],
    ['3154521300000000000000', '3155540000000000'],
    ['3153522300000000000000', '3154540000000000']
  ]

  it('swap: verify price at supply', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    // price 100
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(100, 1, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(baseSupply, quoteReserve)
    // account for platform fee
    const baseAmountIn = expandTo18Decimals(1)
    const baseAmountInWithFee = ethers.BigNumber.from('999000000000000000')

    for (let i = 0; i < prices.length; ++i) {
      const supply = ethers.BigNumber.from(prices[i][0])
      const price = ethers.BigNumber.from(prices[i][1])
      // verify price
      const basePrice = await pair.basePrice()
      expect(price).to.eq(basePrice)
      const contractSupply = await pair.supply()
      expect(supply).to.eq(contractSupply)
      const quoteAmountOut = await pair.getQuoteOut(baseAmountInWithFee)
      // transfer and swap
      await tokenBase.transfer(pair.address, expandTo18Decimals(1))
      await pair.swap(tokenBase.address, tokenQuote.address, baseAmountIn, quoteAmountOut, wallet.address)
    }
  })

  it('withdrawPlatformFees:', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    // price 1
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1, 1) * 100000)
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
    const baseReturned = ethers.BigNumber.from('999900000000000000')
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