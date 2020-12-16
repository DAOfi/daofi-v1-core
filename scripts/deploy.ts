import { ethers } from 'ethers'
import { deployContract } from 'ethereum-waffle'
import DAOfiV1Factory from '../build/contracts/DAOfiV1Factory.sol/DAOfiV1Factory.json'

const kovanID = 0x2a
const xdaiID = 0x4d

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.JSONRPC_URL || 'https://kovan.poa.network'
  )
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || '0x011f5d8c37def36f4bd85f8b1a8e82bf104abdaac8c0710ab70e5f86dba180cc', provider)
  console.log('wallet', wallet.address)
  const factory = await deployContract(
    wallet,
    DAOfiV1Factory,
    // Bancor formula address, manually set this for now:
    ['0x3d9a79e02C35A8867222Bc69FfA9CcA59D23041c'],
    {
      chainId: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : kovanID,
      gasLimit: 9999999,
      gasPrice: ethers.utils.parseUnits('120', 'gwei')
    }
  )
  console.log('deployed factory', factory.address)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  });
