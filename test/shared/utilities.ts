import { Hexable } from "@ethersproject/bytes";
import { ethers } from 'hardhat'
import { Contract } from 'ethers'
const { getAddress, keccak256, defaultAbiCoder, toUtf8Bytes, solidityPack } = ethers.utils;

const PERMIT_TYPEHASH = keccak256(
  toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)')
)

export function expandTo18Decimals(n: number): Hexable { // TODO bignumber type?
  return expandToMDecimals(n, 18)
}

export function expandToMDecimals(n: number, m: number): Hexable {
  return ethers.BigNumber.from(n).mul(ethers.BigNumber.from(10).pow(m))
}

function getDomainSeparator(name: string, tokenAddress: string) {
  return keccak256(
    defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [
        keccak256(toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
        keccak256(toUtf8Bytes(name)),
        keccak256(toUtf8Bytes('1')),
        1,
        tokenAddress
      ]
    )
  )
}

export function getCreate2Address(
  factoryAddress: string,
  [tokenA, tokenB]: [string, string],
  m: number, n: number, fee: number,
  bytecode: string
): string {
  const [token0, token1] = tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA]
  const create2Inputs = [
    '0xff',
    factoryAddress,
    keccak256(solidityPack(['address', 'address', 'uint32','uint32','uint32'], [token0, token1, m, n, fee])),
    keccak256(bytecode)
  ]
  const sanitizedInputs = `0x${create2Inputs.map(i => i.slice(2)).join('')}`
  return getAddress(`0x${keccak256(sanitizedInputs).slice(-40)}`)
}

export async function getApprovalDigest(
  token: Contract, // y no contract type
  approve: {
    owner: string
    spender: string
    value: Hexable
  },
  nonce: Hexable,
  deadline: Hexable
): Promise<string> {
  const name = await token.name
  const DOMAIN_SEPARATOR = getDomainSeparator(name, token.address)
  return keccak256(
    solidityPack(
      ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
      [
        '0x19',
        '0x01',
        DOMAIN_SEPARATOR,
        keccak256(
          defaultAbiCoder.encode(
            ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
            [PERMIT_TYPEHASH, approve.owner, approve.spender, approve.value, nonce, deadline]
          )
        )
      ]
    )
  )
}

// export async function mineBlock(provider: Web3Provider, timestamp: number): Promise<void> {
//   await new Promise(async (resolve, reject) => {
//     ;(provider._web3Provider.sendAsync as any)(
//       { jsonrpc: '2.0', method: 'evm_mine', params: [timestamp] },
//       (error: any, result: any): void => {
//         if (error) {
//           reject(error)
//         } else {
//           resolve(result)
//         }
//       }
//     )
//   })
// }

// y = mx ** n
// given y = price and x = s, solve for s
// then plug s into the antiderivative
// y' = (slopeN * x ** (n + 1)) / (slopeD * (n + 1))
// y' = quote reserve at price
export function getReserveForStartPrice(price: number, slopeN: number, slopeD: number, n: number): number {
  const s = (price * (slopeD / slopeN)) ** (1 / n)
  return (slopeN * (s ** (n + 1))) / (slopeD * (n + 1))
}
