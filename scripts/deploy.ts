import { ethers } from 'ethers'
import { deployContract } from 'ethereum-waffle'
import DAOfiV1Factory from '../build/contracts/DAOfiV1Factory.sol/DAOfiV1Factory.json'

async function main() {
  const provider = new ethers.providers.JsonRpcProvider('https://dai.poa.network', 100)
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || '', provider)
  console.log('wallet', wallet.address)
  const factory = await deployContract(
    wallet,
    DAOfiV1Factory,
    [],
    {
      chainId: 100,
      gasLimit: 9999999,
      gasPrice: ethers.utils.parseUnits('120', 'gwei')
    }
  )
  console.log('deployed factory', await factory.addressPromise)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  });