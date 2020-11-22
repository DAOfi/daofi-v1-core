/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  paths: {
    artifacts: "./build",
  },
  solidity: "0.7.4",
  settings: {
    evmVersion: "istanbul",
    optimizer: {
      enabled: true,
      runs: 999999,
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
};
