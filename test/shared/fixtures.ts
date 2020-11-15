import { Contract, Wallet } from 'ethers'
import { Web3Provider } from 'ethers/providers'
import { deployContract } from 'ethereum-waffle'

import { expandTo18Decimals } from './utilities'

import ERC20 from '../../build/ERC20.json'
import DAOfiV1Factory from '../../build/DAOfiV1Factory.json'
import DAOfiV1Pair from '../../build/DAOfiV1Pair.json'

interface FactoryFixture {
  factory: Contract
}

const overrides = {
  gasLimit: 9999999
}

export async function factoryFixture(_: Web3Provider, [wallet]: Wallet[]): Promise<FactoryFixture> {
  const factory = await deployContract(wallet, DAOfiV1Factory, [], overrides)
  return { factory }
}

interface PairFixture extends FactoryFixture {
  tokenBase: Contract
  tokenQuote: Contract
  token0: Contract
  pair: Contract
}

export async function pairFixture(
  provider: Web3Provider,
  wallet: Wallet,
  m:number = 1e6,
  n: number = 1,
  fee: number = 3
): Promise<PairFixture> {
  const { factory } = await factoryFixture(provider, [wallet])
  const tokenA = await deployContract(wallet, ERC20, [expandTo18Decimals(1e6)], overrides)
  const tokenB = await deployContract(wallet, ERC20, [expandTo18Decimals(1e6)], overrides)
  await factory.createPair(
    tokenA.address, tokenB.address, tokenA.address, wallet.address, m, n, fee, overrides)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address, m, n, fee)
  const pair = new Contract(pairAddress, JSON.stringify(DAOfiV1Pair.abi), provider).connect(wallet)
  const token0Address = (await pair.token0()).address
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  return { factory, token0, tokenBase: tokenA, tokenQuote: tokenB, pair }
}
