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

  beforeEach(async () => {
    const fixture = await pairFixture(provider, wallet, 1e6, 1, 3)
    factory = fixture.factory
    token0 = fixture.token0
    tokenBase = fixture.tokenBase
    tokenQuote = fixture.tokenQuote
    pair = fixture.pair
  })

  async function addLiquidity(
    tokenBase: Contract,
    baseReserve: BigNumber,
    pair: Contract
  ) {
    await tokenBase.transfer(pair.address, baseReserve)
    await pair.deposit(overrides)
  }

  it('deposit: price 0', async () => {
    const baseReserve = expandTo18Decimals(1e6)
    const expectedS = bigNumberify(1)

    await tokenBase.transfer(pair.address, baseReserve)
    await expect(pair.deposit(overrides))
      .to.emit(pair, 'Deposit')
      .withArgs(wallet.address, baseReserve, zero, zero)
    expect(await pair.s()).to.eq(expectedS)
    expect(await tokenBase.balanceOf(wallet.address)).to.eq(zero)
    expect(await tokenBase.balanceOf(pair.address)).to.eq(baseReserve)
    expect(await tokenQuote.balanceOf(pair.address)).to.eq(zero)

    const reserves = await pair.getReserves()
    expect(reserves[0]).to.eq(baseReserve)
    expect(reserves[1]).to.eq(zero)
  })

  it('deposit: price 10', async () => {
    const baseReserve = expandTo18Decimals(1e6)
    const quoteReserveFloat = getReserveForStartPrice(10, 1, 1, 1)
    const quoteReserve = expandTo18Decimals(quoteReserveFloat)
    const expectedBaseOutput = bigNumberify('9810134193')
    const expectedS = expectedBaseOutput.add(1)
    const expectedBaseReserve = baseReserve.sub(expectedBaseOutput)

    await tokenBase.transfer(pair.address, baseReserve)
    await tokenQuote.transfer(pair.address, quoteReserve)
    await expect(pair.deposit(overrides))
      .to.emit(pair, 'Deposit')
      .withArgs(wallet.address, expectedBaseReserve, quoteReserve, expectedBaseOutput)
    expect(await pair.s()).to.eq(expectedS)
    expect(await tokenBase.balanceOf(wallet.address)).to.eq(expectedBaseOutput)
    expect(await tokenBase.balanceOf(pair.address)).to.eq(expectedBaseReserve)
    expect(await tokenQuote.balanceOf(pair.address)).to.eq(quoteReserve)

    const reserves = await pair.getReserves()
    expect(reserves[0]).to.eq(expectedBaseReserve)
    expect(reserves[1]).to.eq(quoteReserve)
  })

  it('close:', async () => {
    const baseReserve = expandTo18Decimals(1e6)
    const quoteReserveFloat = getReserveForStartPrice(10, 1, 1, 1)
    const quoteReserve = expandTo18Decimals(quoteReserveFloat)
    const expectedBaseOutput = bigNumberify('9810134193')
    const expectedBaseReserve = baseReserve.sub(expectedBaseOutput)

    await tokenBase.transfer(pair.address, baseReserve)
    await tokenQuote.transfer(pair.address, quoteReserve)
    await pair.deposit(overrides)

    await expect(pair.close(wallet.address, overrides))
      .to.emit(pair, 'Close')
      .withArgs(wallet.address, expectedBaseReserve, quoteReserve, wallet.address)
    expect(await tokenBase.balanceOf(wallet.address)).to.eq(baseReserve)
    expect(await tokenQuote.balanceOf(wallet.address)).to.eq(await tokenQuote.totalSupply())
    expect(await tokenBase.balanceOf(pair.address)).to.eq(zero)
    expect(await tokenQuote.balanceOf(pair.address)).to.eq(zero)

    const reserves = await pair.getReserves()
    expect(reserves[0]).to.eq(zero)
    expect(reserves[1]).to.eq(zero)
  })

  it('swap: quote for base and back to quote', async () => {
    const baseReserve = expandTo18Decimals(1e6)
    await addLiquidity(tokenBase, baseReserve, pair)

    const quoteAmountIn = expandTo18Decimals(20)
    const quoteAmountInWithFee = expandToMDecimals(1994, 16)
    const baseAmountOut = bigNumberify('6222312033')
    await tokenQuote.transfer(pair.address, quoteAmountIn)
    await expect(pair.swap(baseAmountOut, 0, wallet.address, '0x', overrides))
      .to.emit(tokenBase, 'Transfer')
      .withArgs(pair.address, wallet.address, baseAmountOut)
      .to.emit(pair, 'Swap')
      .withArgs(wallet.address, 0, quoteAmountIn, baseAmountOut, 0, wallet.address)

    const reservesA = await pair.getReserves()
    expect(reservesA[0]).to.eq(baseReserve.sub(baseAmountOut))
    expect(reservesA[1]).to.eq(quoteAmountInWithFee)
    expect(await tokenBase.balanceOf(pair.address)).to.eq(baseReserve.sub(baseAmountOut))
    expect(await tokenQuote.balanceOf(pair.address)).to.eq(quoteAmountIn)
    expect(await tokenBase.balanceOf(wallet.address)).to.eq(baseAmountOut)
    expect(await tokenQuote.balanceOf(wallet.address)).to.eq((await tokenQuote.totalSupply()).sub(quoteAmountIn))

    const baseAmountIn = baseAmountOut
    const baseAmountInWithFee = bigNumberify('6203645096')
    const quoteAmountOut = bigNumberify('19939416383120769615')
    await tokenBase.transfer(pair.address, baseAmountIn)
    await expect(pair.swap(0, quoteAmountOut, wallet.address, '0x', overrides))
      .to.emit(tokenQuote, 'Transfer')
      .withArgs(pair.address, wallet.address, quoteAmountOut)
      .to.emit(pair, 'Swap')
      .withArgs(wallet.address, baseAmountIn, 0, 0, quoteAmountOut, wallet.address)

    const reservesB = await pair.getReserves()
    expect(reservesB[0]).to.eq(baseReserve.sub(baseAmountOut).add(baseAmountInWithFee))
    expect(reservesB[1]).to.eq(quoteAmountInWithFee.sub(quoteAmountOut))
    expect(await tokenBase.balanceOf(pair.address)).to.eq(baseReserve)
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