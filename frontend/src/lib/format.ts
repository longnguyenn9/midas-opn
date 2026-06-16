import { formatUnits } from "viem";

/// Format a bigint token amount (18 decimals) to a human string with thousands separators.
export function fmt(value?: bigint, decimals = 18, maxFrac = 4): string {
  if (value === undefined) return "—";
  const s = formatUnits(value, decimals);
  const [whole, frac = ""] = s.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const trimmedFrac = frac.slice(0, maxFrac).replace(/0+$/, "");
  return trimmedFrac ? `${grouped}.${trimmedFrac}` : grouped;
}

/// Compact form for big stat numbers: 1.2M, 250K, etc.
export function fmtCompact(value?: bigint, decimals = 18): string {
  if (value === undefined) return "—";
  const n = Number(formatUnits(value, decimals));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
}

/// Basis-point boost (e.g. 15000) → "1.50x".
export function fmtBoost(bps?: bigint): string {
  if (bps === undefined) return "1.00x";
  return `${(Number(bps) / 10_000).toFixed(2)}x`;
}

/// Shorten an address: 0x1234…abcd.
export function shortAddr(a?: string): string {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/// Seconds remaining → "12d 4h" style countdown.
export function fmtCountdown(deadline: number): string {
  const now = Math.floor(Date.now() / 1000);
  let s = deadline - now;
  if (s <= 0) return "ended";
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
