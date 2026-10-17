import { useState } from "react";
import { ArrowLeft, Check, Loader2, Unplug, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { connectWallet, deriveClobCreds, walletName } from "@/lib/fitstock/clob";
import { shortAddr } from "@/lib/fitstock/parse";
import { useTerminal } from "@/lib/fitstock/store";
import { cn } from "@/lib/utils";

export function WalletPanel({ onBack }: { onBack: () => void }) {
  const wallet = useTerminal((s) => s.wallet);
  const creds = useTerminal((s) => s.creds);
  const chainId = useTerminal((s) => s.chainId);
  const detected = useTerminal((s) => s.walletDetected);
  const health = useTerminal((s) => s.health);
  const collateral = useTerminal((s) => s.collateralUsdc);
  const disconnect = useTerminal((s) => s.disconnectWallet);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");

  const polygon = chainId === "0x89" || chainId === "137";
  const gamma = Boolean(health?.gamma.ok);
  const clob = Boolean(health?.clob.ok);
  const dataOk = Boolean(health?.data.ok);

  async function connect() {
    setBusy(true);
    try {
      setStep("Requesting accounts");
      const { address, chainId: cid } = await connectWallet();
      const st = useTerminal.getState();
      st.setWallet(address);
      if (cid) st.setChainId(cid);
      st.pushLog("info", `Wallet ${address.slice(0, 6)}…${address.slice(-4)}`);
      setStep("Signing CLOB auth");
      const derived = await deriveClobCreds(address);
      st.setCreds({ address, ...derived });
      st.pushLog("info", "CLOB L2 credentials derived — stored only in this browser");
      toast.success("Polymarket wallet connected");
      setStep("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Wallet failed";
      useTerminal.getState().pushLog("error", msg);
      toast.error(msg);
      setStep("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back" className="size-9">
          <ArrowLeft className="size-4" />
        </Button>
        <h2 className="font-sans text-sm font-medium">Polymarket wallet</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-lg px-3 py-4 sm:px-5">
          <p className="mb-4 text-[12px] leading-relaxed text-muted">
            Live orders sign in your browser (EIP-712 on Polygon). FITSTOCK never sees a private key. L2 CLOB keys stay
            in this device only.
          </p>

          <div className="space-y-2">
            <Row ok={gamma} label="Gamma market API" detail={health ? `${Math.round(health.gamma.latencyMs)}ms` : "probing"} />
            <Row ok={clob} label="CLOB matching engine" detail={health ? `${Math.round(health.clob.latencyMs)}ms` : "probing"} />
            <Row ok={dataOk} label="Positions / trades API" detail={health ? `${Math.round(health.data.latencyMs)}ms` : "probing"} />
            <Row ok={detected} label="Browser wallet" detail={detected ? walletName() : "not detected"} />
            <Row ok={Boolean(wallet)} label="Account" detail={wallet ? shortAddr(wallet) : "disconnected"} />
            <Row ok={polygon} label="Polygon (137)" detail={chainId ?? "unknown"} />
            <Row ok={Boolean(creds)} label="CLOB L2 keys" detail={creds ? "derived" : "sign to derive"} />
            <Row
              ok={(collateral ?? 0) >= 0 && Boolean(creds)}
              label="pUSD collateral"
              detail={collateral == null ? "—" : `$${collateral.toFixed(2)}`}
            />
          </div>

          {!detected ? (
            <div className="mt-4 rounded-md border border-border bg-surface-2 p-3 text-[12px] leading-relaxed text-muted">
              No injected wallet in this browser. Install MetaMask, Rabby, or Coinbase Wallet, then reopen. Paper mode
              still prices against the live Polymarket book.
            </div>
          ) : null}

          {step ? (
            <div className="mt-3 flex items-center gap-2 text-[12px] text-accent">
              <Loader2 className="size-3.5 animate-spin" />
              {step}
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button onClick={() => void connect()} disabled={busy || !detected}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Wallet className="size-3.5" />}
              {wallet ? "Reconnect" : "Connect"}
            </Button>
            <Button variant="outline" onClick={disconnect} disabled={!wallet}>
              <Unplug className="size-3.5" />
              Disconnect
            </Button>
          </div>

          <ol className="mt-6 space-y-2 text-[12px] text-muted">
            <li>1. Connect the wallet you use on Polymarket (EOA or the proxy signer).</li>
            <li>2. Switch to Polygon — USDC.e collateral lives on chain 137.</li>
            <li>3. Sign ClobAuth. That derives L2 API keys used only to place/cancel orders.</li>
            <li>4. Arm a signal, then Live send. Paper fill records against the live book without broadcasting.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function Row({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-surface-2 px-3 py-2.5">
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-full",
          ok ? "bg-accent-dim text-accent" : "bg-danger-dim text-danger",
        )}
      >
        <Check className="size-3.5" />
      </span>
      <span className="flex-1 text-[12px]">{label}</span>
      <span className="tabular text-[11px] text-muted">{detail}</span>
    </div>
  );
}
