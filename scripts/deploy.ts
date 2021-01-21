import BancorFormula from '@daofi/bancor/solidity/build/contracts/BancorFormula.json'
 import { ethers } from 'hardhat'
import { deployContract } from 'ethereum-waffle'
import DAOfiV1Factory from '../build/contracts/DAOfiV1Factory.sol/DAOfiV1Factory.json'
import BancorFormula from '@daofi/bancor/solidity/build/contracts/BancorFormula.json'

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.JSONRPC_URL || 'https://kovan.poa.network'
  )
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || '', provider)
  console.log('wallet', wallet.address)
<<<<<<< HEAD
  const formula = await deployContract(
    wallet,
    BancorFormula as any, [], {
      chainId: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 0x2a,
      gasLimit: 9999999,
      gasPrice: ethers.utils.parseUnits('120', 'gwei')
    }
  )
  console.log('deployed formula', formula.address)
  const factory = await deployContract(
    wallet,
    DAOfiV1Factory,
    [formula.adress],
    {
      chainId: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 0x2a,
=======

  const formula = await deployContract(wallet, BancorFormula as any) //waffle doesn't like the type from truffle
  console.log('New BancorFormula deployed at: ' + formula.address)

  await formula.init()
  console.log('Formula initialized')

  const nonce = await wallet.getTransactionCount()

  const factory = await deployContract(
    wallet,
    DAOfiV1Factory,
    [formula.address],
    {
      nonce: nonce,
      chainId: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 0x2a, // kovan default
>>>>>>> a6247b92b6073ade9d3576b12d348016bd4c7a7a
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
