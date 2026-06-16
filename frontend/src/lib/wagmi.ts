import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { opnTestnet } from "./chain";

/// WalletConnect projectId — replace with your own from cloud.walletconnect.com.
/// A placeholder still allows injected wallets (MetaMask) to connect locally.
const projectId = import.meta.env.VITE_WC_PROJECT_ID ?? "midas_opn_demo";

export const wagmiConfig = getDefaultConfig({
  appName: "Midas",
  projectId,
  chains: [opnTestnet],
  transports: {
    [opnTestnet.id]: http("https://testnet-rpc.iopn.tech"),
  },
  ssr: false,
});
