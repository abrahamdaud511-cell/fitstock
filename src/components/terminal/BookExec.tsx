import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { connectWallet, deriveClobCreds, signAndSubmitOrder } from "@/lib/fitstock/clob";
import { formatPx, uid } from "@/lib/fitstock/parse";
import { evaluateRisk } from "@/lib/fitstock/risk";
import { useTerminal } from "@/lib/fitstock/store";
import type { BookLevel } from "@/lib/fitstock/types";
import { cn } from "@/lib/utils";

export function BookExec() {
  const snap = useTerminal((s) => s.snapshot);
  const sig = useTerminal((s) => s.signal);
  const mode = useTerminal((s) => s.mode);
  const wallet = useTerminal((s) => s.wallet);
  const creds = useTerminal((s) => s.creds);
  const fills = useTerminal((s) => s.fills);
  const [busy, setBusy] = useState(false);

  const bids = snap?.bookYes?.bids.slice(0, 8) ?? [];
  const asks = snap?.bookYes?.asks.slice(0, 8) ?? [];

  async function execute() {
    const st = useTerminal.getState();
    const s = st.snapshot;
    const g = st.signal;
    if (!s || !g) return;
    if (st.killSwitch) {
      toast.error("Kill switch armed");
      return;
    }
    if (g.state !== "ARMED") {
      toast.error("Arm the signal first");
      return;
    }
    if (Date.now() >= g.expiresAt) {
      st.patchSignal({ state: "EXPIRED" });
      toast.error("TTL expired");
      return;
    }
    const risk = evaluateRisk({
      market: s.market,
      book: s.bookYes,
      mispricing: s.mispricing,
      quality: s.quality,
      ttl: s.ttl,
      kind: g.kind,
      limits: st.settings.risk,
      mode: st.mode,
      killSwitch: st.killSwitch,
      dailyLossUsdc: st.dailyLossUsdc(),
      openExposureUsdc: st.openExposureUsdc(),
      signalCreatedAt: g.createdAt,
    });
    if (risk.status === "REJECT") {
      st.patchSignal({ state: "REJECTED" });
      st.pushLog("error", `Pre-trade reject ${risk.reasons.join(",")}`);
      toast.error(risk.reasons.join(" · "));
      return;
    }
    st.patchSignal({ state: "EXECUTION_PENDING" });
    const side = g.kind === "BUY_NO" ? "NO" : "YES";
    const tokenId = side === "YES" ? s.market.clobTokenIds[0] : s.market.clobTokenIds[1];

    if (st.mode === "PAPER") {
      st.addFill({
        id: uid("fill"),
        ts: Date.now(),
        marketId: s.market.id,
        question: s.market.question,
        side,
        price: risk.limitPrice,
        sizeShares: risk.sizeShares,
        usdc: risk.suggestedAmountUsdc,
        mode: "PAPER",
        status: "PAPER_FILL",
        orderId: null,
      });
      st.patchSignal({ state: "FILLED" });
      st.pushLog("signal", `PAPER FILL ${side} ${risk.sizeShares.toFixed(2)} @ ${risk.limitPrice}`);
      toast.success("Paper fill recorded against live book");
      return;
    }

    setBusy(true);
    try {
      let address = st.wallet;
      if (!address) {
        const connected = await connectWallet();
        address = connected.address;
        st.setWallet(address);
        if (connected.chainId) st.setChainId(connected.chainId);
        st.pushLog("info", `Wallet ${address.slice(0, 6)}…${address.slice(-4)}`);
      }
      let keys = st.creds;
      if (!keys) {
        const derived = await deriveClobCreds(address);
        keys = { address, ...derived };
        st.setCreds(keys);
        st.pushLog("info", "CLOB L2 credentials derived — stored only in this browser");
      }
      if (!tokenId) throw new Error("Missing CLOB token");
      const res = await signAndSubmitOrder({
        address: keys.address,
        apiKey: keys.apiKey,
        secret: keys.secret,
        passphrase: keys.passphrase,
        tokenId,
        side: "BUY",
        price: risk.limitPrice,
        sizeShares: risk.sizeShares,
        tickSize: risk.tickSize,
        negRisk: s.market.negRisk,
      });
      if (res.status >= 200 && res.status < 300) {
        st.addFill({
          id: uid("fill"),
          ts: Date.now(),
          marketId: s.market.id,
          question: s.market.question,
          side,
          price: risk.limitPrice,
          sizeShares: risk.sizeShares,
          usdc: risk.suggestedAmountUsdc,
          mode: "LIVE",
          status: "LIVE_SUBMITTED",
          orderId: res.orderId ?? null,
        });
        st.patchSignal({ state: "SUBMITTED" });
        st.pushLog("signal", `LIVE SUBMIT ${res.orderId ?? res.status}`);
        toast.success("Live order submitted to Polymarket CLOB");
      } else {
        st.patchSignal({ state: "REJECTED" });
        st.pushLog("error", `CLOB ${res.status} ${res.body.slice(0, 160)}`);
        toast.error(`CLOB ${res.status}`);
      }
    } catch (err) {
      st.patchSignal({ state: "REJECTED" });
      const msg = err instanceof Error ? err.message : "Execution failed";
      st.pushLog("error", msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function onConnect() {
    try {
      const connected = await connectWallet();
      useTerminal.getState().setWallet(connected.address);
      if (connected.chainId) useTerminal.getState().setChainId(connected.chainId);
      const derived = await deriveClobCreds(connected.address);
      useTerminal.getState().setCreds({ address: connected.address, ...derived });
      toast.success("Wallet connected · CLOB keys derived");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Wallet failed");
    }
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-2">
      <div className="flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r">
        <div className="border-b border-border px-3 py-2 text-[10px] tracking-[0.22em] text-muted">
          ORDER BOOK YES
        </div>
        <div className="grid grid-cols-2 gap-2 px-3 py-2 text-[10px] tracking-widest text-muted">
          <span>BID</span>
          <span className="text-right">ASK</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
          <div className="grid grid-cols-2 gap-3">
            <Levels rows={bids} side="bid" />
            <Levels rows={asks} side="ask" />
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-col">
        <div className="border-b border-border px-3 py-2 text-[10px] tracking-[0.22em] text-muted">
          EXECUTION
        </div>
        <div className="space-y-2 px-3 py-3 text-[11px]">
          <Row k="Status" v={sig?.state ?? "IDLE"} />
          <Row k="Mode" v={mode} />
          <Row k="Size" v={sig?.suggestedAmountUsdc ? `$${sig.suggestedAmountUsdc.toFixed(2)}` : "—"} />
          <Row k="Limit" v={sig?.limitPrice ? formatPx(sig.limitPrice, 3) : "—"} />
          <Row k="Shares" v={sig?.sizeShares ? sig.sizeShares.toFixed(2) : "—"} />
          <Row
            k="Wallet"
            v={wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "disconnected"}
          />
          <Row k="CLOB L2" v={creds ? "ready" : "none"} />
        </div>
        <div className="mt-auto grid grid-cols-2 gap-2 p-3">
          <Button variant="outline" onClick={() => void onConnect()}>
            {wallet ? "Reconnect" : "Connect"}
          </Button>
          <Button
            variant={mode === "LIVE" ? "danger" : "default"}
            disabled={busy || sig?.state !== "ARMED"}
            onClick={() => void execute()}
          >
            {mode === "LIVE" ? "Live send" : "Paper fill"}
          </Button>
        </div>
        <div className="max-h-24 overflow-y-auto border-t border-border px-3 py-2">
          {fills.slice(0, 5).map((f) => (
            <div key={f.id} className="flex justify-between text-[10px] text-muted">
              <span className="truncate">{f.side} {f.mode}</span>
              <span className="tabular text-fg">${f.usdc.toFixed(2)} · {f.status}</span>
            </div>
          ))}
          {!fills.length ? <div className="text-[10px] text-muted">No fills this session</div> : null}
        </div>
      </div>
    </div>
  );
}

function Levels({ rows, side }: { rows: BookLevel[]; side: "bid" | "ask" }) {
  const max = Math.max(...rows.map((r) => r.size), 1);
  return (
    <ul className="space-y-0.5">
      {rows.map((r) => (
        <li key={`${side}-${r.price}`} className="relative h-5">
          <span
            className={cn("absolute inset-y-0 right-0 opacity-20", side === "bid" ? "bg-accent" : "bg-danger")}
            style={{ width: `${Math.round((r.size / max) * 100)}%` }}
          />
          <span className="relative flex justify-between px-1 text-[11px] tabular">
            <span className={side === "bid" ? "text-accent" : "text-danger"}>{formatPx(r.price, 3)}</span>
            <span className="text-muted">{r.size.toFixed(0)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{k}</span>
      <span className="tabular text-fg">{v}</span>
    </div>
  );
}
