import { motion } from "framer-motion";
import type { ReactNode } from "react";

/// The Midas wordmark — a shimmering gold "M" sigil plus the name.
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="relative grid place-items-center rounded-xl bg-gold-shine bg-[length:200%_auto] animate-shine shadow-gold"
        style={{ width: size, height: size }}
      >
        <span className="font-display font-bold text-ink" style={{ fontSize: size * 0.55 }}>
          M
        </span>
      </div>
      <span className="font-display text-xl font-semibold tracking-tight text-cream">
        Midas
      </span>
    </div>
  );
}

/// Ambient floating gold orbs behind the hero — pure decoration.
export function AmbientOrbs() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-gold-500/10 blur-3xl animate-float" />
      <div
        className="absolute right-0 top-40 h-96 w-96 rounded-full bg-gold-700/10 blur-3xl animate-float"
        style={{ animationDelay: "2s" }}
      />
      <div
        className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-gold-400/[0.07] blur-3xl animate-float"
        style={{ animationDelay: "4s" }}
      />
    </div>
  );
}

/// A glass stat tile with a label and a value.
export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="glass p-5">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${accent ? "text-gold" : "text-cream"}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-cream/40">{hint}</div>}
    </div>
  );
}

/// Section heading with an eyebrow label.
export function SectionTitle({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5 }}
      className="mx-auto max-w-2xl text-center"
    >
      <div className="pill mx-auto mb-4">{eyebrow}</div>
      <h2 className="font-display text-3xl font-semibold tracking-tight text-cream sm:text-4xl">
        {title}
      </h2>
      {sub && <p className="mt-3 text-cream/55">{sub}</p>}
    </motion.div>
  );
}

/// A small status line shown under action buttons.
export function TxStatus({ state, error }: { state: string; error?: string | null }) {
  if (state === "idle") return null;
  const map: Record<string, { text: string; tone: string }> = {
    pending: { text: "Confirm in wallet…", tone: "text-gold-200" },
    confirming: { text: "Confirming on OPN Chain…", tone: "text-gold-200" },
    success: { text: "Done ✓", tone: "text-emerald-300" },
    error: { text: error ?? "Failed", tone: "text-red-300" },
  };
  const s = map[state];
  if (!s) return null;
  return <div className={`mt-2 text-sm ${s.tone}`}>{s.text}</div>;
}
