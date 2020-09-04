import { Contract, Wallet } from 'ethers'
import { Web3Provider } from 'ethers/providers'
import { deployContract } from 'ethereum-waffle'

import { expandTo18Decimals } from './utilities'

import ERC20 from '../../build/ERC20.json'
import UniswapV2Factory from '../../build/UniswapV2Factory.json'
import UniswapV2Pair from '../../build/UniswapV2Pair.json'

interface FactoryFixture {
  factory: Contract
}

const overrides = {
  gasLimit: 9999999
}

export async function factoryFixture(_: Web3Provider, [wallet]: Wallet[]): Promise<FactoryFixture> {
  const factory = await deployContract(wallet, UniswapV2Factory, [wallet.address], overrides)
  return { factory }
}

interface PairFixture extends FactoryFixture {
  token0: Contract
  token1: Contract
  token2: Contract
  pair1: Contract
  pair2: Contract
}

export async function pairFixture(provider: Web3Provider, [wallet]: Wallet[]): Promise<PairFixture> {
  const { factory } = await factoryFixture(provider, [wallet])

  const tokenA = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)], overrides)
  const tokenB = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)], overrides)
  const tokenC = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)], overrides)

  await factory.createPair(tokenA.address, tokenB.address,  wallet.address, 1, 1, 30, overrides)
  await factory.createPair(tokenB.address, tokenC.address,  wallet.address, 2, 1, 30, overrides)
  const pairAddress1 = await factory.getPair(tokenA.address, tokenB.address)
  const pairAddress2 = await factory.getPair(tokenB.address, tokenC.address)
  const pair1 = new Contract(pairAddress1, JSON.stringify(UniswapV2Pair.abi), provider).connect(wallet)
  const pair2 = new Contract(pairAddress2, JSON.stringify(UniswapV2Pair.abi), provider).connect(wallet)

  const token0Address = (await pair1.token0()).address
  const token1Address = (await pair2.token1()).address
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA
  const token2 = tokenB.address === token1Address ? tokenB : tokenC

  return { factory, token0, token1, token2,  pair1, pair2 }
}
