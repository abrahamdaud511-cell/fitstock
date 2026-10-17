import { Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPct } from "@/lib/fitstock/parse";
import { useTerminal } from "@/lib/fitstock/store";
import { cn } from "@/lib/utils";

function Meter({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div>
      <div className="flex justify-between text-[10px] tracking-widest text-muted">
        <span>{label}</span>
        <span className="tabular text-fg">{pct}%</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-sm bg-surface-3">
        <div
          className={cn("h-full", warn ? "bg-danger" : "bg-accent")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function SignalHud({
  onRun,
  onArm,
}: {
  onRun: () => void;
  onArm: () => void;
}) {
  const snap = useTerminal((s) => s.snapshot);
  const sig = useTerminal((s) => s.signal);
  const busy = useTerminal((s) => s.llmBusy);
  const ttlLeft = sig ? Math.max(0, (sig.expiresAt - Date.now()) / 1000) : 0;
  const kind = sig?.kind ?? "HOLD";
  const actionable = kind === "BUY_YES" || kind === "BUY_NO";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="text-[10px] tracking-[0.22em] text-muted">AI SIGNAL</div>
        <span className="text-[10px] text-muted">{sig?.state ?? "IDLE"}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <div
          className={cn(
            "rounded-md px-3 py-3",
            kind === "HOLD" || kind === "SKIP" ? "bg-surface-2" : "bg-accent-dim",
          )}
        >
          <div className="text-[10px] tracking-[0.22em] text-muted">ACTION</div>
          <div
            className={cn(
              "font-sans text-2xl font-semibold tracking-tight",
              kind === "BUY_NO" ? "text-danger" : kind === "BUY_YES" ? "text-accent" : "text-muted",
            )}
          >
            {kind.replace("_", " ")}
          </div>
          {sig?.llmReason ? <p className="mt-1 text-[11px] leading-snug text-fg">{sig.llmReason}</p> : null}
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <Stat label="EDGE" value={sig ? formatPct(sig.edge, 1) : "—"} hot={(sig?.edge ?? 0) > 0} />
          <Stat label="CAL PROB" value={sig ? formatPct(sig.calibratedProbability, 1) : "—"} />
          <Stat label="RAW" value={sig ? formatPct(sig.rawProbability, 1) : "—"} />
          <Stat label="IMPLIED" value={sig ? formatPct(sig.marketImplied, 1) : "—"} />
          <Stat label="TTL" value={sig ? `${ttlLeft.toFixed(1)}s` : "—"} warn={ttlLeft < 3 && !!sig} />
          <Stat label="SCORE" value={snap ? snap.mispricing.score.toFixed(2) : "—"} />
        </div>
        <Meter label="DATA QUALITY" value={snap?.quality.qualityScore ?? 0} warn={(snap?.quality.qualityScore ?? 1) < 0.7} />
        <Meter label="MODEL AGREEMENT" value={sig?.modelAgreement ?? 0} />
        <Meter label="MISPRICING" value={snap?.mispricing.score ?? 0} />
        {snap ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-muted">
            <dt>Momentum</dt>
            <dd className="tabular text-right text-fg">{snap.features.momentumScore.toFixed(2)}</dd>
            <dt>Imbalance</dt>
            <dd className="tabular text-right text-fg">{snap.features.orderbookImbalance.toFixed(2)}</dd>
            <dt>Vol (ann)</dt>
            <dd className="tabular text-right text-fg">{(snap.features.volatility * 100).toFixed(0)}%</dd>
            <dt>Spread pen.</dt>
            <dd className="tabular text-right text-fg">{snap.features.spreadPenalty.toFixed(2)}</dd>
            <dt>Quant</dt>
            <dd className="tabular text-right text-fg">{formatPct(snap.mispricing.quantProbability, 1)}</dd>
            <dt>Rules</dt>
            <dd className="tabular text-right text-fg">{formatPct(snap.mispricing.rulesProbability, 1)}</dd>
          </dl>
        ) : (
          <div className="shimmer h-16 rounded-sm bg-surface-2" />
        )}
        {sig?.reasonCodes.length ? (
          <div className="flex flex-wrap gap-1">
            {sig.reasonCodes.slice(0, 8).map((c) => (
              <span key={c} className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[9px] tracking-widest text-muted">
                {c}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-border p-3">
        <Button onClick={onRun} disabled={busy || !snap} className="h-11">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Bot className="size-3.5" />}
          Run agent
        </Button>
        <Button variant="outline" onClick={onArm} disabled={!actionable || ttlLeft <= 0}>
          Arm
        </Button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hot,
  warn,
}: {
  label: string;
  value: string;
  hot?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-sm bg-surface-2 px-2 py-1.5">
      <div className="text-[9px] tracking-[0.18em] text-muted">{label}</div>
      <div className={cn("tabular text-sm", warn ? "text-danger" : hot ? "text-accent" : "text-fg")}>{value}</div>
    </div>
  );
}
