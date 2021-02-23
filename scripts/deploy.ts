import BancorFormula from '@daofi/bancor/solidity/build/contracts/BancorFormula.json'
import { ethers } from 'ethers'
import { deployContract } from 'ethereum-waffle'
import DAOfiV1Factory from '../build/contracts/DAOfiV1Factory.sol/DAOfiV1Factory.json'

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.JSONRPC_URL || 'https://sokol.poa.network'
  )
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || '', provider)
  console.log('Wallet:', wallet.address)

  const formula = await deployContract(wallet, BancorFormula as any) //waffle doesn't like the type from truffle
  console.log('New BancorFormula deployed at:', formula.address)

  await formula.init()
  console.log('Formula initialized.')

  const nonce = await wallet.getTransactionCount()

  const factory = await deployContract(
    wallet,
    DAOfiV1Factory,
    [formula.address],
    {
      nonce: nonce,
      chainId: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 0x4D, // default to sokol (77)
      gasLimit: 9999999,
      gasPrice: ethers.utils.parseUnits('120', 'gwei')
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
