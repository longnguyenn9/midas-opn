// Minimal ABIs — only the fragments the Midas UI actually calls or reads.

export const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
] as const;

export const multiVaultAbi = [
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ name: "pid", type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "pid", type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "harvest", stateMutability: "nonpayable", inputs: [{ name: "pid", type: "uint256" }], outputs: [] },
  { type: "function", name: "exit", stateMutability: "nonpayable", inputs: [{ name: "pid", type: "uint256" }], outputs: [] },
  { type: "function", name: "refreshBoost", stateMutability: "nonpayable", inputs: [{ name: "pid", type: "uint256" }], outputs: [] },
  { type: "function", name: "pendingReward", stateMutability: "view", inputs: [{ name: "pid", type: "uint256" }, { name: "user", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "boostBps", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "rewardPerSecond", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalAllocPoint", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "poolLength", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "poolInfo",
    stateMutability: "view",
    inputs: [{ name: "pid", type: "uint256" }],
    outputs: [
      { name: "token", type: "address" },
      { name: "allocPoint", type: "uint256" },
      { name: "lastRewardTime", type: "uint256" },
      { name: "accRewardPerShare", type: "uint256" },
      { name: "totalShares", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "userInfo",
    stateMutability: "view",
    inputs: [{ name: "pid", type: "uint256" }, { name: "user", type: "address" }],
    outputs: [
      { name: "amount", type: "uint256" },
      { name: "shares", type: "uint256" },
      { name: "rewardDebt", type: "uint256" },
    ],
  },
] as const;

export const wopnAbi = [
  { type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

export const airdropAbi = [
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "baseAmount", type: "uint256" }, { name: "proof", type: "bytes32[]" }], outputs: [] },
  { type: "function", name: "previewClaim", stateMutability: "view", inputs: [{ name: "a", type: "address" }, { name: "baseAmount", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "boostBps", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "hasClaimed", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "claimDeadline", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export const repOracleAbi = [
  { type: "function", name: "repOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "setRep", stateMutability: "nonpayable", inputs: [{ name: "a", type: "address" }, { name: "score", type: "uint256" }], outputs: [] },
] as const;
