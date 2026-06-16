# Midas

**Turn idle loyalty into reputation-weighted yield on OPN Chain.**

Midas is a DeFi protocol built for the [OPN Chain Builders Programme](https://builders.iopn.tech) — Season 1, *DeFi & Open Finance*. It converts the value users have already earned across the OPN ecosystem (loyalty points, native OPN, stablecoins) into a streamed reward token (**GOLD**), and uses each wallet's on-chain **REP** reputation score to boost that yield — up to **2.5×**.

The core idea: the same reputation signal that powers OPN identity decides how much your capital earns. Reputable NeoID holders earn a larger slice of the same emission. That REP integration is what makes Midas native to OPN Chain rather than a generic staking app portable to any EVM chain.

---

## What it does

- **Multi-pool staking vault** — stake any whitelisted OPN asset into its pool and earn a shared GOLD emission. Pools ship with WOPN, USDT, NeoPoints (NEO) and GOLD.
- **REP-boosted rewards** — your effective share in every pool is multiplied by your REP score (`1.0×` base, `+1bp` per 100 REP, capped at `2.5×`), read live from the OPN REP oracle.
- **Native OPN staking** — native OPN is wrapped 1:1 into **WOPN** so the chain's gas coin can be staked alongside ERC20s.
- **REP-boosted genesis airdrop** — eligible wallets claim a base GOLD allocation through a Merkle allowlist, multiplied by the same REP curve at claim time.

---

## Architecture

| Contract | Purpose |
|---|---|
| `MidasToken` (GOLD) | Fixed-supply (100M) value token. The emission every pool streams and the airdrop asset. ERC20 + Permit + Burnable. |
| `MidasMultiVault` | MasterChef-style multi-pool staking. One global GOLD-per-second emission split across pools by allocation points; per-user shares are REP-boosted. |
| `MidasAirdrop` | Merkle distribution of GOLD, boosted by REP at claim time. |
| `WOPN` | Wrapped native OPN (WETH9-style), so native gas coin can enter an ERC20-only vault. |
| `IRepOracle` / `MockRepOracle` | Reads a wallet's on-chain REP score. Mainnet points at the native REP registry; a mock stands in on testnet. |
| `MockERC20` | Test stand-ins for NeoPoints (NEO, 18 dec) and USDT (6 dec) on testnet. |

### Reward math

`MidasMultiVault` uses the standard MasterChef accumulator (`accRewardPerShare` per pool, `1e12` fixed-point), with one twist: pool share totals and per-user shares are **REP-boosted units**, not raw token amounts. The accumulator therefore tracks reward-per-boosted-share. `refreshBoost(pid)` lets a staker re-sync their boost to a changed REP score without touching principal.

### NeoID / REP integration

Midas reads REP through the minimal `IRepOracle.repOf(address)` interface. [NeoID](https://iopn.gitbook.io/iopn/neoid-your-living-verified-identity.md) — OPN's soulbound, ERC-6551 identity that carries each wallet's REP — is still *Coming Soon*, so no public REP registry exists on testnet yet. Midas ships ready for it: the vault and airdrop both expose `setRepOracle(address)`, so swapping today's `MockRepOracle` for the official NeoID REP registry is a one-call upgrade once it goes live — no redeploy of the core contracts.

---

## Deployment — OPN Chain Testnet (chain ID 984)

All contracts are deployed and **source-verified** on the [OPN Blockscout explorer](https://testnet.iopn.tech).

| Contract | Address |
|---|---|
| MidasToken (GOLD) | [`0xDda16ad62b7A8E090D0A6fa284B184215fDECA44`](https://testnet.iopn.tech/address/0xDda16ad62b7A8E090D0A6fa284B184215fDECA44#code) |
| MidasMultiVault | [`0x9BBeF5c5e08554DD67aF1017e5936879416D073d`](https://testnet.iopn.tech/address/0x9BBeF5c5e08554DD67aF1017e5936879416D073d#code) |
| MidasAirdrop | [`0x97F970cf695dc91Ca94CFeebDCC5A2D55aD89470`](https://testnet.iopn.tech/address/0x97F970cf695dc91Ca94CFeebDCC5A2D55aD89470#code) |
| WOPN | [`0xd3981deB167A9DB10Ec1a739bF4DbcF7E8708494`](https://testnet.iopn.tech/address/0xd3981deB167A9DB10Ec1a739bF4DbcF7E8708494#code) |
| MockRepOracle | [`0x5Be68c1a620823dc89bE7C154cA28515Ca5dAFe7`](https://testnet.iopn.tech/address/0x5Be68c1a620823dc89bE7C154cA28515Ca5dAFe7#code) |
| NEO (MockERC20) | [`0xb58c6fBb7B17c42197C6770c049E0932ccfbB74a`](https://testnet.iopn.tech/address/0xb58c6fBb7B17c42197C6770c049E0932ccfbB74a#code) |
| USDT (MockERC20, 6 dec) | [`0xAc730999CfAA0b1F179E60BcebF1c6E7CafC9Dd1`](https://testnet.iopn.tech/address/0xAc730999CfAA0b1F179E60BcebF1c6E7CafC9Dd1#code) |

### Pools (allocation points)

| pid | Token | Alloc |
|---|---|---|
| 0 | WOPN | 40 |
| 1 | USDT | 30 |
| 2 | NEO | 20 |
| 3 | GOLD | 10 |

Emission: `0.1 GOLD/sec`, split across pools by allocation point. Vault funded with 2M GOLD; airdrop pool with 250k GOLD.

### Network

```
RPC      : https://testnet-rpc.iopn.tech
Chain ID : 984
Explorer : https://testnet.iopn.tech
```

---

## Repo layout

```
contracts/            Solidity sources
  MidasToken.sol        GOLD token
  MidasMultiVault.sol   multi-pool staking vault
  MidasAirdrop.sol      Merkle + REP airdrop
  WOPN.sol              wrapped native OPN
  interfaces/           IRepOracle
  mocks/                MockERC20, MockRepOracle
scripts/
  deploy.ts             full-stack deploy + pool seeding + manifest
  merkle.ts             Merkle tree builder / manifest writer
test/                 Hardhat + chai test suites
frontend/             Vite + React + wagmi + RainbowKit UI
```

---

## Development

### Contracts

```bash
npm install
npm run compile          # compile + typechain
npm test                 # full test suite (45 tests)
npm run deploy:opn       # deploy to OPN testnet (needs PRIVATE_KEY in .env)
```

Copy `.env.example` to `.env` and set `PRIVATE_KEY` (a dev-only wallet) before deploying.

### Verify on Blockscout

```bash
npx hardhat verify --network opnTestnet <address> [constructorArgs...]
```

### Frontend

```bash
cd frontend
npm install
npm run dev              # Vite dev server
npm run build            # production build
```

The deploy script writes `frontend/src/deployment/addresses.json` and `airdrop.json`, so the UI always points at the latest deployment.

---

## Testing

45 passing tests cover the GOLD token (supply, permit, burn), the single-asset vault, the multi-pool vault (pool emission split by alloc points, REP boost within a pool, 6-decimal USDT handling, harvest/withdraw/exit, owner guards), and the airdrop (REP-boosted claims, Merkle proof validation, double-claim and deadline guards, sweep).

```bash
npm test
```

---

## Notes

- Testnet demo. Contracts are **not audited** — do not use in production as-is.
- `MockRepOracle`, `NEO`, and `USDT` are testnet stand-ins. On mainnet, the vault and airdrop would point at the native OPN REP registry and real assets.
