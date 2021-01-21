import BancorFormula from '@daofi/bancor/solidity/build/contracts/BancorFormula.json'
 import { ethers } from 'hardhat'
import { deployContract } from 'ethereum-waffle'
import DAOfiV1Factory from '../build/contracts/DAOfiV1Factory.sol/DAOfiV1Factory.json'

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.JSONRPC_URL || 'https://kovan.poa.network'
  )
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || '', provider)
  console.log('wallet', wallet.address)

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
