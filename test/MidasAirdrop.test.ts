import { expect } from "chai";
import { ethers } from "hardhat";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("MidasAirdrop", () => {
  const DAY = 24 * 60 * 60;

  async function deploy() {
    const [owner, alice, bob, carol, outsider] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MidasToken");
    const token = await Token.deploy(owner.address);
    await token.waitForDeployment();

    const Oracle = await ethers.getContractFactory("MockRepOracle");
    const oracle = await Oracle.deploy();
    await oracle.waitForDeployment();

    // base allocations
    const allocations: [string, string][] = [
      [alice.address, ethers.parseEther("1000").toString()],
      [bob.address, ethers.parseEther("2000").toString()],
      [carol.address, ethers.parseEther("500").toString()],
    ];
    const tree = StandardMerkleTree.of(allocations, ["address", "uint256"]);

    const deadline = (await time.latest()) + 30 * DAY;
    const Airdrop = await ethers.getContractFactory("MidasAirdrop");
    const airdrop = await Airdrop.deploy(
      await token.getAddress(),
      await oracle.getAddress(),
      tree.root,
      deadline,
      owner.address
    );
    await airdrop.waitForDeployment();

    // fund airdrop generously
    await token.transfer(await airdrop.getAddress(), ethers.parseEther("10000"));

    function proofFor(addr: string): { base: bigint; proof: string[] } {
      for (const [i, v] of tree.entries()) {
        if ((v[0] as string).toLowerCase() === addr.toLowerCase()) {
          return { base: BigInt(v[1] as string), proof: tree.getProof(i) };
        }
      }
      throw new Error("not in tree");
    }

    return { token, oracle, airdrop, tree, proofFor, owner, alice, bob, carol, outsider, deadline };
  }

  it("claims base amount at 1x when REP is zero", async () => {
    const { airdrop, token, proofFor, alice } = await deploy();
    const { base, proof } = proofFor(alice.address);
    await expect(airdrop.connect(alice).claim(base, proof))
      .to.emit(airdrop, "Claimed")
      .withArgs(alice.address, base, base, 10_000);
    expect(await token.balanceOf(alice.address)).to.equal(base);
  });

  it("boosts the claim by REP score", async () => {
    const { airdrop, oracle, token, proofFor, bob } = await deploy();
    await oracle.setRep(bob.address, 500_000); // +5000 bps => 1.5x
    const { base, proof } = proofFor(bob.address);
    const expected = (base * 15_000n) / 10_000n;
    await expect(airdrop.connect(bob).claim(base, proof))
      .to.emit(airdrop, "Claimed")
      .withArgs(bob.address, base, expected, 15_000);
    expect(await token.balanceOf(bob.address)).to.equal(expected);
  });

  it("caps the boost at 2.5x", async () => {
    const { airdrop, oracle, token, proofFor, carol } = await deploy();
    await oracle.setRep(carol.address, 10_000_000); // way over cap
    const { base, proof } = proofFor(carol.address);
    const expected = (base * 25_000n) / 10_000n;
    await airdrop.connect(carol).claim(base, proof);
    expect(await token.balanceOf(carol.address)).to.equal(expected);
  });

  it("previewClaim matches the claimed amount", async () => {
    const { airdrop, oracle, proofFor, bob } = await deploy();
    await oracle.setRep(bob.address, 300_000); // +3000 bps => 1.3x
    const { base } = proofFor(bob.address);
    const preview = await airdrop.previewClaim(bob.address, base);
    expect(preview).to.equal((base * 13_000n) / 10_000n);
  });

  it("rejects a second claim", async () => {
    const { airdrop, proofFor, alice } = await deploy();
    const { base, proof } = proofFor(alice.address);
    await airdrop.connect(alice).claim(base, proof);
    await expect(airdrop.connect(alice).claim(base, proof))
      .to.be.revertedWithCustomError(airdrop, "AlreadyClaimed");
  });

  it("rejects an invalid proof / wrong amount", async () => {
    const { airdrop, proofFor, alice } = await deploy();
    const { proof } = proofFor(alice.address);
    await expect(airdrop.connect(alice).claim(ethers.parseEther("9999"), proof))
      .to.be.revertedWithCustomError(airdrop, "InvalidProof");
  });

  it("rejects a wallet not in the tree", async () => {
    const { airdrop, proofFor, alice, outsider } = await deploy();
    const { base, proof } = proofFor(alice.address);
    await expect(airdrop.connect(outsider).claim(base, proof))
      .to.be.revertedWithCustomError(airdrop, "InvalidProof");
  });

  it("rejects claims after the deadline", async () => {
    const { airdrop, proofFor, alice, deadline } = await deploy();
    const { base, proof } = proofFor(alice.address);
    await time.increaseTo(deadline + 1);
    await expect(airdrop.connect(alice).claim(base, proof))
      .to.be.revertedWithCustomError(airdrop, "ClaimWindowClosed");
  });

  it("blocks sweep while the window is open", async () => {
    const { airdrop, owner } = await deploy();
    await expect(airdrop.connect(owner).sweep(owner.address))
      .to.be.revertedWithCustomError(airdrop, "ClaimWindowOpen");
  });

  it("lets the owner sweep unclaimed GOLD after the deadline", async () => {
    const { airdrop, token, owner, deadline } = await deploy();
    await time.increaseTo(deadline + 1);
    const bal = await token.balanceOf(await airdrop.getAddress());
    await expect(airdrop.connect(owner).sweep(owner.address))
      .to.emit(airdrop, "Swept")
      .withArgs(owner.address, bal);
  });

  it("only owner can update the merkle root", async () => {
    const { airdrop, alice } = await deploy();
    await expect(
      airdrop.connect(alice).setMerkleRoot(ethers.ZeroHash)
    ).to.be.revertedWithCustomError(airdrop, "OwnableUnauthorizedAccount");
  });
});
