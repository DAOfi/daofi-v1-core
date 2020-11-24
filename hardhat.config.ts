/**
 * @type import('hardhat/config').HardhatUserConfig
 */

// import { task } from "hardhat/config"
import "@nomiclabs/hardhat-waffle"

// // This is a sample Hardhat task. To learn how to create your own go to
// // https://hardhat.org/guides/create-task.html
// task("accounts", "Prints the list of accounts", async (args, hre) => {
//   const accounts = await hre.ethers.getSigners();

//   for (const account of accounts) {
//     console.log(await account.address);
//   }
// })

export default {
  paths: {
    artifacts: "./build",
  },
  solidity: "0.7.4",
  settings: {
    evmVersion: "istanbul",
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
  outputType: "all",
  compilerOptions: {
    outputSelection: {
      "*": {
        "*": [
          "evm.bytecode.object",
          "evm.deployedBytecode.object",
          "abi",
          "evm.bytecode.sourceMap",
          "evm.deployedBytecode.sourceMap",
          "metadata"
        ],
        "": ["ast"]
      }
    }
  }
}
