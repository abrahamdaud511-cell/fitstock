import { useState } from "react";
import { ArrowLeft, Copy, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatPct, formatUsd, shortAddr } from "@/lib/fitstock/parse";
import { useTerminal } from "@/lib/fitstock/store";
import { cn } from "@/lib/utils";

type Tab = "all" | "positions" | "history" | "trading";

export function PortfolioView({ onBack, onWallet }: { onBack: () => void; onWallet: () => void }) {
  const wallet = useTerminal((s) => s.wallet);
  const creds = useTerminal((s) => s.creds);
  const portfolio = useTerminal((s) => s.portfolio);
  const busy = useTerminal((s) => s.portfolioBusy);
  const collateral = useTerminal((s) => s.collateralUsdc);
  const fills = useTerminal((s) => s.fills);
  const [tab, setTab] = useState<Tab>("all");

  const positions = portfolio?.positions ?? [];
  const closed = portfolio?.closed ?? [];
  const trades = portfolio?.trades ?? [];
  const bought = positions.reduce((a, p) => a + p.avgPrice * p.size, 0);
  const current = portfolio?.valueUsdc || positions.reduce((a, p) => a + p.currentValue, 0);
  const pnl = positions.reduce((a, p) => a + p.cashPnl, 0);
  const paperExp = fills
    .filter((f) => f.status === "PAPER_FILL" || f.status === "LIVE_SUBMITTED" || f.status === "LIVE_FILL")
    .reduce((a, f) => a + f.usdc, 0);

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
    toast.success("Copied");
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back" className="size-9">
          <ArrowLeft className="size-4" />
        </Button>
        <h2 className="font-sans text-sm font-medium">Portfolio</h2>
        <span className="ml-auto text-[10px] tracking-widest text-muted">{busy ? "SYNC" : "LIVE"}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-5">
          <div className="rounded-md border border-border bg-surface p-4">
            <div className="text-[10px] tracking-[0.22em] text-muted">BALANCE · pUSD</div>
            <div className="mt-1 font-sans text-3xl font-semibold tabular">
              {formatUsd(collateral ?? 0)}
            </div>
            <div className="mt-1 text-[12px] text-muted">
              Positions {formatUsd(current)} · paper session {formatUsd(paperExp)}
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onWallet}>
                <Wallet className="size-3.5" />
                {wallet ? "Wallet" : "Connect"}
              </Button>
              <Button
                className="flex-1"
                onClick={() => window.open("https://polymarket.com/portfolio", "_blank")}
              >
                Add funds
              </Button>
            </div>
            {wallet ? (
              <button
                onClick={() => copy(wallet)}
                className="mt-3 flex items-center gap-2 text-[11px] text-muted"
              >
                {shortAddr(wallet)}
                <Copy className="size-3" />
              </button>
            ) : (
              <p className="mt-3 text-[12px] leading-relaxed text-muted">
                Connect a Polygon wallet to load live Polymarket positions, trades, and pUSD collateral. Paper fills
                against the live book stay on this device.
              </p>
            )}
          </div>

          {wallet ? (
            <div className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-muted">Referral</span>
                <button className="inline-flex items-center gap-1 text-accent" onClick={() => copy(`https://polymarket.com/profile/${wallet}`)}>
                  polymarket.com/profile/{shortAddr(wallet)}
                  <Copy className="size-3" />
                </button>
              </div>
              <div className="mt-1 text-muted">CLOB L2 {creds ? "ready" : "not derived"}</div>
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Mini k="Bought" v={formatUsd(bought)} />
            <Mini k="Current" v={formatUsd(current)} />
            <Mini k="Sold" v={formatUsd(closed.reduce((a, p) => a + p.currentValue, 0))} />
          </div>
          <div className={cn("mt-2 text-center text-sm tabular", pnl >= 0 ? "text-accent" : "text-danger")}>
            {pnl >= 0 ? "+" : ""}
            {formatUsd(pnl)} {bought ? formatPct(pnl / Math.max(bought, 0.01), 1) : ""}
          </div>
          {portfolio?.error ? <div className="mt-2 text-center text-[11px] text-danger">{portfolio.error}</div> : null}

          <div className="mt-4 flex gap-1 overflow-x-auto">
            {(["all", "positions", "history", "trading"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "h-9 shrink-0 rounded-sm px-3 text-[11px] tracking-widest",
                  tab === t ? "bg-surface-3 text-accent" : "text-muted",
                )}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          {(tab === "all" || tab === "positions") && (
            <section className="mt-3">
              <div className="mb-1 text-[10px] tracking-[0.22em] text-muted">OPEN POSITIONS</div>
              {!positions.length ? (
                <p className="py-4 text-[12px] text-muted">{wallet ? "No open Polymarket positions." : "Connect wallet to load positions."}</p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {positions.map((p) => (
                    <li key={p.conditionId + p.outcome} className="flex items-center gap-3 px-3 py-2.5">
                      {p.icon ? <img src={p.icon} alt="" className="size-8 rounded-sm object-cover" /> : <span className="size-8 rounded-sm bg-surface-2" />}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px]">{p.title}</div>
                        <div className="text-[10px] text-muted">
                          {p.outcome} · {p.size.toFixed(2)} @ {(p.avgPrice * 100).toFixed(0)}¢
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="tabular text-[12px]">{formatUsd(p.currentValue)}</div>
                        <div className={cn("tabular text-[10px]", p.cashPnl >= 0 ? "text-accent" : "text-danger")}>
                          {p.cashPnl >= 0 ? "+" : ""}
                          {formatUsd(p.cashPnl)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {(tab === "all" || tab === "history") && (
            <section className="mt-4">
              <div className="mb-1 text-[10px] tracking-[0.22em] text-muted">CLOSED</div>
              {!closed.length ? (
                <p className="py-3 text-[12px] text-muted">No closed positions.</p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {closed.slice(0, 20).map((p, i) => (
                    <li key={p.conditionId + p.outcome + i} className="flex items-center justify-between px-3 py-2 text-[12px]">
                      <span className="min-w-0 flex-1 truncate">{p.title}</span>
                      <span className={cn("tabular", p.realizedPnl >= 0 ? "text-accent" : "text-danger")}>
                        {formatUsd(p.realizedPnl)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {(tab === "all" || tab === "trading") && (
            <section className="mt-4 pb-10">
              <div className="mb-1 text-[10px] tracking-[0.22em] text-muted">TRADES · POLYMARKET</div>
              {!trades.length && !fills.length ? (
                <p className="py-3 text-[12px] text-muted">No trades yet.</p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {trades.slice(0, 24).map((t, i) => (
                    <li key={t.transactionHash || `${t.timestamp}-${i}`} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-[12px]">{t.title}</div>
                        <div className="text-[10px] text-muted">
                          {t.side} {t.outcome} · {t.size.toFixed(2)} × {(t.price * 100).toFixed(0)}¢
                        </div>
                      </div>
                      <span className="tabular text-[12px]">{formatUsd(t.usdc)}</span>
                    </li>
                  ))}
                  {fills.slice(0, 12).map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-[12px]">{f.question}</div>
                        <div className="text-[10px] text-muted">
                          {f.side} {f.mode} · {f.status}
                        </div>
                      </div>
                      <span className="tabular text-[12px]">{formatUsd(f.usdc)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-2 py-2">
      <div className="text-[10px] tracking-widest text-muted">{k}</div>
      <div className="tabular text-[13px]">{v}</div>
    </div>
  );
}
