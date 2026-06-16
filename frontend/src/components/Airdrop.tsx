import { motion } from "framer-motion";
import { useAccount } from "wagmi";
import { useMidas, useAirdropPreview } from "../lib/useMidas";
import { useTx } from "../lib/useTx";
import { deployment, claimFor } from "../lib/deployment";
import { airdropAbi } from "../lib/abis";
import { fmt, fmtBoost, fmtCountdown } from "../lib/format";
import { SectionTitle, TxStatus } from "./Shared";

export function Airdrop() {
  const { address, isConnected } = useAccount();
  const m = useMidas();
  const alloc = claimFor(address);
  const preview = useAirdropPreview(alloc?.baseAmount);

  const claimTx = useTx(() => m.refetch());

  const eligible = !!alloc;
  const claimed = m.hasClaimedAirdrop === true;
  const boosted =
    preview.data !== undefined ? (preview.data as bigint) : undefined;

  function claim() {
    if (!alloc) return;
    claimTx.run({
      address: deployment.airdrop,
      abi: airdropAbi,
      functionName: "claim",
      args: [BigInt(alloc.baseAmount), alloc.proof],
    });
  }

  return (
    <section id="airdrop" className="mx-auto max-w-6xl px-5 py-20">
      <SectionTitle
        eyebrow="Genesis Airdrop"
        title="Claim your GOLD, boosted by reputation"
        sub="Eligible OPN wallets receive a base allocation — multiplied by your REP. The same trust signal that powers the vault decides your drop."
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="glass relative mx-auto mt-12 max-w-2xl overflow-hidden p-8"
      >
        {/* Decorative coin glow */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gold-500/15 blur-3xl" />

        <div className="flex items-center justify-between">
          <div className="pill">
            <span className="h-1.5 w-1.5 rounded-full bg-gold-300" />
            Window closes in {fmtCountdown(deployment.claimDeadline)}
          </div>
          <span className="font-mono text-xs text-cream/40">
            Merkle · REP-weighted
          </span>
        </div>

        {!isConnected ? (
          <Empty text="Connect your wallet to check eligibility." />
        ) : !eligible ? (
          <Empty text="This wallet isn't in the genesis allocation." />
        ) : claimed ? (
          <Empty text="You've already claimed your GOLD. ✓" tone="emerald" />
        ) : (
          <>
            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              <Field label="Base allocation" value={`${fmt(BigInt(alloc.baseAmount))}`} unit="GOLD" />
              <Field label="Your REP boost" value={fmtBoost(m.boostBps)} accent />
              <Field
                label="You receive"
                value={fmt(boosted)}
                unit="GOLD"
                accent
                big
              />
            </div>

            <button
              className="btn-gold mt-8 w-full"
              disabled={claimTx.busy}
              onClick={claim}
            >
              {claimTx.busy ? "Claiming…" : "Claim GOLD"}
            </button>
            <TxStatus state={claimTx.state} error={claimTx.error} />

            <p className="mt-4 text-center text-xs text-cream/35">
              Boost is read live from the REP oracle at claim time.
            </p>
          </>
        )}
      </motion.div>
    </section>
  );
}

function Empty({ text, tone }: { text: string; tone?: "emerald" }) {
  return (
    <div className="py-12 text-center">
      <p className={tone === "emerald" ? "text-emerald-300" : "text-cream/55"}>{text}</p>
    </div>
  );
}

function Field({
  label,
  value,
  unit,
  accent,
  big,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
  big?: boolean;
}) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div
        className={`mt-1 font-semibold tabular-nums ${big ? "text-3xl" : "text-2xl"} ${
          accent ? "text-gold" : "text-cream"
        }`}
      >
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-cream/40">{unit}</span>}
      </div>
    </div>
  );
}
