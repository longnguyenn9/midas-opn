import { expect } from "chai";
import { ethers } from "hardhat";

describe("MidasToken (GOLD)", () => {
  async function deploy() {
    const [deployer, treasury, alice] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MidasToken");
    const token = await Token.deploy(treasury.address);
    await token.waitForDeployment();
    return { token, deployer, treasury, alice };
  }

  it("mints the full fixed supply to the treasury", async () => {
    const { token, treasury } = await deploy();
    const max = await token.MAX_SUPPLY();
    expect(max).to.equal(ethers.parseEther("100000000"));
    expect(await token.totalSupply()).to.equal(max);
    expect(await token.balanceOf(treasury.address)).to.equal(max);
  });

  it("has the expected metadata", async () => {
    const { token } = await deploy();
    expect(await token.name()).to.equal("Midas Gold");
    expect(await token.symbol()).to.equal("GOLD");
    expect(await token.decimals()).to.equal(18);
  });

  it("lets holders burn supply", async () => {
    const { token, treasury } = await deploy();
    const burn = ethers.parseEther("1000");
    const before = await token.totalSupply();
    await token.connect(treasury).burn(burn);
    expect(await token.totalSupply()).to.equal(before - burn);
  });

  it("supports EIP-2612 permit (gasless approve)", async () => {
    const { token, treasury, alice } = await deploy();
    const value = ethers.parseEther("500");
    const deadline = ethers.MaxUint256;
    const nonce = await token.nonces(treasury.address);
    const net = await ethers.provider.getNetwork();

    const domain = {
      name: "Midas Gold",
      version: "1",
      chainId: net.chainId,
      verifyingContract: await token.getAddress(),
    };
    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };
    const message = {
      owner: treasury.address,
      spender: alice.address,
      value,
      nonce,
      deadline,
    };

    const sig = await treasury.signTypedData(domain, types, message);
    const { v, r, s } = ethers.Signature.from(sig);

    await token.permit(treasury.address, alice.address, value, deadline, v, r, s);
    expect(await token.allowance(treasury.address, alice.address)).to.equal(value);
  });
});
