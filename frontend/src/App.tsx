import { motion } from "framer-motion";
import { Header, Hero } from "./components/Header";
import { Vault } from "./components/Vault";
import { Airdrop } from "./components/Airdrop";
import { Logo, SectionTitle } from "./components/Shared";
import { deployment } from "./lib/deployment";
import { shortAddr } from "./lib/format";

const STEPS = [
  {
    n: "01",
    title: "Stake your NeoPoints",
    body: "Deposit the loyalty points you've already earned across the OPN ecosystem. They stay yours — withdraw anytime.",
  },
  {
    n: "02",
    title: "REP boosts your weight",
    body: "Your on-chain reputation score multiplies your effective stake up to 2.5×. Trusted NeoID holders earn a bigger share of the same reward stream.",
  },
  {
    n: "03",
    title: "Stream & claim GOLD",
    body: "Rewards accrue every second. Claim your GOLD whenever you like, or exit to pull principal and rewards in one transaction.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl px-5 py-20">
      <SectionTitle
        eyebrow="How it works"
        title="Loyalty in, reputation-weighted yield out"
        sub="Midas is the bridge between the value you've already earned and the value it can become on OPN Chain."
      />
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <motion.div
            key={s.n}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            className="glass p-7"
          >
            <div className="font-display text-4xl font-bold text-gold">{s.n}</div>
            <h3 className="mt-3 text-lg font-semibold text-cream">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-cream/55">{s.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function ContractRow({ label, addr }: { label: string; addr: string }) {
  return (
    <a
      href={`https://testnet.iopn.tech/address/${addr}`}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between rounded-lg px-3 py-2 transition hover:bg-white/[0.04]"
    >
      <span className="text-cream/50">{label}</span>
      <span className="font-mono text-gold-200">{shortAddr(addr)}</span>
    </a>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 bg-ink/60">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <Logo />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-cream/45">
              Midas turns idle loyalty into reputation-weighted yield on OPN
              Chain. Built for the OPN Builders Programme — Season 1, DeFi &
              Open Finance.
            </p>
          </div>
          <div className="md:justify-self-end md:text-left">
            <div className="stat-label mb-2">Deployed contracts · Chain 984</div>
            <div className="w-full max-w-sm text-sm">
              <ContractRow label="MidasToken (GOLD)" addr={deployment.gold} />
              <ContractRow label="MidasVault" addr={deployment.vault} />
              <ContractRow label="MidasAirdrop" addr={deployment.airdrop} />
            </div>
          </div>
        </div>
        <div className="mt-10 border-t border-white/5 pt-6 text-center text-xs text-cream/35">
          OPN Chain Testnet · RPC testnet-rpc.iopn.tech · Not audited — testnet demo.
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <Vault />
        <Airdrop />
        <HowItWorks />
      </main>
      <Footer />
    </div>
  );
}
