import { defineChain } from "viem";

/// OPN Chain testnet (chainId 984). EVM-compatible, built on Cosmos SDK.
export const opnTestnet = defineChain({
  id: 984,
  name: "OPN Chain Testnet",
  nativeCurrency: { name: "OPN", symbol: "OPN", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.iopn.tech"] },
  },
  blockExplorers: {
    default: { name: "OPN Explorer", url: "https://testnet.iopn.tech" },
  },
  testnet: true,
});
