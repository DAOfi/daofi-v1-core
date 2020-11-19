import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { solidity, MockProvider } from 'ethereum-waffle'
import { BigNumber, bigNumberify } from 'ethers/utils'

import { getReserveForStartPrice, expandTo18Decimals, expandToMDecimals } from './shared/utilities'
import { pairFixture } from './shared/fixtures'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}
const zero = bigNumberify(0)

let factory: Contract
let token0: Contract
let tokenBase: Contract
let tokenQuote: Contract
let pair: Contract

describe('DAOfiV1Pair: m = 1, n = 1, fee = 3', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const [wallet] = provider.getWallets()

  async function addLiquidityForPrice(
    price: number,
    tokenBase: Contract,
    tokenQuote: Contract,
    baseReserve: BigNumber,
    pair: Contract
  ) {
    // solve for s as a float, then convert to bignum
    const slopeN = await pair.m()
    const n = await pair.n()
    const s = (price * (1e6 / slopeN)) ** (1 / n)
    const quoteReserveFloat = Math.floor((slopeN * (s ** (n + 1))) / (1e6 * (n + 1)))
    const quoteReserve = expandTo18Decimals(quoteReserveFloat)
    const baseAmountOut = await pair.getBaseOut(quoteReserve)
    await tokenBase.transfer(pair.address, baseReserve)
    await tokenQuote.transfer(pair.address, quoteReserve)
    await pair.deposit(wallet.address, overrides)
    const reserves = await pair.getReserves()
    expect(reserves[0]).to.eq(baseReserve.sub(baseAmountOut))
    expect(reserves[1]).to.eq(quoteReserve)
  }

  beforeEach(async () => {
    const fixture = await pairFixture(provider, wallet, 1e6, 1, 3)
    factory = fixture.factory
    token0 = fixture.token0
    tokenBase = fixture.tokenBase
    tokenQuote = fixture.tokenQuote
    pair = fixture.pair
  })

  it('deposit: only once', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    const expectedBaseReserve = baseSupply
    const expectedS = bigNumberify(0)

    await tokenBase.transfer(pair.address, baseSupply)
    await expect(pair.deposit(wallet.address, overrides))
      .to.emit(pair, 'Deposit')
      .withArgs(wallet.address, expectedBaseReserve, zero, zero, wallet.address)
    expect(await pair.s()).to.eq(expectedS)
    expect(await tokenBase.balanceOf(wallet.address)).to.eq(zero)
    expect(await tokenBase.balanceOf(pair.address)).to.eq(baseSupply)
    expect(await tokenQuote.balanceOf(pair.address)).to.eq(zero)

    const reserves = await pair.getReserves()
    expect(reserves[0]).to.eq(expectedBaseReserve)
    expect(reserves[1]).to.eq(zero)

    await expect(pair.deposit(wallet.address, overrides))
      .to.be.revertedWith('DOUBLE_DEPOSIT')
  })


  // price in quote, determines initial quote liquidity using getReserveForStartPrice
  // sacle for big num conversion, allows for fractional price converstion to bignum
  // decimals for bignum conversion
  // expected base output is the amount of base returned from initial quote liqudity provided
  // expected s
  const depositTestCases: any[][] = [
    [0.1,   100,  16, '0',                        '0'],
    [0.2,   100,  16, '199734438000000000',       '199734438'],
    [1,     10,   17, '995443602000000000',       '995443602'],
    [10,    1,    18, '9810134194000000000',      '9810134194'],
    [100,   1,    18, '94272026473000000000',     '94272026473'],
    [1000,  1,    18, '866695866786000000000',    '866695866786'],
    [10000, 1,    18, '7484129637737000000000',   '7484129637737'],
    [40000, 1,    18, '26432889401827000000000',  '26432889401827'],
  ]

  // Deposit tests which return base:
  depositTestCases.forEach((depositTestCase, i) => {
    it(`deposit: ${i}`, async () => {
      const [price, priceFactor, M, baseOutput, s] = depositTestCase
      const baseSupply = expandTo18Decimals(1e9)
      const quoteReserveFloat = getReserveForStartPrice(price, 1, 1, 1)
      const quoteReserve = expandToMDecimals(Math.floor(quoteReserveFloat * priceFactor), M)
      const expectedQuoteReserve = quoteReserve
      const expectedBaseOutput = bigNumberify(baseOutput)
      const expectedS = bigNumberify(s)
      const expectedBaseReserve = baseSupply.sub(baseOutput)

      await tokenBase.transfer(pair.address, baseSupply)
      await tokenQuote.transfer(pair.address, quoteReserve)
      await expect(pair.deposit(wallet.address, overrides))
        .to.emit(pair, 'Deposit')
        .withArgs(wallet.address, expectedBaseReserve, expectedQuoteReserve, expectedBaseOutput, wallet.address)
      expect(await pair.s()).to.eq(expectedS)
      expect(await tokenBase.balanceOf(wallet.address)).to.eq(expectedBaseOutput)
      expect(await tokenBase.balanceOf(pair.address)).to.eq(expectedBaseReserve)
      expect(await tokenQuote.balanceOf(pair.address)).to.eq(quoteReserve)

      const reserves = await pair.getReserves()
      expect(reserves[0]).to.eq(expectedBaseReserve)
      expect(reserves[1]).to.eq(expectedQuoteReserve)
    })
  })

  it('withdraw:', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    const quoteReserveFloat = getReserveForStartPrice(10, 1, 1, 1)
    const quoteReserve = expandTo18Decimals(quoteReserveFloat)
    const expectedBaseOutput = bigNumberify('9810134194000000000')
    const expectedBaseReserve = baseSupply.sub(expectedBaseOutput)

    await tokenBase.transfer(pair.address, baseSupply)
    await tokenQuote.transfer(pair.address, quoteReserve)
    await pair.deposit(wallet.address, overrides)

    await expect(pair.withdraw(wallet.address, overrides))
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

  it.only('getBaseOut:', async () => {
    const quoteInFloat = getReserveForStartPrice(10, 1, 1, 1)
    const quoteIn = expandTo18Decimals(Math.floor(quoteInFloat))
    const baseOut = bigNumberify('9810134194000000000')
    await expect(pair.getBaseOut(quoteIn)).to.eq(baseOut)
  })

  it('getQuoteOut:', async () => {
  })

  it('getBaseIn:', async () => {
  })

  it('getQuoteIn:', async () => {
  })

  it('swap: quote for base and back to quote', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    await addLiquidityForPrice(0, tokenBase, tokenQuote, baseSupply, pair)

    const quoteAmountIn = expandTo18Decimals(50)
    const quoteMinusFee = bigNumberify('49850000000000000000')
    const baseAmountOut = bigNumberify('9795562957000000000')
    await tokenQuote.transfer(pair.address, quoteAmountIn)
    await expect(pair.swap(baseAmountOut, 0, wallet.address, '0x', overrides))
      .to.emit(tokenBase, 'Transfer')
      .withArgs(pair.address, wallet.address, baseAmountOut)
      .to.emit(pair, 'Swap')
      .withArgs(wallet.address, 0, quoteAmountIn, baseAmountOut, 0, wallet.address)

    const reservesA = await pair.getReserves()
    expect(reservesA[0]).to.eq(baseSupply.sub(baseAmountOut))
    expect(reservesA[1]).to.eq(quoteMinusFee)
    expect(await tokenBase.balanceOf(pair.address)).to.eq(baseSupply.sub(baseAmountOut))
    expect(await tokenQuote.balanceOf(pair.address)).to.eq(quoteAmountIn)
    expect(await tokenBase.balanceOf(wallet.address)).to.eq(baseAmountOut)
    expect(await tokenQuote.balanceOf(wallet.address)).to.eq((await tokenQuote.totalSupply()).sub(quoteAmountIn))

    const baseAmountIn = baseAmountOut
    const baseMinusFee = bigNumberify('9766176268129000000')
    const quoteAmountOut = bigNumberify('49849805435065357240')
    await tokenBase.transfer(pair.address, baseAmountIn)
    await expect(pair.swap(0, quoteAmountOut, wallet.address, '0x', overrides))
      .to.emit(tokenQuote, 'Transfer')
      .withArgs(pair.address, wallet.address, quoteAmountOut)
      .to.emit(pair, 'Swap')
      .withArgs(wallet.address, baseAmountIn, 0, 0, quoteAmountOut, wallet.address)

    const reservesB = await pair.getReserves()
    expect(reservesB[0]).to.eq(baseSupply.sub(baseAmountOut).add(baseMinusFee))
    expect(reservesB[1]).to.eq(quoteMinusFee.sub(quoteAmountOut))
    expect(await tokenBase.balanceOf(pair.address)).to.eq(baseSupply)
    expect(await tokenQuote.balanceOf(pair.address)).to.eq(quoteAmountIn.sub(quoteAmountOut))
    expect(await tokenBase.balanceOf(wallet.address)).to.eq(zero)
    expect(await tokenQuote.balanceOf(wallet.address)).to.eq((await tokenQuote.totalSupply()).sub(quoteAmountIn).add(quoteAmountOut))
  })

  it('swap: quote for base gas', async () => {
    console.log('TODO')
    // const token0Amount = expandTo18Decimals(5)
    // const token1Amount = expandTo18Decimals(10)
    // await addLiquidity(token0, token0Amount, token1, token1Amount, pair)

    // // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
    // await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
    // await pair.sync(overrides)

    // const swapAmount = expandTo18Decimals(1)
    // const expectedOutputAmount = bigNumberify('453305446940074565')
    // await token1.transfer(pair.address, swapAmount)
    // await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
    // const tx = await pair.swap(expectedOutputAmount, 0, wallet.address, '0x', overrides)
    // const receipt = await tx.wait()
    // expect(receipt.gasUsed).to.eq(78465)
  })

  it('swap: quote for base gas', async () => {
    console.log('TODO')
    // const token0Amount = expandTo18Decimals(5)
    // const token1Amount = expandTo18Decimals(10)
    // await addLiquidity(token0, token0Amount, token1, token1Amount, pair)

    // // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
    // await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
    // await pair.sync(overrides)

    // const swapAmount = expandTo18Decimals(1)
    // const expectedOutputAmount = bigNumberify('453305446940074565')
    // await token1.transfer(pair.address, swapAmount)
    // await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
    // const tx = await pair.swap(expectedOutputAmount, 0, wallet.address, '0x', overrides)
    // const receipt = await tx.wait()
    // expect(receipt.gasUsed).to.eq(78465)
  })

  it('price{quote,base}CumulativeLast', async () => {
    console.log('TODO')
    // const token0Amount = expandTo18Decimals(3)
    // const token1Amount = expandTo18Decimals(3)
    // await addLiquidity(token0, token0Amount, token1, token1Amount, pair)

    // const blockTimestamp = (await pair.blockTimestampLast())
    // await mineBlock(provider, blockTimestamp + 1)
    // await pair.sync(overrides)

    // const initialPrice = encodePrice(token0Amount, token1Amount)
    // expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0])
    // expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1])
    // expect((await pair.blockTimestampLast())).to.eq(blockTimestamp + 1)

    // const swapAmount = expandTo18Decimals(3)
    // await token0.transfer(pair.address, swapAmount)
    // await mineBlock(provider, blockTimestamp + 10)
    // // swap to a new price eagerly instead of syncing
    // await pair.swap(0, expandTo18Decimals(1), wallet.address, '0x', overrides) // make the price nice

    // expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0].mul(10))
    // expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1].mul(10))
    // expect((await pair.blockTimestampLast())).to.eq(blockTimestamp + 10)

    // await mineBlock(provider, blockTimestamp + 20)
    // await pair.sync(overrides)

    // const newPrice = encodePrice(expandTo18Decimals(6), expandTo18Decimals(2))
    // expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0].mul(10).add(newPrice[0].mul(10)))
    // expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1].mul(10).add(newPrice[1].mul(10)))
    // expect((await pair.blockTimestampLast())).to.eq(blockTimestamp + 20)
  })
})

describe('DAOfiV1Pair: m = 2, n = 1, fee = 3', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const [wallet] = provider.getWallets()

  beforeEach(async () => {
    const fixture = await pairFixture(provider, wallet, 2e6, 1, 3)
    factory = fixture.factory
    token0 = fixture.token0
    tokenBase = fixture.tokenBase
    tokenQuote = fixture.tokenQuote
    pair = fixture.pair
  })

  it('deposit: price 0', async () => {
    console.log('TODO')
  })
})