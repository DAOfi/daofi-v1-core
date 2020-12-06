import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'
import { ethers } from 'hardhat'
import { getReserveForStartPrice, expandTo18Decimals, expandToDecimals } from './shared/utilities'
import { pairFixture } from './shared/fixtures'

const zero = ethers.BigNumber.from(0)

let factory: Contract
let formula: Contract
let token0: Contract
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
    token0 = fixture.token0
    tokenBase = fixture.tokenBase
    tokenQuote = fixture.tokenQuote
    pair = fixture.pair
  })

  it('deposit: only once', async () => {
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

  // price in quote, multiplier for BigNum, decimals to expand quote, expected base
  const depositTestCases: any[][] = [
    [1, 1],
    // [3, '5'],
    // [4, '2'],
    // [5, '5'],
    // [10, '10'],
    // [100, '100'],
    // [1000, '1000'],
  ]

  // Deposit tests which return base:
  depositTestCases.forEach((depositTestCase, i) => {
    it.only(`deposit: ${i}`, async () => {
      const [quotePrice, baseOut] = depositTestCase
      const baseSupply = expandTo18Decimals(1e9)
      const quoteReserveFloat = getReserveForStartPrice(quotePrice, 1e3, 1)
      const quoteReserve = ethers.BigNumber.from(`${Math.ceil(quoteReserveFloat * (10 ** 18))}`)
      console.log(`quote expanded 18 decimals`, quoteReserve)
      const baseOutput = expandTo18Decimals(baseOut)
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
    const quoteReserve = expandTo18Decimals(50)
    const expectedBaseOutput = quoteReserve
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
    await addLiquidity(expandTo18Decimals(1e9), expandTo18Decimals(10))
    const price = await pair.basePrice()
    expect(ethers.BigNumber.from('1899999999999999999')).to.eq(price)
  })

  it('quotePrice:', async () => {
    await addLiquidity(expandTo18Decimals(1e9), expandTo18Decimals(10))
    const price = await pair.quotePrice()
    expect(ethers.BigNumber.from('488088481701515469')).to.eq(price)
  })

  it('getBaseOut:', async () => {
    await addLiquidity(expandTo18Decimals(1e9), expandTo18Decimals(10))
    const quoteIn = expandTo18Decimals(1)
    const baseOut = await pair.getBaseOut(quoteIn)
    expect(ethers.BigNumber.from('488088481701515469')).to.eq(baseOut)
  })

  it('getQuoteOut:', async () => {
    await addLiquidity(expandTo18Decimals(1e9), expandTo18Decimals(10))
    const baseIn = expandTo18Decimals(1)
    const quoteOut = await pair.getQuoteOut(baseIn)
    expect(ethers.BigNumber.from('1899999999999999999')).to.eq(quoteOut)
  })

  it.skip('getBaseIn:', async () => {
    await addLiquidity(expandTo18Decimals(1e9), expandTo18Decimals(10))
    const expectedBaseIn = expandTo18Decimals(1)
    const quoteOut = await pair.getQuoteOut(expectedBaseIn)
    const baseIn = await pair.getBaseIn(quoteOut) // 908712114635714411 instead of 10^18
    expect(expectedBaseIn).to.eq(baseIn)
  })

  it.skip('getQuoteIn:', async () => {
    await addLiquidity(expandTo18Decimals(1e9), expandTo18Decimals(10))
    const expectedQuoteIn = expandTo18Decimals(1)
    const baseOut = await pair.getBaseOut(expectedQuoteIn)
    const quoteIn = await pair.getQuoteIn(baseOut) // 999999999999999999 instead of 10^18
    expect(expectedQuoteIn).to.eq(quoteIn)
  })

  it('swap: quote for base and back to quote', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    const baseReturned = expandTo18Decimals(50)
    const quoteReserve = expandTo18Decimals(50)
    await addLiquidity(baseSupply, quoteReserve)

    const quoteAmountIn = expandTo18Decimals(1)
    const baseAmountOut = await pair.getBaseOut(quoteAmountIn)
    await tokenQuote.transfer(pair.address, quoteAmountIn)
    await expect(pair.swap(tokenQuote, tokenBase, quoteAmountIn, wallet.address, '0x'))
      .to.emit(tokenBase, 'Transfer')
      .withArgs(pair.address, wallet.address, baseAmountOut)
      .to.emit(pair, 'Swap')
      .withArgs(wallet.address, tokenQuote, tokenBase, baseAmountOut, wallet.address)

    const reservesA = await pair.getReserves()
    expect(reservesA[0]).to.eq(baseSupply.sub(baseAmountOut).sub(baseReturned))
    expect(reservesA[1]).to.eq(quoteAmountIn.add(quoteReserve))
    expect(await tokenBase.balanceOf(pair.address)).to.eq(baseSupply.sub(baseAmountOut).sub(baseReturned))
    expect(await tokenQuote.balanceOf(pair.address)).to.eq(quoteAmountIn.add(quoteReserve))
    expect(await tokenBase.balanceOf(wallet.address)).to.eq(baseAmountOut.add(baseReturned))
    expect(await tokenQuote.balanceOf(wallet.address)).to.eq((await tokenQuote.totalSupply()).sub(quoteReserve).sub(quoteAmountIn))

    const baseAmountIn = baseAmountOut
    const quoteAmountOut = await pair.getQuoteOut(baseAmountIn)
    await tokenBase.transfer(pair.address, baseAmountIn)
    await expect(pair.swap(tokenBase, tokenQuote, quoteAmountOut, wallet.address, '0x'))
      .to.emit(tokenQuote, 'Transfer')
      .withArgs(pair.address, wallet.address, quoteAmountOut)
      .to.emit(pair, 'Swap')
      .withArgs(wallet.address, tokenBase, tokenQuote, quoteAmountOut, wallet.address)

    const reservesB = await pair.getReserves()
    expect(reservesB[0]).to.eq(baseSupply.sub(baseAmountOut).sub(baseReturned).add(baseAmountIn))
    expect(reservesB[1]).to.eq(quoteReserve.add(quoteAmountIn).sub(quoteAmountOut))
    expect(await tokenBase.balanceOf(pair.address)).to.eq(baseSupply.sub(baseAmountOut).sub(baseReturned).add(baseAmountIn))
    expect(await tokenQuote.balanceOf(pair.address)).to.eq(quoteAmountIn.add(quoteReserve).sub(quoteAmountOut))
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
    token0 = fixture.token0
    tokenBase = fixture.tokenBase
    tokenQuote = fixture.tokenQuote
    pair = fixture.pair
  })

  // price in quote, multiplier for BigNum, decimals to expand quote, expected base
  const depositTestCases: any[][] = [
    [1, '31622808224492015492'],
    // [3, '5'],
    // [4, '2'],
    // [5, '5'],
    // [10, '10'],
    // [100, '100'],
    // [1000, '1000'],
  ]

  // Deposit tests which return base:
  depositTestCases.forEach((depositTestCase, i) => {
    it.only(`deposit: ${i}`, async () => {
      const [quotePrice, baseOut] = depositTestCase
      const baseSupply = expandTo18Decimals(1e9)
      const quoteReserveFloat = getReserveForStartPrice(quotePrice, 1, 2)
      const quoteReserve = ethers.BigNumber.from(`${Math.ceil(quoteReserveFloat * (10 ** 18))}`)
      console.log(`quote expanded 18 decimals`, quoteReserve)
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
    await addLiquidity(expandTo18Decimals(1e9), expandTo18Decimals(10))
    const price = await pair.basePrice()
    expect(ethers.BigNumber.from('2710002304236417509')).to.eq(price)
  })

  it('quotePrice:', async () => {
    await addLiquidity(expandTo18Decimals(1e9), expandTo18Decimals(10))
    const price = await pair.quotePrice()
    expect(ethers.BigNumber.from('322800826607665426')).to.eq(price)
  })

  it('getBaseOut:', async () => {
    await addLiquidity(expandTo18Decimals(1e9), expandTo18Decimals(10))
    const quoteIn = expandTo18Decimals(1)
    const baseOut = await pair.getBaseOut(quoteIn)
    expect(ethers.BigNumber.from('322800826607665426')).to.eq(baseOut)
  })

  it('getQuoteOut:', async () => {
    await addLiquidity(expandTo18Decimals(1e9), expandTo18Decimals(10))
    let baseIn = expandTo18Decimals(1)
    let quoteOut = await pair.getQuoteOut(baseIn)
    expect(ethers.BigNumber.from('2710002304236417509')).to.eq(quoteOut)
  })

  it('swap: quote for base and back to quote', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    const baseReturned = expandTo18Decimals(50)
    const quoteReserve = expandTo18Decimals(50)
    await addLiquidity(baseSupply, quoteReserve)

    const quoteAmountIn = expandTo18Decimals(1)
    const baseAmountOut = await pair.getBaseOut(quoteAmountIn)
    await tokenQuote.transfer(pair.address, quoteAmountIn)
    await expect(pair.swap(baseAmountOut, 0, wallet.address, '0x'))
      .to.emit(tokenBase, 'Transfer')
      .withArgs(pair.address, wallet.address, baseAmountOut)
      .to.emit(pair, 'Swap')
      .withArgs(wallet.address, 0, quoteAmountIn, baseAmountOut, 0, wallet.address)

    const reservesA = await pair.getReserves()
    expect(reservesA[0]).to.eq(baseSupply.sub(baseAmountOut).sub(baseReturned))
    expect(reservesA[1]).to.eq(quoteAmountIn.add(quoteReserve))
    expect(await tokenBase.balanceOf(pair.address)).to.eq(baseSupply.sub(baseAmountOut).sub(baseReturned))
    expect(await tokenQuote.balanceOf(pair.address)).to.eq(quoteAmountIn.add(quoteReserve))
    expect(await tokenBase.balanceOf(wallet.address)).to.eq(baseAmountOut.add(baseReturned))
    expect(await tokenQuote.balanceOf(wallet.address)).to.eq((await tokenQuote.totalSupply()).sub(quoteReserve).sub(quoteAmountIn))

    const baseAmountIn = baseAmountOut
    const quoteAmountOut = await pair.getQuoteOut(baseAmountIn)
    await tokenBase.transfer(pair.address, baseAmountIn)
    await expect(pair.swap(0, quoteAmountOut, wallet.address, '0x'))
      .to.emit(tokenQuote, 'Transfer')
      .withArgs(pair.address, wallet.address, quoteAmountOut)
      .to.emit(pair, 'Swap')
      .withArgs(wallet.address, baseAmountIn, 0, 0, quoteAmountOut, wallet.address)

    const reservesB = await pair.getReserves()
    expect(reservesB[0]).to.eq(baseSupply.sub(baseAmountOut).sub(baseReturned).add(baseAmountIn))
    expect(reservesB[1]).to.eq(quoteReserve.add(quoteAmountIn).sub(quoteAmountOut))
    expect(await tokenBase.balanceOf(pair.address)).to.eq(baseSupply.sub(baseAmountOut).sub(baseReturned).add(baseAmountIn))
    expect(await tokenQuote.balanceOf(pair.address)).to.eq(quoteAmountIn.add(quoteReserve).sub(quoteAmountOut))
    expect(await tokenBase.balanceOf(wallet.address)).to.eq(baseReturned)
    expect(await tokenQuote.balanceOf(wallet.address)).to.eq(
      (await tokenQuote.totalSupply()).sub(quoteReserve).sub(quoteAmountIn).add(quoteAmountOut)
    )
  })

  it.only('power:', async () => {
    const bN = expandTo18Decimals(50).mul(1e3).mul(3);
    const bD = ethers.BigNumber.from(1)
    const eN = 1
    const eD = 3
    console.log('params:', bN, bD, eN, eD)
    const results = await formula.power(bN, bD, eN, eD);
    console.log(results)
  })
})
