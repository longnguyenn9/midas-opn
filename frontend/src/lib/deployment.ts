import addresses from "../deployment/addresses.json";
import airdrop from "../deployment/airdrop.json";

export interface PoolMeta {
  pid: number;
  token: `0x${string}`;
  symbol: string;
  decimals: number;
  alloc: number;
}

export interface Addresses {
  chainId: number;
  gold: `0x${string}`;
  neo: `0x${string}`;
  usdt: `0x${string}`;
  wopn: `0x${string}`;
  repOracle: `0x${string}`;
  vault: `0x${string}`;
  airdrop: `0x${string}`;
  claimDeadline: number;
  rewardPerSecond: string;
  pools: PoolMeta[];
}

export interface AirdropClaim {
  baseAmount: string;
  proof: `0x${string}`[];
}

export interface AirdropManifest {
  root: `0x${string}`;
  format: [string, string];
  total: string;
  claims: Record<string, AirdropClaim>;
}

export const deployment = addresses as Addresses;
export const airdropManifest = airdrop as unknown as AirdropManifest;

/// Look up an address's airdrop allocation, or null if not eligible.
export function claimFor(address?: string): AirdropClaim | null {
  if (!address) return null;
  return airdropManifest.claims[address.toLowerCase()] ?? null;
}
