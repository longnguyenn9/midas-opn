import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { MidasVault, MockERC20, MockRepOracle } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const DAY = 24 * 60 * 60;
const e18 = (n: string | number) => ethers.parseEther(n.toString());

describe("MidasVault", () => {
  let vault: MidasVault;
  let staking: MockERC20;
  let reward: MockERC20;
  let oracle: MockRepOracle;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("MockERC20");
    staking = await ERC20.deploy("NeoPoints", "NEO", 18);
    reward = await ERC20.deploy("OPN", "OPN", 18);

    const Oracle = await ethers.getContractFactory("MockRepOracle");
    oracle = await Oracle.deploy();

    const Vault = await ethers.getContractFactory("MidasVault");
    vault = await Vault.deploy(
      await staking.getAddress(),
      await reward.getAddress(),
      await oracle.getAddress(),
      owner.address
    );

    // Fund stakers with NEO and approve the vault.
    for (const u of [alice, bob]) {
      await staking.mint(u.address, e18(1_000));
      await staking.connect(u).approve(await vault.getAddress(), ethers.MaxUint256);
    }
  });

  async function fundReward(amount: bigint, duration: number) {
    await reward.mint(await vault.getAddress(), amount);
    await vault.notifyRewardAmount(amount, duration);
  }

  describe("deploy", () => {
    it("wires up tokens, oracle and owner", async () => {
      expect(await vault.stakingToken()).to.equal(await staking.getAddress());
      expect(await vault.rewardToken()).to.equal(await reward.getAddress());
      expect(await vault.repOracle()).to.equal(await oracle.getAddress());
      expect(await vault.owner()).to.equal(owner.address);
    });

    it("reverts on zero token/oracle addresses", async () => {
      const Vault = await ethers.getContractFactory("MidasVault");
      await expect(
        Vault.deploy(ethers.ZeroAddress, await reward.getAddress(), await oracle.getAddress(), owner.address)
      ).to.be.revertedWithCustomError(vault, "ZeroAddress");
    });
  });

  describe("boost", () => {
    it("is 1x at zero REP", async () => {
      expect(await vault.boostBps(alice.address)).to.equal(10_000n);
    });

    it("adds 1bp per 100 REP", async () => {
      await oracle.setRep(alice.address, 50_000); // 50_000/100 = 500 bp
      expect(await vault.boostBps(alice.address)).to.equal(10_500n);
    });

    it("caps at MAX_BOOST_BPS", async () => {
      await oracle.setRep(alice.address, 100_000_000);
      expect(await vault.boostBps(alice.address)).to.equal(25_000n);
    });
  });

  describe("stake / withdraw", () => {
    it("tracks raw and boosted balances", async () => {
      await oracle.setRep(alice.address, 50_000); // 1.05x
      await vault.connect(alice).stake(e18(100));

      expect(await vault.balanceOf(alice.address)).to.equal(e18(100));
      expect(await vault.boostedBalanceOf(alice.address)).to.equal(e18(105));
      expect(await vault.totalBoosted()).to.equal(e18(105));
    });

    it("reverts on zero stake", async () => {
      await expect(vault.connect(alice).stake(0)).to.be.revertedWithCustomError(vault, "ZeroAmount");
    });

    it("returns principal on withdraw", async () => {
      await vault.connect(alice).stake(e18(100));
      await vault.connect(alice).withdraw(e18(40));
      expect(await vault.balanceOf(alice.address)).to.equal(e18(60));
      expect(await staking.balanceOf(alice.address)).to.equal(e18(940));
    });

    it("reverts withdrawing more than staked", async () => {
      await vault.connect(alice).stake(e18(100));
      await expect(vault.connect(alice).withdraw(e18(101))).to.be.revertedWithCustomError(
        vault,
        "InsufficientBalance"
      );
    });
  });

  describe("reward streaming", () => {
    it("streams the full amount to a lone staker over the period", async () => {
      await vault.connect(alice).stake(e18(100));
      await fundReward(e18(700), 7 * DAY);

      await time.increase(7 * DAY);

      const earned = await vault.earned(alice.address);
      // Allow tiny rounding dust from integer rewardRate.
      expect(earned).to.be.closeTo(e18(700), e18("0.01"));
    });

    it("splits rewards by boosted weight, not raw stake", async () => {
      // Equal raw stake, but Alice has REP boost => larger share.
      await oracle.setRep(alice.address, 100_000); // +1000 bp => 1.10x
      await vault.connect(alice).stake(e18(100)); // boosted 110
      await vault.connect(bob).stake(e18(100));   // boosted 100

      await fundReward(e18(2100), 7 * DAY);
      await time.increase(7 * DAY);

      const aliceEarned = await vault.earned(alice.address);
      const bobEarned = await vault.earned(bob.address);

      // 110 : 100 split of ~2100 => ~1100 : ~1000
      expect(aliceEarned).to.be.closeTo(e18(1100), e18(1));
      expect(bobEarned).to.be.closeTo(e18(1000), e18(1));
    });

    it("pays out reward token on claim", async () => {
      await vault.connect(alice).stake(e18(100));
      await fundReward(e18(700), 7 * DAY);
      await time.increase(7 * DAY);

      await vault.connect(alice).claim();
      expect(await reward.balanceOf(alice.address)).to.be.closeTo(e18(700), e18("0.01"));
      expect(await vault.rewards(alice.address)).to.equal(0n);
    });

    it("reverts notifyRewardAmount if rate exceeds funded balance", async () => {
      // Promise 700 over 7d but only fund 1 token.
      await reward.mint(await vault.getAddress(), e18(1));
      await expect(vault.notifyRewardAmount(e18(700), 7 * DAY)).to.be.revertedWithCustomError(
        vault,
        "RewardTooHigh"
      );
    });
  });

  describe("refreshBoost", () => {
    it("lets a staker realise a higher boost after REP grows", async () => {
      await vault.connect(alice).stake(e18(100)); // boosted 100 @ 1x
      expect(await vault.boostedBalanceOf(alice.address)).to.equal(e18(100));

      await oracle.setRep(alice.address, 100_000); // 1.10x
      await vault.connect(alice).refreshBoost();

      expect(await vault.boostedBalanceOf(alice.address)).to.equal(e18(110));
      expect(await vault.totalBoosted()).to.equal(e18(110));
    });
  });

  describe("exit", () => {
    it("withdraws principal and claims rewards in one tx", async () => {
      await vault.connect(alice).stake(e18(100));
      await fundReward(e18(700), 7 * DAY);
      await time.increase(7 * DAY);

      await vault.connect(alice).exit();

      expect(await vault.balanceOf(alice.address)).to.equal(0n);
      expect(await staking.balanceOf(alice.address)).to.equal(e18(1_000));
      expect(await reward.balanceOf(alice.address)).to.be.closeTo(e18(700), e18("0.01"));
    });
  });

  describe("admin", () => {
    it("only owner can notify rewards", async () => {
      await reward.mint(await vault.getAddress(), e18(700));
      await expect(vault.connect(alice).notifyRewardAmount(e18(700), 7 * DAY))
        .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("blocks recovering the staking token", async () => {
      await expect(
        vault.recoverERC20(await staking.getAddress(), owner.address, e18(1))
      ).to.be.revertedWithCustomError(vault, "ZeroAddress");
    });

    it("blocks recovering reward token while a stream is live", async () => {
      await fundReward(e18(700), 7 * DAY);
      await expect(
        vault.recoverERC20(await reward.getAddress(), owner.address, e18(1))
      ).to.be.revertedWithCustomError(vault, "RewardPeriodActive");
    });
  });
});
