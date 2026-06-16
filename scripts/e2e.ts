import { ethers, network } from "hardhat";
import addresses from "../frontend/src/deployment/addresses.json";
import airdropManifest from "../frontend/src/deployment/airdrop.json";

/**
 * End-to-end smoke test of the full Midas stack on OPN Chain, run with the
 * deployer wallet (which is also the contract owner + airdrop-eligible).
 *
 * Exercises every user-facing function against the live deployment:
 *   - REP oracle setRep (owner) → boost > 1x
 *   - per-pool: wrap native OPN (WOPN pool), approve, deposit, pendingReward
 *   - harvest, withdraw (partial), refreshBoost, exit
 *   - airdrop previewClaim + claim
 *
 * Each step is wrapped so one failure surfaces clearly without aborting the run.
 */

const A = addresses as any;
const ok = (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const info = (s: string) => console.log(`    ${s}`);
const fail = (s: string, e: unknown) =>
  console.log(`  \x1b[31m✗ ${s}\x1b[0m → ${(e as Error).message?.split("\n")[0]?.slice(0, 160)}`);
const hdr = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [signer] = await ethers.getSigners();
  console.log(`Network : ${network.name}`);
  console.log(`Wallet  : ${signer.address}`);

  const gold = await ethers.getContractAt("MidasToken", A.gold);
  const neo = await ethers.getContractAt("MockERC20", A.neo);
  const usdt = await ethers.getContractAt("MockERC20", A.usdt);
  const wopn = await ethers.getContractAt("WOPN", A.wopn);
  const oracle = await ethers.getContractAt("MockRepOracle", A.repOracle);
  const vault = await ethers.getContractAt("MidasMultiVault", A.vault);
  const airdrop = await ethers.getContractAt("MidasAirdrop", A.airdrop);

  const fmt = (v: bigint, d = 18) => ethers.formatUnits(v, d);

  // ---------------------------------------------------------------- balances
  hdr("1. Initial state");
  const nativeBal = await ethers.provider.getBalance(signer.address);
  info(`native OPN : ${fmt(nativeBal)}`);
  info(`GOLD       : ${fmt(await gold.balanceOf(signer.address))}`);
  info(`NEO        : ${fmt(await neo.balanceOf(signer.address))}`);
  info(`USDT       : ${fmt(await usdt.balanceOf(signer.address), 6)}`);
  info(`WOPN       : ${fmt(await wopn.balanceOf(signer.address))}`);
  info(`pools      : ${await vault.poolLength()}`);

  // ------------------------------------------------------------------- setRep
  hdr("2. REP oracle → boost");
  try {
    const before = await vault.boostBps(signer.address);
    info(`boost before : ${(Number(before) / 10000).toFixed(2)}x (REP ${await oracle.repOf(signer.address)})`);
    // 500_000 REP → +5000 bps → 1.5x
    await (await oracle.setRep(signer.address, 500_000)).wait();
    const after = await vault.boostBps(signer.address);
    ok(`setRep(500000) → boost ${(Number(after) / 10000).toFixed(2)}x`);
    if (after !== 15000n) info(`  note: expected 1.50x, got ${(Number(after) / 10000).toFixed(2)}x`);
  } catch (e) {
    fail("setRep", e);
  }

  // ------------------------------------------------------------- WOPN pool (0)
  hdr("3. Pool 0 · WOPN (wrap native OPN + stake)");
  const wrapAmt = ethers.parseEther("1");
  try {
    await (await wopn.deposit({ value: wrapAmt })).wait();
    ok(`wrapped ${fmt(wrapAmt)} OPN → WOPN (bal ${fmt(await wopn.balanceOf(signer.address))})`);
    await (await wopn.approve(A.vault, wrapAmt)).wait();
    ok("approved WOPN → vault");
    await (await vault.deposit(0, wrapAmt)).wait();
    const u = await vault.userInfo(0, signer.address);
    ok(`deposited → staked ${fmt(u.amount)} WOPN, shares ${fmt(u.shares)}`);
  } catch (e) {
    fail("WOPN pool", e);
  }

  // ------------------------------------------------------------- USDT pool (1)
  hdr("4. Pool 1 · USDT (6 decimals)");
  const usdtAmt = 1000n * 10n ** 6n;
  try {
    await (await usdt.approve(A.vault, usdtAmt)).wait();
    await (await vault.deposit(1, usdtAmt)).wait();
    const u = await vault.userInfo(1, signer.address);
    ok(`deposited ${fmt(u.amount, 6)} USDT, shares ${fmt(u.shares, 6)}`);
  } catch (e) {
    fail("USDT pool", e);
  }

  // -------------------------------------------------------------- NEO pool (2)
  hdr("5. Pool 2 · NEO");
  const neoAmt = ethers.parseEther("5000");
  try {
    await (await neo.approve(A.vault, neoAmt)).wait();
    await (await vault.deposit(2, neoAmt)).wait();
    const u = await vault.userInfo(2, signer.address);
    ok(`deposited ${fmt(u.amount)} NEO, shares ${fmt(u.shares)}`);
  } catch (e) {
    fail("NEO pool", e);
  }

  // ------------------------------------------------------------- GOLD pool (3)
  hdr("6. Pool 3 · GOLD");
  const goldAmt = ethers.parseEther("2000");
  try {
    await (await gold.approve(A.vault, goldAmt)).wait();
    await (await vault.deposit(3, goldAmt)).wait();
    const u = await vault.userInfo(3, signer.address);
    ok(`deposited ${fmt(u.amount)} GOLD, shares ${fmt(u.shares)}`);
  } catch (e) {
    fail("GOLD pool", e);
  }

  // ----------------------------------------------------- accrue + pendingReward
  hdr("7. Reward accrual (waiting ~20s for emission)");
  await sleep(20_000);
  try {
    for (const p of A.pools) {
      const pend = await vault.pendingReward(p.pid, signer.address);
      info(`pool ${p.pid} ${p.symbol.padEnd(5)} pending GOLD : ${fmt(pend)}`);
    }
    ok("pendingReward read for all pools");
  } catch (e) {
    fail("pendingReward", e);
  }

  // ------------------------------------------------------------------- harvest
  hdr("8. Harvest (pool 2 · NEO)");
  try {
    const before = await gold.balanceOf(signer.address);
    await (await vault.harvest(2)).wait();
    const after = await gold.balanceOf(signer.address);
    ok(`harvested → +${fmt(after - before)} GOLD`);
  } catch (e) {
    fail("harvest", e);
  }

  // ------------------------------------------------------------- partial withdraw
  hdr("9. Partial withdraw (pool 2 · NEO, 2000)");
  try {
    const wAmt = ethers.parseEther("2000");
    const before = await neo.balanceOf(signer.address);
    await (await vault.withdraw(2, wAmt)).wait();
    const after = await neo.balanceOf(signer.address);
    const u = await vault.userInfo(2, signer.address);
    ok(`withdrew → +${fmt(after - before)} NEO, remaining staked ${fmt(u.amount)}`);
  } catch (e) {
    fail("withdraw", e);
  }

  // ---------------------------------------------------------------- refreshBoost
  hdr("10. refreshBoost (pool 1 · USDT) after REP change");
  try {
    // bump REP higher → 1,000,000 → +10000 bps → capped at 2.5x
    await (await oracle.setRep(signer.address, 1_000_000)).wait();
    const newBoost = await vault.boostBps(signer.address);
    info(`new boost : ${(Number(newBoost) / 10000).toFixed(2)}x (capped at 2.5x)`);
    const sharesBefore = (await vault.userInfo(1, signer.address)).shares;
    await (await vault.refreshBoost(1)).wait();
    const sharesAfter = (await vault.userInfo(1, signer.address)).shares;
    ok(`refreshBoost → shares ${fmt(sharesBefore, 6)} → ${fmt(sharesAfter, 6)}`);
  } catch (e) {
    fail("refreshBoost", e);
  }

  // ----------------------------------------------------------------------- exit
  hdr("11. exit (pool 3 · GOLD — withdraw all + harvest)");
  try {
    const u0 = await vault.userInfo(3, signer.address);
    await (await vault.exit(3)).wait();
    const u1 = await vault.userInfo(3, signer.address);
    ok(`exited GOLD pool → staked ${fmt(u0.amount)} → ${fmt(u1.amount)}`);
  } catch (e) {
    fail("exit", e);
  }

  // -------------------------------------------------------------------- airdrop
  hdr("12. Airdrop claim (REP-boosted)");
  try {
    const claim = (airdropManifest as any).claims[signer.address.toLowerCase()];
    if (!claim) {
      info("wallet not in airdrop manifest — skipping");
    } else {
      const already = await airdrop.hasClaimed(signer.address);
      const base = BigInt(claim.baseAmount);
      const preview = await airdrop.previewClaim(signer.address, base);
      info(`base ${fmt(base)} GOLD → preview (boosted) ${fmt(preview)} GOLD`);
      if (already) {
        info("already claimed — skipping claim tx");
      } else {
        const before = await gold.balanceOf(signer.address);
        await (await airdrop.claim(base, claim.proof)).wait();
        const after = await gold.balanceOf(signer.address);
        ok(`claimed → +${fmt(after - before)} GOLD`);
      }
    }
  } catch (e) {
    fail("airdrop claim", e);
  }

  // ----------------------------------------------------------------- final read
  hdr("13. Final balances");
  info(`native OPN : ${fmt(await ethers.provider.getBalance(signer.address))}`);
  info(`GOLD       : ${fmt(await gold.balanceOf(signer.address))}`);
  info(`NEO        : ${fmt(await neo.balanceOf(signer.address))}`);
  info(`USDT       : ${fmt(await usdt.balanceOf(signer.address), 6)}`);
  info(`WOPN       : ${fmt(await wopn.balanceOf(signer.address))}`);

  console.log("\n\x1b[1m\x1b[32mE2E run complete.\x1b[0m");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
