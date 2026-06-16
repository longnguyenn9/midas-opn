import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { parseUnits } from "viem";
import { useAccount } from "wagmi";
import { useMidas, usePools, type PoolState } from "../lib/useMidas";
import { useTx } from "../lib/useTx";
import { deployment } from "../lib/deployment";
import { erc20Abi, multiVaultAbi, wopnAbi } from "../lib/abis";
import { fmt, fmtBoost, fmtCompact } from "../lib/format";
import { StatCard, SectionTitle, TxStatus } from "./Shared";

export function Vault() {
  const m = useMidas();
  const { pools } = usePools();
  const [active, setActive] = useState(0);

  const dailyEmission =
    m.rewardPerSecond !== undefined ? m.rewardPerSecond * 86_400n : undefined;

  return (
    <section id="vault" className="mx-auto max-w-6xl px-5 py-20">
      <SectionTitle
        eyebrow="The Vaults"
        title="Stake any OPN asset, stream GOLD"
        sub="Four pools share one GOLD emission. Your reward share in every pool scales with your REP — reputable OPN identities earn a larger slice."
      />

      {/* Global stats */}
      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        <StatCard label="Your REP boost" value={fmtBoost(m.boostBps)} accent hint={`REP ${fmt(m.rep, 0, 0)}`} />
        <StatCard label="Total GOLD emission" value={`${fmtCompact(dailyEmission)} /day`} />
        <StatCard label="Your GOLD balance" value={fmt(m.goldBalance)} />
      </div>

      {/* Pool tabs */}
      <div className="mt-10 flex flex-wrap gap-2">
        {pools.map((p, i) => (
          <button
            key={p.pid}
            onClick={() => setActive(i)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
              active === i
                ? "bg-gold-shine bg-[length:200%_auto] text-ink"
                : "border border-white/10 bg-white/[0.03] text-cream/60 hover:text-cream"
            }`}
          >
            {p.symbol}
            <span className={`text-xs ${active === i ? "text-ink/60" : "text-cream/35"}`}>
              {p.alloc}%
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {pools[active] && (
          <PoolPanel key={pools[active].pid} pool={pools[active]} boost={m.boostBps} onTx={() => { m.refetch(); }} />
        )}
      </AnimatePresence>
    </section>
  );
}

type Mode = "stake" | "withdraw";

function PoolPanel({ pool, boost, onTx }: { pool: PoolState; boost?: bigint; onTx: () => void }) {
  const { isConnected } = useAccount();
  const { refetch } = usePools();
  const [mode, setMode] = useState<Mode>("stake");
  const [amount, setAmount] = useState("");

  const done = () => {
    refetch();
    onTx();
  };
  const wrapTx = useTx(done);
  const approveTx = useTx(done);
  const actionTx = useTx(() => {
    done();
    setAmount("");
  });
  const harvestTx = useTx(done);

  let parsed: bigint | null = null;
  try {
    parsed = amount ? parseUnits(amount, pool.decimals) : null;
  } catch {
    parsed = null;
  }

  // For the native WOPN pool, "stake" wraps native OPN first if WOPN balance is short.
  const needsWrap =
    pool.isNative &&
    mode === "stake" &&
    parsed !== null &&
    pool.walletBalance !== undefined &&
    pool.walletBalance < parsed;

  const needsApproval =
    mode === "stake" &&
    !needsWrap &&
    parsed !== null &&
    pool.allowance !== undefined &&
    pool.allowance < parsed;

  const max =
    mode === "stake"
      ? pool.isNative
        ? pool.nativeBalance // show native OPN as the stakeable max for WOPN pool
        : pool.walletBalance
      : pool.staked;

  function setMax() {
    if (max !== undefined) setAmount(formatRaw(max, pool.decimals));
  }

  function submit() {
    if (!parsed) return;

    if (needsWrap) {
      // Wrap the shortfall (wrap full requested amount for simplicity) into WOPN.
      wrapTx.run({
        address: deployment.wopn,
        abi: wopnAbi,
        functionName: "deposit",
        args: [],
        value: parsed,
      });
      return;
    }
    if (needsApproval) {
      approveTx.run({
        address: pool.token,
        abi: erc20Abi,
        functionName: "approve",
        args: [deployment.vault, parsed],
      });
      return;
    }
    actionTx.run({
      address: deployment.vault,
      abi: multiVaultAbi,
      functionName: mode,
      args: [BigInt(pool.pid), parsed],
    });
  }

  const hasPending = (pool.pending ?? 0n) > 0n;
  const unit = pool.symbol;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.3 }}
      className="mt-6 grid gap-6 lg:grid-cols-5"
    >
      {/* Action panel */}
      <div className="glass p-6 lg:col-span-3">
        <div className="mb-5 flex gap-2 rounded-xl bg-black/30 p-1">
          {(["stake", "withdraw"] as Mode[]).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setMode(tab);
                setAmount("");
              }}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium capitalize transition ${
                mode === tab ? "bg-gold-shine bg-[length:200%_auto] text-ink" : "text-cream/55 hover:text-cream"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="mb-2 flex items-center justify-between text-sm text-cream/50">
          <span>
            {mode === "stake" ? "Stake" : "Withdraw"} {unit}
            {pool.isNative && mode === "stake" && (
              <span className="ml-2 text-xs text-gold-300">native OPN auto-wraps</span>
            )}
          </span>
          <button onClick={setMax} className="text-gold-300 hover:text-gold-200">
            Max: {fmt(max, pool.decimals)} {pool.isNative && mode === "stake" ? "OPN" : unit}
          </button>
        </div>

        <div className="relative">
          <input
            className="input-gold pr-20"
            placeholder="0.0"
            value={amount}
            inputMode="decimal"
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-sm text-cream/40">
            {pool.isNative && mode === "stake" ? "OPN" : unit}
          </span>
        </div>

        <button
          className="btn-gold mt-4 w-full"
          disabled={!isConnected || !parsed || wrapTx.busy || approveTx.busy || actionTx.busy}
          onClick={submit}
        >
          {!isConnected
            ? "Connect wallet"
            : wrapTx.busy
            ? "Wrapping OPN…"
            : approveTx.busy
            ? "Approving…"
            : actionTx.busy
            ? "Processing…"
            : needsWrap
            ? "Wrap OPN → WOPN"
            : needsApproval
            ? `Approve ${unit}`
            : mode === "stake"
            ? "Stake"
            : "Withdraw"}
        </button>
        <TxStatus state={wrapTx.state} error={wrapTx.error} />
        <TxStatus state={approveTx.state} error={approveTx.error} />
        <TxStatus state={actionTx.state} error={actionTx.error} />
      </div>

      {/* Position panel */}
      <div className="glass flex flex-col p-6 lg:col-span-2">
        <div className="stat-label">Pool · {unit}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-display text-4xl font-bold text-gold">{pool.alloc}%</span>
          <span className="text-sm text-cream/45">of emission</span>
        </div>

        <div className="mt-5 h-px bg-white/8" />

        <div className="mt-5 space-y-3 text-sm">
          <Row label="Your stake" value={`${fmt(pool.staked, pool.decimals)} ${unit}`} />
          <Row label="Boost" value={fmtBoost(boost)} />
          <Row label="Pending GOLD" value={fmt(pool.pending)} accent />
        </div>

        <button
          className="btn-ghost mt-5 w-full"
          disabled={!isConnected || !hasPending || harvestTx.busy}
          onClick={() =>
            harvestTx.run({
              address: deployment.vault,
              abi: multiVaultAbi,
              functionName: "harvest",
              args: [BigInt(pool.pid)],
            })
          }
        >
          {harvestTx.busy ? "Harvesting…" : "Harvest GOLD"}
        </button>
        <TxStatus state={harvestTx.state} error={harvestTx.error} />
      </div>
    </motion.div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-cream/50">{label}</span>
      <span className={`font-medium tabular-nums ${accent ? "text-gold" : "text-cream"}`}>{value}</span>
    </div>
  );
}

/// Raw bigint → plain decimal string for the input field (no grouping), honouring token decimals.
function formatRaw(v: bigint, decimals: number): string {
  const s = v.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, -decimals).replace(/^0+(?=\d)/, "");
  const frac = s.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}
