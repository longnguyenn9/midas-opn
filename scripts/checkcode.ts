import { ethers } from "hardhat";

async function main() {
  const addrs: Record<string, string> = {
    usdt: "0xAc730999CfAA0b1F179E60BcebF1c6E7CafC9Dd1",
    oracle: "0x5Be68c1a620823dc89bE7C154cA28515Ca5dAFe7",
  };
  for (const [name, a] of Object.entries(addrs)) {
    const code = await ethers.provider.getCode(a);
    console.log(`${name}: codeLen=${code.length} hasCode=${code !== "0x"}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
