import BancorFormula from '@daofi/bancor/solidity/build/contracts/BancorFormula.json'
import { ethers } from 'ethers'
import { deployContract } from 'ethereum-waffle'
import DAOfiV1Factory from '../build/contracts/DAOfiV1Factory.sol/DAOfiV1Factory.json'

const sleep = async (time: number) => new Promise(resolve => setTimeout(resolve, time))

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.JSONRPC_URL || 'https://kovan.poa.network'
  )
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || '', provider)
  console.log('Wallet:', wallet.address)

  // const formula = await deployContract(wallet, BancorFormula as any) //waffle doesn't like the type from truffle
  // console.log('BancorFormula deployed at:', formula.address)
  const formula = new ethers.Contract('0x16a8656849167ca8829014482a29e57ae027b4a6', (BancorFormula as any).abi, wallet)
  // const tx = await formula.init({
  //   gasLimit: 8000000,
  //   gasPrice: ethers.utils.parseUnits('200', 'gwei'),
  //   // nonce: await wallet.getTransactionCount()
  // })
  // console.log('Formula init transaction:', tx)

  // await sleep(10000)
  console.log('BancorFormula deployed at:', formula.address)
  const factory = await deployContract(
    wallet,
    DAOfiV1Factory,
    [formula.address],
    {
      gasLimit: 8000000,
      gasPrice: ethers.utils.parseUnits('200', 'gwei')
    }
  )
  console.log('Factory deployed at:', factory.address)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  });
