require("@nomicfoundation/hardhat-toolbox");

// Optional: set SOLCJS=1 to compile with the solc-js build from the npm "solc"
// package when binaries.soliditylang.org is unreachable (offline CI).
if (process.env.SOLCJS) {
  const { subtask } = require("hardhat/config");
  const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");
  subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args) => ({
    compilerPath: require.resolve("solc/soljson.js"),
    isSolcJs: true,
    version: args.solcVersion,
    longVersion: require("solc").version(),
  }));
}

module.exports = {
  solidity: {
    version: "0.8.19",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      blockGasLimit: 30000000,
      accounts: { count: 64 },
      // BLOCK_PERIOD_MS=2000 npx hardhat node  -> fixed block period, no automine
      mining: process.env.BLOCK_PERIOD_MS
        ? { auto: false, interval: Number(process.env.BLOCK_PERIOD_MS) }
        : { auto: true },
    },
    // Local node with a fixed 2 s block period (same block period as the
    // Hyperledger Besu QBFT default), used by scripts/benchmark.js.
    localnode: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
  },
  gasReporter: { enabled: false },
  paths: { sources: "./contracts", tests: "./test", cache: "./cache", artifacts: "./artifacts" },
};
