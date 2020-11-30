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
    tokenA: string,
    tokenB: string,
    baseToken: string,
    owner: string,
    m: any,
    n: number,
    fee: number
  ) {
    const bytecode = `${DAOfiV1Pair.bytecode}`
    const create2Address = getCreate2Address(factory.address, [tokenA, tokenB], m, n, fee, bytecode)
    await expect(factory.createPair(owner, tokenA, tokenB, baseToken, owner, m, n, fee))
      .to.emit(factory, 'PairCreated')
      .withArgs(
        TEST_ADDRESSES[0],
        TEST_ADDRESSES[1],
        baseToken,
        wallet.address,
        ethers.BigNumber.from(m),
        ethers.BigNumber.from(n),
        ethers.BigNumber.from(fee),
        create2Address,
        ethers.BigNumber.from(1)
      )

    await expect(factory.createPair(owner, tokenA, tokenB, tokenA, owner, m, n, fee)).to.be.reverted // UniswapV2: PAIR_EXISTS
    await expect(factory.createPair(owner, tokenB, tokenA, tokenA, owner, m, n, fee)).to.be.reverted // UniswapV2: PAIR_EXISTS
    expect(await factory.getPair(tokenA, tokenB, m, n, fee)).to.eq(create2Address)
    expect(await factory.getPair(tokenB, tokenA, m, n, fee)).to.eq(create2Address)
    expect(await factory.allPairs(0)).to.eq(create2Address)
    expect(await factory.allPairsLength()).to.eq(1)

    const pair = new ethers.Contract(create2Address, JSON.stringify(DAOfiV1Pair.abi)).connect(wallet)
    expect(await pair.factory()).to.eq(factory.address)
    expect(await pair.token0()).to.eq(TEST_ADDRESSES[0])
    expect(await pair.token1()).to.eq(TEST_ADDRESSES[1])
  }

  beforeEach(async () => {
    wallet = (await ethers.getSigners())[0]
    factory = (await factoryFixture()).factory
  })

  it('createPair', async () => {
    await createPair(wallet.address, TEST_ADDRESSES[0], TEST_ADDRESSES[1], TEST_ADDRESSES[0], wallet.address, 1e6, 1, 3)
  })

  it('createPair:reverse', async () => {
    await createPair(wallet.address, TEST_ADDRESSES[1], TEST_ADDRESSES[0], TEST_ADDRESSES[0], wallet.address, 1e6, 1, 3)
  })

  it('createPair:gas', async () => {
    const tx = await factory.createPair(
      wallet.address,
      TEST_ADDRESSES[0],
      TEST_ADDRESSES[1],
      TEST_ADDRESSES[0],
      wallet.address,
      1e6,
      1,
      3
    )
    const receipt = await tx.wait()
    expect(receipt.gasUsed).to.eq(5349577)
  })
})
