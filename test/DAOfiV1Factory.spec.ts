import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'
import { ethers } from 'hardhat'

import DAOfiV1Pair from '../build/contracts/DAOfiV1Pair.sol/DAOfiV1Pair.json'
import { getCreate2Address } from './shared/utilities'
import { factoryFixture } from './shared/fixtures'

const TEST_ADDRESSES: [string, string] = [
  '0x1000000000000000000000000000000000000000',
  '0x2000000000000000000000000000000000000000',
]

let wallet: SignerWithAddress

describe('DAOfiV1Factory', async () => {
  let factory: Contract

  async function createPair(
    router: string,
    tokenBase: string,
    tokenQuote: string,
    owner: string,
    slopeNumerator: number,
    n: number,
    fee: number
  ) {
    const bytecode = `${DAOfiV1Pair.bytecode}`
    const create2Address = getCreate2Address(factory.address, tokenBase, tokenQuote, slopeNumerator, n, fee, bytecode)
    await expect(factory.createPair(router, tokenBase, tokenQuote, owner, slopeNumerator, n, fee))
      .to.emit(factory, 'PairCreated')
      .withArgs(
        TEST_ADDRESSES[0],
        TEST_ADDRESSES[1],
        wallet.address,
        ethers.BigNumber.from(slopeNumerator),
        ethers.BigNumber.from(n),
        ethers.BigNumber.from(fee),
        create2Address,
        ethers.BigNumber.from(1)
      )
    await expect(factory.createPair(router, tokenBase, tokenBase, owner, slopeNumerator, n, fee)).to.be.reverted // DAOfiV1: IDENTICAL_ADDRESSES
    await expect(factory.createPair(router, '0x0', tokenQuote, owner, slopeNumerator, n, fee)).to.be.reverted // DAOfiV1: ZERO_ADDRESS
    await expect(factory.createPair(router, tokenBase, tokenQuote, owner, slopeNumerator, n, fee)).to.be.reverted // DAOfiV1: PAIR_EXISTS
    expect(await factory.getPair(tokenBase, tokenQuote, slopeNumerator, n, fee)).to.eq(create2Address)
    expect(await factory.allPairs(0)).to.eq(create2Address)
    expect(await factory.allPairsLength()).to.eq(1)

    const pair = new ethers.Contract(create2Address, JSON.stringify(DAOfiV1Pair.abi), wallet)
    expect(await pair.factory()).to.eq(factory.address)
    expect(await pair.baseToken()).to.eq(TEST_ADDRESSES[0])
    expect(await pair.quoteToken()).to.eq(TEST_ADDRESSES[1])
  }

  beforeEach(async () => {
    wallet = (await ethers.getSigners())[0]
    factory = (await factoryFixture(wallet)).factory
  })

  it('createPair', async () => {
    await expect(createPair('0x0', TEST_ADDRESSES[0], TEST_ADDRESSES[1], wallet.address, 1e6, 1, 0)).to.be.reverted // DAOfiV1: INVALID_ROUTER
    await expect(createPair(wallet.address, '0x0', TEST_ADDRESSES[1], wallet.address, 1e6, 1, 0)).to.be.reverted // DAOfiV1: INVALID_QUOTE
    await expect(createPair(wallet.address, TEST_ADDRESSES[0], '0x0', wallet.address, 1e6, 1, 0)).to.be.reverted // DAOfiV1: INVALID_BASE
    await expect(createPair(wallet.address, TEST_ADDRESSES[0], TEST_ADDRESSES[1], '0x0', 1e6, 1, 0)).to.be.reverted // DAOfiV1: INVALID_OWNER
    await createPair(wallet.address, TEST_ADDRESSES[0], TEST_ADDRESSES[1], wallet.address, 1e6, 1, 0)
  })

  it('createPair:gas', async () => {
    const tx = await factory.createPair(
      wallet.address,
      TEST_ADDRESSES[0],
      TEST_ADDRESSES[1],
      wallet.address,
      1e6,
      1,
      0
    )
    const receipt = await tx.wait()
    expect(receipt.gasUsed).to.eq(3533579)
  })
})
