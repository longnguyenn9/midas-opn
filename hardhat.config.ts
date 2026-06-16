import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    opnTestnet: {
      url: "https://testnet-rpc.iopn.tech",
      chainId: 984,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  // Blockscout (v8) on OPN Chain testnet. No real key needed; any non-empty string works.
  etherscan: {
    apiKey: { opnTestnet: "blockscout" },
    customChains: [
      {
        network: "opnTestnet",
        chainId: 984,
        urls: {
          apiURL: "https://testnet.iopn.tech/api",
          browserURL: "https://testnet.iopn.tech",
        },
      },
    ],
  },
  sourcify: { enabled: false },
};

export default config;
