import { ethers } from 'ethers'
import { deployContract } from 'ethereum-waffle'
import DAOfiV1Factory from '../build/contracts/DAOfiV1Factory.sol/DAOfiV1Factory.json'

async function main() {
  const provider = new ethers.providers.JsonRpcProvider('https://sokol.poa.network', 0x4d)
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || '', provider)
  console.log('wallet', wallet.address)
  const factory = await deployContract(
    wallet,
    DAOfiV1Factory,
    [],
    {
      chainId: 0x4d,
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