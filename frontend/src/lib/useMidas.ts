import { useAccount, useBalance, useReadContract, useReadContracts } from "wagmi";
import { deployment } from "./deployment";
import { erc20Abi, multiVaultAbi, airdropAbi, repOracleAbi } from "./abis";

const ZERO = "0x0000000000000000000000000000000000000000" as const;
const REFETCH = { query: { refetchInterval: 8_000 } } as const;

/// Per-pool on-chain state for the connected account.
export interface PoolState {
  pid: number;
  symbol: string;
  decimals: number;
  alloc: number;
  token: `0x${string}`;
  isNative: boolean; // WOPN pool — staked via wrap of native OPN
  walletBalance?: bigint; // ERC20 balance of the underlying token
  nativeBalance?: bigint; // native OPN balance (WOPN pool only)
  allowance?: bigint; // token → vault allowance
  staked?: bigint; // userInfo.amount
  pending?: bigint; // pendingReward (GOLD)
  totalShares?: bigint;
  allocPoint?: bigint;
}

/// Global account-level state (boost, GOLD balance, rep) shared across pools.
export function useMidas() {
  const { address } = useAccount();
  const user = address ?? ZERO;

  const global = useReadContracts({
    ...REFETCH,
    contracts: [
      { address: deployment.gold, abi: erc20Abi, functionName: "balanceOf", args: [user] },
      { address: deployment.vault, abi: multiVaultAbi, functionName: "boostBps", args: [user] },
      { address: deployment.repOracle, abi: repOracleAbi, functionName: "repOf", args: [user] },
      { address: deployment.vault, abi: multiVaultAbi, functionName: "rewardPerSecond" },
      { address: deployment.vault, abi: multiVaultAbi, functionName: "totalAllocPoint" },
      { address: deployment.airdrop, abi: airdropAbi, functionName: "hasClaimed", args: [user] },
    ],
  });

  const g = global.data;
  const pick = (i: number): bigint | undefined =>
    g?.[i]?.status === "success" ? (g[i].result as bigint) : undefined;

  return {
    isConnected: !!address,
    address,
    refetch: () => global.refetch(),
    goldBalance: pick(0),
    boostBps: pick(1),
    rep: pick(2),
    rewardPerSecond: pick(3),
    totalAllocPoint: pick(4),
    hasClaimedAirdrop:
      g?.[5]?.status === "success" ? (g[5].result as boolean) : undefined,
    loading: global.isLoading,
  };
}

/// Reads every pool's state for the connected account in two batched multicalls.
export function usePools(): { pools: PoolState[]; refetch: () => void; loading: boolean } {
  const { address } = useAccount();
  const user = address ?? ZERO;
  const metas = deployment.pools;

  // Native OPN balance, for the WOPN pool's "wrap & stake" flow.
  const native = useBalance({ address, query: { refetchInterval: 8_000 } });

  // Per-pool token reads: balanceOf(user), allowance(user, vault).
  const tokenReads = useReadContracts({
    ...REFETCH,
    contracts: metas.flatMap((p) => [
      { address: p.token, abi: erc20Abi, functionName: "balanceOf", args: [user] } as const,
      { address: p.token, abi: erc20Abi, functionName: "allowance", args: [user, deployment.vault] } as const,
    ]),
  });

  // Per-pool vault reads: userInfo(pid,user), pendingReward(pid,user), poolInfo(pid).
  const vaultReads = useReadContracts({
    ...REFETCH,
    contracts: metas.flatMap((p) => [
      { address: deployment.vault, abi: multiVaultAbi, functionName: "userInfo", args: [BigInt(p.pid), user] } as const,
      { address: deployment.vault, abi: multiVaultAbi, functionName: "pendingReward", args: [BigInt(p.pid), user] } as const,
      { address: deployment.vault, abi: multiVaultAbi, functionName: "poolInfo", args: [BigInt(p.pid)] } as const,
    ]),
  });

  const t = tokenReads.data;
  const v = vaultReads.data;

  const pools: PoolState[] = metas.map((p, i) => {
    const isNative = p.token.toLowerCase() === deployment.wopn.toLowerCase();
    const balRes = t?.[i * 2];
    const allowRes = t?.[i * 2 + 1];
    const userRes = v?.[i * 3];
    const pendRes = v?.[i * 3 + 1];
    const poolRes = v?.[i * 3 + 2];

    const userInfo =
      userRes?.status === "success" ? (userRes.result as readonly bigint[]) : undefined;
    const poolInfo =
      poolRes?.status === "success" ? (poolRes.result as readonly bigint[]) : undefined;

    return {
      pid: p.pid,
      symbol: p.symbol,
      decimals: p.decimals,
      alloc: p.alloc,
      token: p.token,
      isNative,
      walletBalance: balRes?.status === "success" ? (balRes.result as bigint) : undefined,
      nativeBalance: isNative ? native.data?.value : undefined,
      allowance: allowRes?.status === "success" ? (allowRes.result as bigint) : undefined,
      staked: userInfo?.[0],
      pending: pendRes?.status === "success" ? (pendRes.result as bigint) : undefined,
      totalShares: poolInfo?.[4],
      allocPoint: poolInfo?.[1],
    };
  });

  return {
    pools,
    refetch: () => {
      tokenReads.refetch();
      vaultReads.refetch();
      native.refetch();
    },
    loading: tokenReads.isLoading || vaultReads.isLoading,
  };
}

/// Preview the REP-boosted airdrop amount for a base allocation.
export function useAirdropPreview(baseAmount?: string) {
  const { address } = useAccount();
  return useReadContract({
    address: deployment.airdrop,
    abi: airdropAbi,
    functionName: "previewClaim",
    args: address && baseAmount ? [address, BigInt(baseAmount)] : undefined,
    query: { enabled: !!address && !!baseAmount },
  });
}
