import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const PRECISION = 10n ** 12n;

describe("MidasMultiVault", () => {
  async function deploy() {
    const [owner, alice, bob] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MidasToken");
    const gold = await Token.deploy(owner.address);
    await gold.waitForDeployment();

    const Mock = await ethers.getContractFactory("MockERC20");
    const neo = await Mock.deploy("NeoPoints", "NEO", 18);
    await neo.waitForDeployment();
    const usdt = await Mock.deploy("Tether USD", "USDT", 6);
    await usdt.waitForDeployment();

    const Oracle = await ethers.getContractFactory("MockRepOracle");
    const oracle = await Oracle.deploy();
    await oracle.waitForDeployment();

    // 1 GOLD per second global emission.
    const rps = ethers.parseEther("1");
    const Vault = await ethers.getContractFactory("MidasMultiVault");
    const vault = await Vault.deploy(
      await gold.getAddress(),
      await oracle.getAddress(),
      rps,
      owner.address
    );
    await vault.waitForDeployment();

    // Fund the vault with GOLD to stream.
    await gold.transfer(await vault.getAddress(), ethers.parseEther("1000000"));

    // Seed users with stakeable tokens.
    for (const u of [alice, bob]) {
      await neo.mint(u.address, ethers.parseEther("10000"));
      await usdt.mint(u.address, 10_000n * 10n ** 6n);
      await neo.connect(u).approve(await vault.getAddress(), ethers.MaxUint256);
      await usdt.connect(u).approve(await vault.getAddress(), ethers.MaxUint256);
    }

    return { vault, gold, neo, usdt, oracle, owner, alice, bob, rps };
  }

  it("adds pools and tracks alloc points", async () => {
    const { vault, neo, usdt } = await deploy();
    await vault.addPool(await neo.getAddress(), 70);
    await vault.addPool(await usdt.getAddress(), 30);
    expect(await vault.poolLength()).to.equal(2);
    expect(await vault.totalAllocPoint()).to.equal(100);
  });

  it("rejects a duplicate pool for the same token", async () => {
    const { vault, neo } = await deploy();
    await vault.addPool(await neo.getAddress(), 100);
    await expect(vault.addPool(await neo.getAddress(), 50)).to.be.revertedWithCustomError(
      vault,
      "PoolExists"
    );
  });

  it("streams GOLD to a lone staker at the pool's alloc share", async () => {
    const { vault, neo, alice, rps } = await deploy();
    await vault.addPool(await neo.getAddress(), 100); // single pool gets 100% emission

    await vault.connect(alice).deposit(0, ethers.parseEther("1000"));
    const t0 = await time.latest();
    await time.increaseTo(t0 + 100);

    const pending = await vault.pendingReward(0, alice.address);
    // ~100s * 1 GOLD = 100 GOLD (allow 1s rounding)
    expect(pending).to.be.closeTo(rps * 100n, rps);
  });

  it("splits emission across pools by alloc points", async () => {
    const { vault, neo, usdt, alice, bob, rps } = await deploy();
    await vault.addPool(await neo.getAddress(), 75);
    await vault.addPool(await usdt.getAddress(), 25);

    await vault.connect(alice).deposit(0, ethers.parseEther("1000"));
    await vault.connect(bob).deposit(1, 1000n * 10n ** 6n);
    const t0 = await time.latest();
    await time.increaseTo(t0 + 100);

    const pNeo = await vault.pendingReward(0, alice.address);
    const pUsdt = await vault.pendingReward(1, bob.address);
    // NEO pool ~75% of 100 GOLD, USDT pool ~25%.
    expect(pNeo).to.be.closeTo((rps * 100n * 75n) / 100n, rps);
    expect(pUsdt).to.be.closeTo((rps * 100n * 25n) / 100n, rps);
  });

  it("boosts a high-REP staker's share within a pool", async () => {
    const { vault, neo, oracle, alice, bob } = await deploy();
    await vault.addPool(await neo.getAddress(), 100);

    // Bob has REP for 1.5x (need +5000bps => 500_000 REP).
    await oracle.setRep(bob.address, 500_000);

    // Equal raw stake.
    await vault.connect(alice).deposit(0, ethers.parseEther("1000"));
    await vault.connect(bob).deposit(0, ethers.parseEther("1000"));

    // Measure accrual over a clean window where both are already staked, so the
    // one-block gap between the two deposits doesn't contaminate Alice's share.
    const a0 = await vault.pendingReward(0, alice.address);
    const b0 = await vault.pendingReward(0, bob.address);
    const t0 = await time.latest();
    await time.increaseTo(t0 + 100);
    const aDelta = (await vault.pendingReward(0, alice.address)) - a0;
    const bDelta = (await vault.pendingReward(0, bob.address)) - b0;

    // Over the clean window, Bob's accrual is exactly 1.5x Alice's (1x vs 1.5x shares).
    expect(bDelta).to.be.closeTo((aDelta * 15n) / 10n, aDelta / 1000n);
  });

  it("pays GOLD on harvest", async () => {
    const { vault, neo, gold, alice } = await deploy();
    await vault.addPool(await neo.getAddress(), 100);
    await vault.connect(alice).deposit(0, ethers.parseEther("1000"));
    const t0 = await time.latest();
    await time.increaseTo(t0 + 50);

    const before = await gold.balanceOf(alice.address);
    await vault.connect(alice).harvest(0);
    const after = await gold.balanceOf(alice.address);
    expect(after - before).to.be.gt(0);
  });

  it("returns principal on withdraw and harvests", async () => {
    const { vault, neo, gold, alice } = await deploy();
    await vault.addPool(await neo.getAddress(), 100);
    const amt = ethers.parseEther("1000");
    await vault.connect(alice).deposit(0, amt);
    const t0 = await time.latest();
    await time.increaseTo(t0 + 50);

    const neoBefore = await neo.balanceOf(alice.address);
    const goldBefore = await gold.balanceOf(alice.address);
    await vault.connect(alice).withdraw(0, amt);
    expect((await neo.balanceOf(alice.address)) - neoBefore).to.equal(amt);
    expect((await gold.balanceOf(alice.address)) - goldBefore).to.be.gt(0);
  });

  it("reverts withdrawing more than staked", async () => {
    const { vault, neo, alice } = await deploy();
    await vault.addPool(await neo.getAddress(), 100);
    await vault.connect(alice).deposit(0, ethers.parseEther("100"));
    await expect(
      vault.connect(alice).withdraw(0, ethers.parseEther("200"))
    ).to.be.revertedWithCustomError(vault, "InsufficientBalance");
  });

  it("refreshBoost lifts shares after REP grows", async () => {
    const { vault, neo, oracle, alice } = await deploy();
    await vault.addPool(await neo.getAddress(), 100);
    await vault.connect(alice).deposit(0, ethers.parseEther("1000"));

    const sharesBefore = (await vault.userInfo(0, alice.address)).shares;
    await oracle.setRep(alice.address, 500_000); // 1.5x
    await vault.connect(alice).refreshBoost(0);
    const sharesAfter = (await vault.userInfo(0, alice.address)).shares;
    expect(sharesAfter).to.equal((sharesBefore * 15n) / 10n);
  });

  it("exit pulls all principal and reward", async () => {
    const { vault, neo, gold, alice } = await deploy();
    await vault.addPool(await neo.getAddress(), 100);
    const amt = ethers.parseEther("500");
    await vault.connect(alice).deposit(0, amt);
    const t0 = await time.latest();
    await time.increaseTo(t0 + 30);

    await vault.connect(alice).exit(0);
    expect((await vault.userInfo(0, alice.address)).amount).to.equal(0);
    expect(await gold.balanceOf(alice.address)).to.be.gt(0);
  });

  it("only owner can add pools", async () => {
    const { vault, neo, alice } = await deploy();
    await expect(
      vault.connect(alice).addPool(await neo.getAddress(), 100)
    ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
  });

  it("handles 6-decimal USDT pool correctly", async () => {
    const { vault, usdt, gold, alice } = await deploy();
    await vault.addPool(await usdt.getAddress(), 100);
    const amt = 1000n * 10n ** 6n;
    await vault.connect(alice).deposit(0, amt);
    const t0 = await time.latest();
    await time.increaseTo(t0 + 50);
    const before = await gold.balanceOf(alice.address);
    await vault.connect(alice).harvest(0);
    expect((await gold.balanceOf(alice.address)) - before).to.be.gt(0);
  });
});
