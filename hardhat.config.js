require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    avalanche: {
      url: "https://api.avax-test.network/ext/bc/C/rpc",
      chainId: 43113,
      accounts: [
        // Replace with your private key (NEVER commit to git!)
        "YOUR_PRIVATE_KEY_HERE"
      ],
      gas: 8000000,
      gasPrice: 25000000000, // 25 gwei (optimized for Avalanche)
      timeout: 60000 // 60 seconds
    }
  }
};