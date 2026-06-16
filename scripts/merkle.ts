import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import * as fs from "fs";
import * as path from "path";

export type Allocation = [address: string, baseAmount: string];

export interface AirdropManifest {
  root: string;
  format: ["address", "uint256"];
  total: string;
  claims: Record<
    string,
    {
      baseAmount: string;
      proof: string[];
    }
  >;
}

/// Build a StandardMerkleTree over (address, baseAmount) leaves. The leaf encoding here
/// (double-hashed abi.encode of [address, uint256]) is exactly what MidasAirdrop.claim verifies.
export function buildTree(allocations: Allocation[]): {
  tree: StandardMerkleTree<Allocation>;
  manifest: AirdropManifest;
} {
  const tree = StandardMerkleTree.of(allocations, ["address", "uint256"]);

  const claims: AirdropManifest["claims"] = {};
  let total = 0n;
  for (const [i, [addr, amount]] of tree.entries()) {
    claims[addr.toLowerCase()] = {
      baseAmount: amount,
      proof: tree.getProof(i),
    };
    total += BigInt(amount);
  }

  return {
    tree,
    manifest: {
      root: tree.root,
      format: ["address", "uint256"],
      total: total.toString(),
      claims,
    },
  };
}

/// Persist the manifest so the frontend can look up proofs by address.
export function writeManifest(manifest: AirdropManifest, outDir: string): string {
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, "airdrop.json");
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  return file;
}
