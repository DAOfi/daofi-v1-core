import { ethers } from 'ethers'
import DAOfiV1Pair from '../build/contracts/DAOfiV1Pair.sol/DAOfiV1Pair.json'

const sleep = async (time: number) => new Promise(resolve => setTimeout(resolve, time))

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.JSONRPC_URL || 'https://kovan.poa.network'
  )
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || '', provider)
  console.log('Wallet:', wallet.address)

  const pair = new ethers.Contract(process.env.PAIR || '', DAOfiV1Pair.abi, wallet)
  console.log('Pair:', pair.address)

  await pair.withdrawPlatformFees({
    gasLimit: 8000000,
    gasPrice: ethers.utils.parseUnits('200', 'gwei')
  })

  await sleep(10000)

  console.log('Fees withdrawn.')
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  });
