import { useEffect, useState } from "react";
import { Activity, Briefcase, MessageSquare, ShieldOff, Wallet, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/fitstock/parse";
import { useTerminal } from "@/lib/fitstock/store";
import { cn } from "@/lib/utils";

function Dot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] tracking-widest text-muted">
      <span className={cn("size-1.5 rounded-full", ok ? "bg-accent" : "bg-danger")} />
      {label}
    </span>
  );
}

function Clock() {
  const [t, setT] = useState("");
  useEffect(() => {
    const tick = () => setT(new Date().toISOString().slice(11, 19) + "Z");
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular text-[11px] tracking-widest text-muted">{t || "00:00:00Z"}</span>;
}

export function StatusBar({ onSettings }: { onSettings: () => void }) {
  const mode = useTerminal((s) => s.mode);
  const setMode = useTerminal((s) => s.setMode);
  const kill = useTerminal((s) => s.killSwitch);
  const setKill = useTerminal((s) => s.setKill);
  const snap = useTerminal((s) => s.snapshot);
  const xai = useTerminal((s) => s.xaiReady);
  const feedBusy = useTerminal((s) => s.feedBusy);
  const health = useTerminal((s) => s.health);
  const wallet = useTerminal((s) => s.wallet);
  const creds = useTerminal((s) => s.creds);
  const orOk = useTerminal((s) => s.openrouterStatus === "ok");
  const hfOk = useTerminal((s) => s.huggingfaceStatus === "ok");
  const setLayer = useTerminal((s) => s.setLayer);
  const tte = snap?.features.tteSeconds ?? 0;
  const polyOk = Boolean(health?.gamma.ok);

  return (
    <header className="flex h-12 min-w-0 shrink-0 items-center gap-2 overflow-hidden border-b border-border bg-surface px-2 sm:gap-3 sm:px-3">
      <div className="flex items-center gap-2">
        <span className="font-sans text-sm font-semibold tracking-[0.22em] text-fg">FITSTOCK</span>
        <span className="hidden text-[10px] tracking-[0.18em] text-muted sm:inline">AI TERMINAL</span>
      </div>
      <div className="hidden items-center gap-3 lg:flex">
        <Dot ok={polyOk} label="POLY" />
        <Dot ok={Boolean(health?.clob.ok)} label="CLOB" />
        <Dot ok={Boolean(snap?.binance || health?.binance.ok)} label="BINANCE" />
        <Dot ok={xai || orOk || hfOk} label="AI" />
        <Dot ok={Boolean(wallet && creds)} label="WALLET" />
        <Dot ok={!kill} label="EXEC" />
      </div>
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {snap ? (
          <span className="hidden tabular text-[10px] text-muted xl:inline">
            TTE {formatDuration(tte)}
            {snap.quality.binanceLatencyMs != null ? ` · BN ${Math.round(snap.quality.binanceLatencyMs)}ms` : ""}
            {snap.quality.polymarketLatencyMs != null ? ` · PM ${Math.round(snap.quality.polymarketLatencyMs)}ms` : ""}
          </span>
        ) : null}
        <Button variant="ghost" size="icon" onClick={() => setLayer("chat")} aria-label="AI Chat" className="size-9">
          <MessageSquare className="size-4 text-muted" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setLayer("portfolio")} aria-label="Portfolio" className="hidden size-9 sm:inline-flex">
          <Briefcase className="size-4 text-muted" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setLayer("wallet")} aria-label="Wallet" className="hidden size-9 sm:inline-flex">
          <Wallet className={cn("size-4", wallet ? "text-accent" : "text-muted")} />
        </Button>
        <div className="flex overflow-hidden rounded-sm shadow-[0_0_0_1px_var(--color-border-strong)]">
          {(["PAPER", "LIVE"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "h-8 px-2.5 text-[10px] tracking-widest",
                mode === m ? "bg-accent text-bg" : "bg-transparent text-muted hover:text-fg",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <Button variant={kill ? "danger" : "outline"} size="sm" onClick={() => setKill(!kill)} className="min-w-12 px-2">
          <ShieldOff className="size-3" />
          <span className="hidden sm:inline">{kill ? "KILLED" : "KILL"}</span>
        </Button>
        <Button variant="ghost" size="icon" onClick={onSettings} aria-label="Settings" className="size-9">
          <Zap className="size-4 text-muted" />
        </Button>
        <span className="hidden sm:inline">
          <Clock />
        </span>
        <Activity className={cn("size-3.5", feedBusy ? "text-warn" : polyOk ? "text-accent" : "text-danger")} />
      </div>
    </header>
  );
}
