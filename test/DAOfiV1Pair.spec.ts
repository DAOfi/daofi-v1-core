import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'
import { ethers } from 'hardhat'
import { getReserveForStartPrice, expandTo18Decimals, expandToMDecimals } from './shared/utilities'
import { pairFixture } from './shared/fixtures'


const zero = ethers.BigNumber.from(0)

let factory: Contract
let token0: Contract
let tokenBase: Contract
let tokenQuote: Contract
let pair: Contract
let wallet: SignerWithAddress

describe('DAOfiV1Pair: m = 1, n = 1, fee = 3', () => {
  async function addLiquidity(
    tokenBase: Contract,
    baseReserve: BigNumber,
    pair: Contract
  ) {
    await tokenBase.transfer(pair.address, baseReserve)
    await pair.deposit(wallet.address)
  }

  beforeEach(async () => {
    wallet = (await ethers.getSigners())[0]
    const fixture = await pairFixture(wallet, 1e6, 1, 3)

    factory = fixture.factory
    token0 = fixture.token0
    tokenBase = fixture.tokenBase
    tokenQuote = fixture.tokenQuote
    pair = fixture.pair
  })

  it('deposit: only once', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    const expectedBaseReserve = baseSupply
    const expectedS = ethers.BigNumber.from(0)

    await tokenBase.transfer(pair.address, baseSupply)
    await expect(pair.deposit(wallet.address))
      .to.emit(pair, 'Deposit')
      .withArgs(wallet.address, expectedBaseReserve, zero, zero, wallet.address)
    expect(await pair.s()).to.eq(expectedS)
    expect(await tokenBase.balanceOf(wallet.address)).to.eq(zero)
    expect(await tokenBase.balanceOf(pair.address)).to.eq(baseSupply)
    expect(await tokenQuote.balanceOf(pair.address)).to.eq(zero)

    const reserves = await pair.getReserves()
    expect(reserves[0]).to.eq(expectedBaseReserve)
    expect(reserves[1]).to.eq(zero)

    await expect(pair.deposit(wallet.address))
      .to.be.revertedWith('DOUBLE_DEPOSIT')
  })

  // price in quote, determines initial quote liquidity using getReserveForStartPrice
  // sacle for big num conversion, allows for fractional price converstion to bignum
  // decimals for bignum conversion
  // expected base output is the amount of base returned from initial quote liqudity provided
  // expected s
  const depositTestCases: any[][] = [
    [0.1,    100,  16, '0',                        '0'], // amount is below power min num
    [0.2,    100,  16, '199990000000000000',       '19999'],
    [1,      10,   17, '999990000000000000',       '99999'],
    [10,     1,    18, '9999960000000000000',      '999996'],
    [100,    1,    18, '99993100000000000000',     '9999310']
  ]

  // Deposit tests which return base:
  depositTestCases.forEach((depositTestCase, i) => {
    it(`deposit: ${i}`, async () => {
      const [price, priceFactor, M, baseOutput, s] = depositTestCase
      const baseSupply = expandTo18Decimals(1e9)
      const quoteReserveFloat = getReserveForStartPrice(price, 1, 1, 1)
      const quoteReserve = expandToMDecimals(Math.floor(quoteReserveFloat * priceFactor), M)
      const expectedQuoteReserve = quoteReserve
      const expectedBaseOutput = ethers.BigNumber.from(baseOutput)
      const expectedS = ethers.BigNumber.from(s)
      const expectedBaseReserve = baseSupply.sub(baseOutput)

      await tokenBase.transfer(pair.address, baseSupply)
      await tokenQuote.transfer(pair.address, quoteReserve)
      await expect(pair.deposit(wallet.address))
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
    const expectedBaseOutput = ethers.BigNumber.from('9999960000000000000')
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

  it('getBaseOut:', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    await addLiquidity(tokenBase, baseSupply, pair)

    const quoteIn = expandTo18Decimals(50)
    const baseOut = await pair.getBaseOut(quoteIn)
    expect(ethers.BigNumber.from('9999960000000000000')).to.eq(baseOut)
  })

  it('getQuoteOut:', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    const quoteReserveFloat = getReserveForStartPrice(10, 1, 1, 1)
    const quoteReserve = expandTo18Decimals(quoteReserveFloat)
    const baseIn = ethers.BigNumber.from('9999960000000000000')

    await tokenBase.transfer(pair.address, baseSupply)
    await tokenQuote.transfer(pair.address, quoteReserve)
    await pair.deposit(wallet.address)

    const quoteOut = await pair.getQuoteOut(baseIn)
    expect(ethers.BigNumber.from('5000000000000000000000000000')).to.eq(quoteOut)
  })

  it('getBaseIn:', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    const quoteReserveFloat = getReserveForStartPrice(10, 1, 1, 1)
    const quoteReserve = expandTo18Decimals(quoteReserveFloat)
    const quoteOut = expandTo18Decimals(50)

    await tokenBase.transfer(pair.address, baseSupply)
    await tokenQuote.transfer(pair.address, quoteReserve)
    await pair.deposit(wallet.address)

    const baseIn = await pair.getBaseIn(quoteOut)
    expect(ethers.BigNumber.from('9999950000000000000')).to.eq(baseIn)
  })

  it('getQuoteIn:', async () => {
    const baseSupply = expandTo18Decimals(1e9)
    await addLiquidity(tokenBase, baseSupply, pair)

    const baseOut = ethers.BigNumber.from('9999960000000000000')
    const quoteIn = await pair.getQuoteIn(baseOut)
    expect(ethers.BigNumber.from('50000000000000000000')).to.eq(quoteIn)
  })

  // it('swap: quote for base and back to quote', async () => {
  //   const baseSupply = expandTo18Decimals(1e9)
  //   await addLiquidity(tokenBase, baseSupply, pair)

  //   const quoteAmountIn = expandTo18Decimals(50)
  //   const quoteMinusFee = ethers.BigNumber.from('49850000000000000000')
  //   const baseAmountOut = ethers.BigNumber.from('9795562957000000000')
  //   await tokenQuote.transfer(pair.address, quoteAmountIn)
  //   await expect(pair.swap(baseAmountOut, 0, wallet.address, '0x', overrides))
  //     .to.emit(tokenBase, 'Transfer')
  //     .withArgs(pair.address, wallet.address, baseAmountOut)
  //     .to.emit(pair, 'Swap')
  //     .withArgs(wallet.address, 0, quoteAmountIn, baseAmountOut, 0, wallet.address)

  //   const reservesA = await pair.getReserves()
  //   expect(reservesA[0]).to.eq(baseSupply.sub(baseAmountOut))
  //   expect(reservesA[1]).to.eq(quoteMinusFee)
  //   expect(await tokenBase.balanceOf(pair.address)).to.eq(baseSupply.sub(baseAmountOut))
  //   expect(await tokenQuote.balanceOf(pair.address)).to.eq(quoteAmountIn)
  //   expect(await tokenBase.balanceOf(wallet.address)).to.eq(baseAmountOut)
  //   expect(await tokenQuote.balanceOf(wallet.address)).to.eq((await tokenQuote.totalSupply()).sub(quoteAmountIn))

  //   const baseAmountIn = baseAmountOut
  //   const baseMinusFee = ethers.BigNumber.from('9766176268129000000')
  //   const quoteAmountOut = ethers.BigNumber.from('49849805435065357240')
  //   await tokenBase.transfer(pair.address, baseAmountIn)
  //   await expect(pair.swap(0, quoteAmountOut, wallet.address, '0x', overrides))
  //     .to.emit(tokenQuote, 'Transfer')
  //     .withArgs(pair.address, wallet.address, quoteAmountOut)
  //     .to.emit(pair, 'Swap')
  //     .withArgs(wallet.address, baseAmountIn, 0, 0, quoteAmountOut, wallet.address)

  //   const reservesB = await pair.getReserves()
  //   expect(reservesB[0]).to.eq(baseSupply.sub(baseAmountOut).add(baseMinusFee))
  //   expect(reservesB[1]).to.eq(quoteMinusFee.sub(quoteAmountOut))
  //   expect(await tokenBase.balanceOf(pair.address)).to.eq(baseSupply)
  //   expect(await tokenQuote.balanceOf(pair.address)).to.eq(quoteAmountIn.sub(quoteAmountOut))
  //   expect(await tokenBase.balanceOf(wallet.address)).to.eq(zero)
  //   expect(await tokenQuote.balanceOf(wallet.address)).to.eq((await tokenQuote.totalSupply()).sub(quoteAmountIn).add(quoteAmountOut))
  // })

  // it('swap: quote for base gas', async () => {
  //   console.log('TODO')
  //   // const token0Amount = expandTo18Decimals(5)
  //   // const token1Amount = expandTo18Decimals(10)
  //   // await addLiquidity(token0, token0Amount, token1, token1Amount, pair)

  //   // // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
  //   // await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
  //   // await pair.sync(overrides)

  //   // const swapAmount = expandTo18Decimals(1)
  //   // const expectedOutputAmount = ethers.BigNumber.from('453305446940074565')
  //   // await token1.transfer(pair.address, swapAmount)
  //   // await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
  //   // const tx = await pair.swap(expectedOutputAmount, 0, wallet.address, '0x', overrides)
  //   // const receipt = await tx.wait()
  //   // expect(receipt.gasUsed).to.eq(78465)
  // })

  // it('swap: quote for base gas', async () => {
  //   console.log('TODO')
  //   // const token0Amount = expandTo18Decimals(5)
  //   // const token1Amount = expandTo18Decimals(10)
  //   // await addLiquidity(token0, token0Amount, token1, token1Amount, pair)

  //   // // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
  //   // await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
  //   // await pair.sync(overrides)

  //   // const swapAmount = expandTo18Decimals(1)
  //   // const expectedOutputAmount = ethers.BigNumber.from('453305446940074565')
  //   // await token1.transfer(pair.address, swapAmount)
  //   // await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
  //   // const tx = await pair.swap(expectedOutputAmount, 0, wallet.address, '0x', overrides)
  //   // const receipt = await tx.wait()
  //   // expect(receipt.gasUsed).to.eq(78465)
  // })

  // it('price{quote,base}CumulativeLast', async () => {
  //   console.log('TODO')
  //   // const token0Amount = expandTo18Decimals(3)
  //   // const token1Amount = expandTo18Decimals(3)
  //   // await addLiquidity(token0, token0Amount, token1, token1Amount, pair)

  //   // const blockTimestamp = (await pair.blockTimestampLast())
  //   // await mineBlock(provider, blockTimestamp + 1)
  //   // await pair.sync(overrides)

  //   // const initialPrice = encodePrice(token0Amount, token1Amount)
  //   // expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0])
  //   // expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1])
  //   // expect((await pair.blockTimestampLast())).to.eq(blockTimestamp + 1)

  //   // const swapAmount = expandTo18Decimals(3)
  //   // await token0.transfer(pair.address, swapAmount)
  //   // await mineBlock(provider, blockTimestamp + 10)
  //   // // swap to a new price eagerly instead of syncing
  //   // await pair.swap(0, expandTo18Decimals(1), wallet.address, '0x', overrides) // make the price nice

  //   // expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0].mul(10))
  //   // expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1].mul(10))
  //   // expect((await pair.blockTimestampLast())).to.eq(blockTimestamp + 10)

  //   // await mineBlock(provider, blockTimestamp + 20)
  //   // await pair.sync(overrides)

  //   // const newPrice = encodePrice(expandTo18Decimals(6), expandTo18Decimals(2))
  //   // expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0].mul(10).add(newPrice[0].mul(10)))
  //   // expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1].mul(10).add(newPrice[1].mul(10)))
  //   // expect((await pair.blockTimestampLast())).to.eq(blockTimestamp + 20)
  // })
})

describe('DAOfiV1Pair: m = 2, n = 1, fee = 3', () => {
  // const provider = new MockProvider({
  //   hardfork: 'istanbul',
  //   mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
  //   gasLimit: 9999999
  // })
  // const [wallet] = provider.getWallets()

  // beforeEach(async () => {
  //   const fixture = await pairFixture(provider, wallet, 2e6, 1, 3)
  //   factory = fixture.factory
  //   token0 = fixture.token0
  //   tokenBase = fixture.tokenBase
  //   tokenQuote = fixture.tokenQuote
  //   pair = fixture.pair
  // })

  // it('deposit: price 0', async () => {
  //   console.log('TODO')
  // })
})