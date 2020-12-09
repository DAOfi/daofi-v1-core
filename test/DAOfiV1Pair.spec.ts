import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'
import { ethers } from 'hardhat'
import { getReserveForStartPrice, expandTo18Decimals, expandToDecimals } from './shared/utilities'
import { pairFixture } from './shared/fixtures'

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

describe('DAOfiV1Pair: (y = x) m = 1, n = 1, fee = 0', () => {
  beforeEach(async () => {
    wallet = (await ethers.getSigners())[0]
    const fixture = await pairFixture(wallet, 1e3, 1, 0)

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
    [1, '1000000000000000000'],
    [10, '100000000000000000000'],
    [100, '10000000000000000000000'],
    [1000, '1000000000000000000000000'],
  ]

  // Deposit tests which return base:
  depositTestCases.forEach((depositTestCase, i) => {
    it(`deposit: ${i}`, async () => {
      const [quotePrice, baseOut] = depositTestCase
      const baseSupply = expandTo18Decimals(1e9)
      const quoteReserveFloat = Math.ceil(getReserveForStartPrice(quotePrice, 1e3, 1) * 100000)
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
    const expectedBaseOutput = ethers.BigNumber.from('1000000000000000000')
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
    expect(ethers.BigNumber.from('732050807568877293')).to.eq(price)
  })

  it('getBaseOut:', async () => {
    await addLiquidity(expandTo18Decimals(1e9), expandToDecimals(5, 17)) // price 1
    const quoteIn = expandTo18Decimals(1)
    const baseOut = await pair.getBaseOut(quoteIn)
    expect(ethers.BigNumber.from('732050807568877293')).to.eq(baseOut)
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
    const baseReturned = expandTo18Decimals(1)
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
      .withArgs(wallet.address, tokenQuote.address, tokenBase.address, quoteAmountIn, baseAmountOut, wallet.address)
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
    const baseAmountInWithFee = ethers.BigNumber.from('730741887681511862')
    const quoteAmountOut = await pair.getQuoteOut(baseAmountInWithFee)
    await tokenBase.transfer(pair.address, baseAmountIn)
    await expect(pair.swap(tokenBase.address, tokenQuote.address, baseAmountIn, quoteAmountOut, wallet.address))
      .to.emit(tokenQuote, 'Transfer')
      .withArgs(pair.address, wallet.address, quoteAmountOut)
      .to.emit(pair, 'Swap')
      .withArgs(wallet.address, tokenBase.address, tokenQuote.address, baseAmountIn, quoteAmountOut, wallet.address)
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
})

describe('DAOfiV1Pair: (y = 0.001x^2) m = 0.001, n = 2, fee = 0', () => {
  beforeEach(async () => {
    wallet = (await ethers.getSigners())[0]
    const fixture = await pairFixture(wallet, 1, 2, 0)

    factory = fixture.factory
    formula = fixture.formula
    tokenBase = fixture.tokenBase
    tokenQuote = fixture.tokenQuote
    pair = fixture.pair
  })

  // price in quote, expected base returned
  const depositTestCases: any[][] = [
    [1, '31622821622821622821622'],
    [10, '1000001020001020001020001'],
    [100, '31622808242808242808242808'],
    [900, '853815822075822075822075822'],
  ]

  // Deposit tests which return base:
  depositTestCases.forEach((depositTestCase, i) => {
    it(`deposit: ${i}`, async () => {
      const [quotePrice, baseOut] = depositTestCase
      const baseSupply = expandTo18Decimals(1e9)
      const quoteReserveFloat = Math.ceil(getReserveForStartPrice(quotePrice, 1, 2) * 100000)
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
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1, 2) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(expandTo18Decimals(1e9), quoteReserve)
    const price = await pair.basePrice()
    expect(ethers.BigNumber.from('999968377554319')).to.eq(price)
  })

  it('quotePrice:', async () => {
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1, 2) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(expandTo18Decimals(1e9), quoteReserve)
    const price = await pair.quotePrice()
    expect(ethers.BigNumber.from('969945308940930655108')).to.eq(price)
  })

  it('getBaseOut:', async () => {
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1, 2) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(expandTo18Decimals(1e9), quoteReserve)
    const quoteIn = expandTo18Decimals(1)
    const baseOut = await pair.getBaseOut(quoteIn)
    expect(ethers.BigNumber.from('969945308940930655108')).to.eq(baseOut)
  })

  it('getQuoteOut:', async () => {
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1, 2) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    await addLiquidity(expandTo18Decimals(1e9), quoteReserve)
    const baseIn = expandTo18Decimals(1)
    const quoteOut = await pair.getQuoteOut(baseIn)
    expect(ethers.BigNumber.from('999968377554319')).to.eq(quoteOut)
  })

  it('swap: quote for base and back to quote', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    // price 1
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1, 2) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    const baseReturned = ethers.BigNumber.from('31622821622821622821622')
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
      .withArgs(wallet.address, tokenQuote.address, tokenBase.address, quoteAmountIn, baseAmountOut, wallet.address)
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
    const baseAmountInWithFee = ethers.BigNumber.from('968034911343900744023')
    const quoteAmountOut = await pair.getQuoteOut(baseAmountInWithFee)
    await tokenBase.transfer(pair.address, baseAmountIn)
    await expect(pair.swap(tokenBase.address, tokenQuote.address, baseAmountIn, quoteAmountOut, wallet.address))
      .to.emit(tokenQuote, 'Transfer')
      .withArgs(pair.address, wallet.address, quoteAmountOut)
      .to.emit(pair, 'Swap')
      .withArgs(wallet.address, tokenBase.address, tokenQuote.address, baseAmountIn, quoteAmountOut, wallet.address)
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

  it('withdrawPlatformFees:', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    // price 1
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1, 2) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    const baseReturned = ethers.BigNumber.from('31622821622821622821622')
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
    const fixture = await pairFixture(wallet, 1e3, 1, 3)

    factory = fixture.factory
    tokenBase = fixture.tokenBase
    tokenQuote = fixture.tokenQuote
    pair = fixture.pair
  })

  it('withdraw: including fees', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    // price 1
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1e3, 1) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    const baseReturned = expandTo18Decimals(1)
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
    const quoteReserveFloat = Math.ceil(getReserveForStartPrice(1, 1, 2) * 100000)
    const quoteReserve = expandToDecimals(quoteReserveFloat, 13)
    const baseReturned = expandTo18Decimals(1)
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