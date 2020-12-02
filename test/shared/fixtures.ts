import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import DAOfiV1Pair from '../../build/contracts/DAOfiV1Pair.sol/DAOfiV1Pair.json'

interface FactoryFixture {
  factory: Contract
}

export async function factoryFixture(): Promise<FactoryFixture> {
  const Factory = await ethers.getContractFactory("DAOfiV1Factory")
  const factory = await Factory.deploy()
  return { factory }
}

interface PairFixture extends FactoryFixture {
  tokenBase: Contract
  tokenQuote: Contract
  token0: Contract
  pair: Contract
}

export async function pairFixture(
  wallet: SignerWithAddress,
  reserveRatio: number = 1e6,
  fee: number = 0
): Promise<PairFixture> {
  const { factory } = await factoryFixture()
  const Token = await ethers.getContractFactory("ERC20")
  const tokenA = await Token.deploy(ethers.BigNumber.from('0x033b2e3c9fd0803ce8000000')) // 1e9 tokens
  const tokenB =  await Token.deploy(ethers.BigNumber.from('0x033b2e3c9fd0803ce8000000')) // 1e9 tokens
  await factory.createPair(
    wallet.address, // router is ourself in tests
    tokenA.address,
    tokenB.address,
    tokenA.address, // base token
    wallet.address,
    reserveRatio,
    fee
  )
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address, reserveRatio, fee)
  const pair = new Contract(pairAddress, JSON.stringify(DAOfiV1Pair.abi)).connect(wallet)
  const token0Address = (await pair.token0()).address
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  return { factory, token0, tokenBase: tokenA, tokenQuote: tokenB, pair }
}
