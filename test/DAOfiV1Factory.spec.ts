import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { AddressZero } from 'ethers/constants'
import { bigNumberify } from 'ethers/utils'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'

import { expandTo18Decimals, getCreate2Address } from './shared/utilities'
import { factoryFixture } from './shared/fixtures'

import DAOfiV1Pair from '../build/DAOfiV1Pair.json'

chai.use(solidity)

const TEST_ADDRESSES: [string, string] = [
  '0x1000000000000000000000000000000000000000',
  '0x2000000000000000000000000000000000000000'
]


describe('DAOfiV1Factory', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999,
    // verbose: true,
    // logger: console
  })
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet, other])
  let factory: Contract

  async function createPair(tokens: [string, string], baseToken: string, owner:string, slope: any, exp: number, fee:number) {
    const bytecode = `0x${DAOfiV1Pair.evm.bytecode.object}`
    const create2Address = getCreate2Address(factory.address, tokens, bytecode)
    await expect(factory.createPair(...tokens, tokens[1], owner, slope, exp, fee))
      .to.emit(factory, 'PairCreated')
      .withArgs(TEST_ADDRESSES[0], TEST_ADDRESSES[1], create2Address, bigNumberify(1))

    await expect(factory.createPair(...tokens, tokens[1], owner, slope, exp, fee)).to.be.reverted // UniswapV2: PAIR_EXISTS
    await expect(factory.createPair(...tokens.slice().reverse(), tokens[1], owner, slope, exp, fee)).to.be.reverted // UniswapV2: PAIR_EXISTS
    expect(await factory.getPair(...tokens)).to.eq(create2Address)
    expect(await factory.getPair(...tokens.slice().reverse())).to.eq(create2Address)
    expect(await factory.allPairs(0)).to.eq(create2Address)
    expect(await factory.allPairsLength()).to.eq(1)

    const pair = new Contract(create2Address, JSON.stringify(DAOfiV1Pair.abi), provider)
    expect(await pair.factory()).to.eq(factory.address)
    expect(await pair.token0()).to.eq(TEST_ADDRESSES[0])
    expect(await pair.token1()).to.eq(TEST_ADDRESSES[1])
  }

  beforeEach(async () => {
    const fixture = await loadFixture(factoryFixture)
    factory = fixture.factory
  })

  it('createPair', async () => {
    await createPair(TEST_ADDRESSES, TEST_ADDRESSES[0], wallet.address, 1e6, 1, 3)
  })

  it('createPair:reverse', async () => {
    await createPair(TEST_ADDRESSES.slice().reverse() as [string, string], TEST_ADDRESSES[0], wallet.address, 1e6, 1, 3)
  })

  it('createPair:gas', async () => {
    const tx = await factory.createPair(...TEST_ADDRESSES, TEST_ADDRESSES[0], wallet.address, 1e6, 1, 3)
    const receipt = await tx.wait()
    expect(receipt.gasUsed).to.eq(4228353)
  })
})
