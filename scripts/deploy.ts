import { ethers, network } from "hardhat";
import * as path from "path";
import * as fs from "fs";
import { buildTree, writeManifest, Allocation } from "./merkle";

/**
 * Deploys the full Midas stack to OPN Chain:
 *   MidasToken (GOLD)   - fixed-supply value token; the emission every pool streams
 *   MockERC20 (NEO)     - NeoPoints loyalty stand-in on testnet
 *   MockERC20 (USDT)    - 6-decimal stablecoin stand-in on testnet
 *   WOPN                - wrapped native OPN, so native gas coin can be staked
 *   MockRepOracle       - REP registry stand-in on testnet
 *   MidasMultiVault     - MasterChef-style multi-pool staking, REP-boosted, streams GOLD
 *   MidasAirdrop        - REP-boosted Merkle distribution of GOLD
 *
 * Pools seeded (allocPoint): WOPN 40, USDT 30, NEO 20, GOLD 10.
 *
 * Env (see .env.example): REP_ORACLE can point at the real registry; a mock is used otherwise.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Network : ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);

  const factory = async (name: string, ...args: unknown[]) => {
    const c = await (await ethers.getContractFactory(name)).deploy(...args);
    await c.waitForDeployment();
    return c;
  };

  // --- GOLD token (emission asset + airdrop asset), full supply to deployer/treasury ---
  const gold = await factory("MidasToken", deployer.address);
  const goldAddr = await gold.getAddress();
  console.log(`MidasToken (GOLD)   : ${goldAddr}`);

  // --- Stakeable tokens ---
  const neo = await factory("MockERC20", "NeoPoints", "NEO", 18);
  const neoAddr = await neo.getAddress();
  console.log(`MockERC20 (NEO)     : ${neoAddr}`);

  const usdt = await factory("MockERC20", "Tether USD", "USDT", 6);
  const usdtAddr = await usdt.getAddress();
  console.log(`MockERC20 (USDT)    : ${usdtAddr}`);

  const wopn = await factory("WOPN");
  const wopnAddr = await wopn.getAddress();
  console.log(`WOPN                : ${wopnAddr}`);

  // --- REP oracle (native registry stand-in on testnet) ---
  let oracleAddr = process.env.REP_ORACLE;
  if (!oracleAddr) {
    const o = await factory("MockRepOracle");
    oracleAddr = await o.getAddress();
    console.log(`MockRepOracle       : ${oracleAddr}`);
  }

  // --- Multi-pool vault: emission of 0.1 GOLD/sec, split across pools by allocPoint ---
  const rewardPerSecond = ethers.parseEther("0.1");
  const vault = await factory(
    "MidasMultiVault",
    goldAddr,
    oracleAddr,
    rewardPerSecond,
    deployer.address
  );
  const vaultAddr = await vault.getAddress();
  console.log(`MidasMultiVault     : ${vaultAddr}`);

  // --- Seed pools (pid order matters for the frontend) ---
  const pools = [
    { token: wopnAddr, symbol: "WOPN", decimals: 18, alloc: 40 },
    { token: usdtAddr, symbol: "USDT", decimals: 6, alloc: 30 },
    { token: neoAddr, symbol: "NEO", decimals: 18, alloc: 20 },
    { token: goldAddr, symbol: "GOLD", decimals: 18, alloc: 10 },
  ];
  // Explicit gasLimit: addPool runs _massUpdatePools (loops existing pools), so cost grows
  // per pool. This chain's auto-estimation under-counts sequential txs, so we pin a generous limit.
  for (const [pid, p] of pools.entries()) {
    await (await (vault as any).addPool(p.token, p.alloc, { gasLimit: 500_000 })).wait();
    console.log(`  pool ${pid}: ${p.symbol} (alloc ${p.alloc})`);
  }

  // --- Airdrop: sample allocation tree (replace with real list before launch) ---
  const allocations: Allocation[] = [
    [deployer.address, ethers.parseEther("1000").toString()],
    ["0x000000000000000000000000000000000000dEaD", ethers.parseEther("500").toString()],
  ];
  const { tree, manifest } = buildTree(allocations);

  const claimDeadline = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const airdrop = await factory(
    "MidasAirdrop",
    goldAddr,
    oracleAddr,
    tree.root,
    claimDeadline,
    deployer.address
  );
  const airdropAddr = await airdrop.getAddress();
  console.log(`MidasAirdrop        : ${airdropAddr}`);

  // --- Fund emission pool + airdrop pool from GOLD supply ---
  const vaultFunding = ethers.parseEther("2000000"); // 2M GOLD for staking emissions
  const airdropFunding = ethers.parseEther("250000"); // 250k GOLD for the airdrop pool
  await (await (gold as any).transfer(vaultAddr, vaultFunding)).wait();
  await (await (gold as any).transfer(airdropAddr, airdropFunding)).wait();
  console.log(`Funded vault   : ${ethers.formatEther(vaultFunding)} GOLD`);
  console.log(`Funded airdrop : ${ethers.formatEther(airdropFunding)} GOLD`);

  // --- Seed deployer with stakeable test tokens so the UI is usable immediately ---
  await (await (neo as any).mint(deployer.address, ethers.parseEther("100000"))).wait();
  await (await (usdt as any).mint(deployer.address, 100000n * 10n ** 6n)).wait();
  console.log(`Minted 100k NEO + 100k USDT to deployer`);

  // --- Persist manifest + addresses for the frontend ---
  const outDir = path.join(__dirname, "..", "frontend", "src", "deployment");
  writeManifest(manifest, outDir);

  const addresses = {
    chainId: 984,
    gold: goldAddr,
    neo: neoAddr,
    usdt: usdtAddr,
    wopn: wopnAddr,
    repOracle: oracleAddr,
    vault: vaultAddr,
    airdrop: airdropAddr,
    claimDeadline,
    rewardPerSecond: rewardPerSecond.toString(),
    pools: pools.map((p, pid) => ({ pid, ...p })),
  };
  fs.writeFileSync(
    path.join(outDir, "addresses.json"),
    JSON.stringify(addresses, null, 2)
  );

  console.log("\nDeployment complete. Addresses + airdrop manifest written to frontend/src/deployment/.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
