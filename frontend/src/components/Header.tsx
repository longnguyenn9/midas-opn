import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";
import { Logo, AmbientOrbs } from "./Shared";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm text-cream/60 md:flex">
          <a href="#vault" className="transition hover:text-gold-200">Vault</a>
          <a href="#airdrop" className="transition hover:text-gold-200">Airdrop</a>
          <a href="#how" className="transition hover:text-gold-200">How it works</a>
        </nav>
        <ConnectButton showBalance={false} chainStatus="icon" />
      </div>
    </header>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <AmbientOrbs />
      <div className="mx-auto max-w-6xl px-5 pb-20 pt-20 sm:pt-28">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="mx-auto max-w-3xl text-center"
        >
          <div className="pill mx-auto mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-gold-300 animate-pulse-gold" />
            Live on OPN Chain · Testnet
          </div>

          <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-cream sm:text-7xl">
            Turn idle loyalty
            <br />
            into{" "}
            <span className="bg-gold-shine bg-[length:200%_auto] bg-clip-text text-transparent animate-shine">
              living gold
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg text-cream/60">
            Midas stakes your NeoPoints and streams GOLD in return — and your
            on-chain REP reputation boosts every reward up to 2.5×. The more
            trusted your identity, the more your loyalty earns.
          </p>

          <div className="mt-10 flex items-center justify-center gap-4">
            <a href="#vault" className="btn-gold">Start earning</a>
            <a href="#how" className="btn-ghost">How it works</a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
