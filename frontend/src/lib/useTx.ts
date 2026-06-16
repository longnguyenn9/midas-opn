import { useState, useCallback } from "react";
import { useWriteContract, usePublicClient } from "wagmi";
import type { Abi } from "viem";

export type TxState = "idle" | "pending" | "confirming" | "success" | "error";

/// Wraps writeContract + receipt wait into a single status machine with a status label,
/// so each action button can show pending/confirming/success without bespoke wiring.
export function useTx(onDone?: () => void) {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [state, setState] = useState<TxState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<`0x${string}` | null>(null);

  const run = useCallback(
    async (params: {
      address: `0x${string}`;
      abi: Abi;
      functionName: string;
      args?: readonly unknown[];
      value?: bigint;
    }) => {
      setError(null);
      setState("pending");
      try {
        const h = await writeContractAsync(params as never);
        setHash(h);
        setState("confirming");
        await publicClient!.waitForTransactionReceipt({ hash: h });
        setState("success");
        onDone?.();
        setTimeout(() => setState("idle"), 2500);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Transaction failed";
        // Trim verbose RPC errors to the human-readable first line.
        setError(msg.split("\n")[0].slice(0, 140));
        setState("error");
        setTimeout(() => setState("idle"), 4000);
      }
    },
    [writeContractAsync, publicClient, onDone]
  );

  return { run, state, error, hash, busy: state === "pending" || state === "confirming" };
}
