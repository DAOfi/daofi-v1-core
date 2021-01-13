import BancorFormula from '@daofi/bancor/solidity/build/contracts/BancorFormula.json'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { Contract } from 'ethers'
import { deployContract } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import DAOfiV1Pair from '../../build/contracts/DAOfiV1Pair.sol/DAOfiV1Pair.json'

interface FactoryFixture {
  factory: Contract
  formula: Contract
}

export async function factoryFixture(wallet: SignerWithAddress): Promise<FactoryFixture> {
  // deploy formula
  const formula = await deployContract(wallet, BancorFormula as any) //waffle doesn't like the type from truffle
  await formula.init()
  const Factory = await ethers.getContractFactory("DAOfiV1Factory")
  const factory = await Factory.deploy(formula.address)
  return { factory, formula }
}

interface PairFixture extends FactoryFixture {
  tokenBase: Contract
  tokenQuote: Contract
  pair: Contract
}

export async function pairFixture(
  wallet: SignerWithAddress,
  slopeNumerator: number = 1e6,
  n: number = 1,
  fee: number = 0
): Promise<PairFixture> {
  const { factory, formula } = await factoryFixture(wallet)
  const Token = await ethers.getContractFactory("ERC20")
  const tokenBase = await Token.deploy(ethers.BigNumber.from('0x033b2e3c9fd0803ce8000000')) // 1e9 tokens
  const tokenQuote =  await Token.deploy(ethers.BigNumber.from('0x033b2e3c9fd0803ce8000000')) // 1e9 tokens
  await factory.createPair(
    wallet.address, // router is ourself in tests
    tokenBase.address,
    tokenQuote.address,
    wallet.address,
    slopeNumerator,
    n,
    fee
  )
  const pairAddress = await factory.getPair(tokenBase.address, tokenQuote.address, slopeNumerator, n, fee)
  const pair = new Contract(pairAddress, JSON.stringify(DAOfiV1Pair.abi), wallet)
  return { factory, formula, tokenBase, tokenQuote, pair }
}
