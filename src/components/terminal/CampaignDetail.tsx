import { ArrowLeft, Bot, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MagicChart } from "./MagicChart";
import { PolyOddsChart } from "./PolyOddsChart";
import { formatCents, formatDuration, formatMult, formatPct, formatUsd, formatWhen } from "@/lib/fitstock/parse";
import { tteSeconds } from "@/lib/fitstock/mapping";
import { useTerminal } from "@/lib/fitstock/store";
import { cn } from "@/lib/utils";

export function CampaignDetail({
  onBack,
  onRun,
  onArm,
}: {
  onBack: () => void;
  onRun: () => void;
  onArm: () => void;
}) {
  const events = useTerminal((s) => s.events);
  const selectedEventId = useTerminal((s) => s.selectedEventId);
  const selectedMarketId = useTerminal((s) => s.selectedMarketId);
  const openCampaign = useTerminal((s) => s.openCampaign);
  const selectMarket = useTerminal((s) => s.selectMarket);
  const snap = useTerminal((s) => s.snapshot);
  const sig = useTerminal((s) => s.signal);
  const detail = useTerminal((s) => s.eventDetail);
  const busy = useTerminal((s) => s.eventDetailBusy);
  const llmBusy = useTerminal((s) => s.llmBusy);

  const listed = events.find((e) => e.id === selectedEventId);
  const event = detail?.event ?? listed;
  const market =
    event?.markets.find((m) => m.id === selectedMarketId) ??
    snap?.market ??
    event?.markets[0] ??
    null;

  if (!event) {
    return (
      <div className="flex h-full flex-col">
        <Header onBack={onBack} title="Campaign" />
        <div className="p-6 text-sm text-muted">{busy ? "Loading campaign…" : "Select a campaign from Markets."}</div>
      </div>
    );
  }

  const yes = market?.outcomePrices[0] ?? snap?.mispricing.marketImplied ?? 0;
  const no = market?.outcomePrices[1] ?? (yes ? 1 - yes : 0);
  const yesLabel = market?.outcomes[0] ?? "Yes";
  const noLabel = market?.outcomes[1] ?? "No";
  const tte = tteSeconds(market?.endDate ?? event.endDate);
  const kind = sig?.kind ?? "HOLD";
  const actionable = kind === "BUY_YES" || kind === "BUY_NO";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg">
      <Header onBack={onBack} title={event.title} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-3 py-3 sm:px-5">
          <div className="flex items-start gap-3">
            {event.image ? (
              <img src={event.image} alt="" className="size-12 rounded-md object-cover" />
            ) : (
              <div className="size-12 rounded-md bg-surface-2" />
            )}
            <div className="min-w-0 flex-1">
              <h1 className="font-sans text-base font-semibold leading-snug text-fg sm:text-lg">{event.title}</h1>
              <div className="mt-1 flex flex-wrap gap-1">
                {event.tags.slice(0, 6).map((t) => (
                  <span key={t.id || t.slug} className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[10px] tracking-widest text-muted">
                    {t.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat k="Start" v={formatWhen(event.startDate ?? market?.startDate ?? null)} />
            <Stat k="End" v={formatWhen(event.endDate)} />
            <Stat k="Vol 24h" v={formatUsd(event.volume24hr)} />
            <Stat k="Total vol" v={formatUsd(event.volume)} />
          </div>

          <div className="mt-3 flex items-center justify-between rounded-md bg-surface-2 px-3 py-2 text-[12px]">
            <span className="text-muted">Closes in</span>
            <span className="tabular text-accent">{formatDuration(tte)}</span>
          </div>

          {snap?.binance ? (
            <div className="mt-3 overflow-hidden rounded-md border border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-[10px] tracking-[0.18em] text-muted">
                <span>BINANCE · {snap.binance.tick.symbol}</span>
                <span className="tabular text-fg">{snap.binance.tick.price.toLocaleString()}</span>
              </div>
              <div className="h-56 sm:h-72">
                <MagicChart embed />
              </div>
            </div>
          ) : null}

          {snap?.historyYes.length ? (
            <div className="mt-3 overflow-hidden rounded-md border border-border">
              <div className="border-b border-border px-3 py-1.5 text-[10px] tracking-[0.18em] text-muted">
                POLYMARKET ODDS · {yesLabel.toUpperCase()}
              </div>
              <PolyOddsChart />
            </div>
          ) : (
            <div className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-[11px] text-muted">
              Odds history for this strike is still catching up — live book is below.
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <OutcomeCard
              label={yesLabel}
              price={yes}
              hot
              active={kind === "BUY_YES"}
            />
            <OutcomeCard
              label={noLabel}
              price={no}
              hot={false}
              active={kind === "BUY_NO"}
            />
          </div>

          {event.markets.length > 1 ? (
            <section className="mt-4">
              <div className="mb-2 text-[10px] tracking-[0.22em] text-muted">OUTCOMES</div>
              <div className="space-y-1">
                {event.markets.map((m) => {
                  const p = m.outcomePrices[0] ?? 0;
                  return (
                    <button
                      key={m.id}
                      onClick={() => selectMarket(event.id, m.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left",
                        selectedMarketId === m.id ? "bg-accent-dim" : "bg-surface-2 hover:bg-surface-3",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate text-[12px]">
                        {m.groupItemTitle || m.question}
                      </span>
                      <span className="h-1.5 w-24 overflow-hidden rounded-sm bg-surface-3">
                        <span className="block h-full bg-accent" style={{ width: `${Math.round(p * 100)}%` }} />
                      </span>
                      <span className="tabular w-12 text-right text-[12px]">{formatPct(p, 0)}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {detail?.windows.length ? (
            <section className="mt-4">
              <div className="mb-2 text-[10px] tracking-[0.22em] text-muted">WINDOWS</div>
              <div className="flex gap-1 overflow-x-auto pb-1">
                {detail.windows.slice(0, 16).map((w) => (
                  <button
                    key={w.id + w.marketId}
                    onClick={() => openCampaign(w.id, w.marketId)}
                    className={cn(
                      "flex h-14 w-16 shrink-0 flex-col items-center justify-center rounded-sm text-[10px]",
                      w.marketId === selectedMarketId
                        ? "bg-accent text-bg"
                        : w.closed
                          ? w.yes >= 0.5
                            ? "bg-accent-dim text-accent"
                            : "bg-danger-dim text-danger"
                          : "bg-surface-2 text-muted",
                    )}
                  >
                    <span className="tabular">
                      {w.end ? new Date(w.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </span>
                    <span className="tabular">{formatPct(w.yes, 0)}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-4 rounded-md border border-border p-3">
            <div className="mb-2 text-[10px] tracking-[0.22em] text-muted">AI DECISION</div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className={cn("font-sans text-xl font-semibold", kind === "BUY_NO" ? "text-danger" : kind === "BUY_YES" ? "text-accent" : "text-muted")}>
                  {kind.replace("_", " ")}
                </div>
                <div className="text-[11px] text-muted">
                  Edge {sig ? formatPct(sig.edge, 1) : "—"} · Cal {sig ? formatPct(sig.calibratedProbability, 1) : "—"} · {sig?.state ?? "IDLE"}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={onRun} disabled={llmBusy || !snap}>
                  {llmBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Bot className="size-3.5" />}
                  Agent
                </Button>
                <Button size="sm" variant="outline" onClick={onArm} disabled={!actionable}>
                  Arm
                </Button>
              </div>
            </div>
            {sig?.llmReason ? <p className="mt-2 text-[12px] leading-relaxed text-fg">{sig.llmReason}</p> : null}
          </section>

          {event.description ? (
            <section className="mt-4">
              <div className="mb-2 text-[10px] tracking-[0.22em] text-muted">RULES</div>
              <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-fg">{event.description}</p>
            </section>
          ) : null}

          {event.resolutionSource ? (
            <a
              href={event.resolutionSource.startsWith("http") ? event.resolutionSource : undefined}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex items-center justify-between rounded-md bg-surface-2 px-3 py-3 text-[12px]"
            >
              <span>
                <span className="block text-[10px] tracking-widest text-muted">RESOLUTION SOURCE</span>
                <span className="text-fg">{event.resolutionSource.replace(/^https?:\/\//, "")}</span>
              </span>
              <ExternalLink className="size-4 text-muted" />
            </a>
          ) : null}

          {detail?.related.length ? (
            <section className="mt-5 pb-8">
              <div className="mb-2 text-[10px] tracking-[0.22em] text-muted">RELATED</div>
              <ul className="divide-y divide-border rounded-md border border-border">
                {detail.related.map((ev) => {
                  const p = ev.markets[0]?.outcomePrices[0] ?? 0;
                  return (
                    <li key={ev.id}>
                      <button
                        onClick={() => openCampaign(ev.id, ev.markets[0]?.id ?? "")}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                      >
                        {ev.image ? (
                          <img src={ev.image} alt="" className="size-8 rounded-sm object-cover" />
                        ) : (
                          <span className="size-8 rounded-sm bg-surface-2" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-[12px]">{ev.title}</span>
                        <span className="tabular text-[12px] text-muted">{formatPct(p, 0)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : (
            <div className="h-8" />
          )}
        </div>
      </div>
    </div>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
      <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back" className="size-9">
        <ArrowLeft className="size-4" />
      </Button>
      <h2 className="min-w-0 truncate font-sans text-sm font-medium">{title}</h2>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2">
      <div className="text-[10px] tracking-widest text-muted">{k}</div>
      <div className="tabular text-[12px] text-fg">{v}</div>
    </div>
  );
}

function OutcomeCard({
  label,
  price,
  hot,
  active,
}: {
  label: string;
  price: number;
  hot: boolean;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md px-3 py-3",
        hot ? "bg-accent-dim" : "bg-danger-dim",
        active && "shadow-[0_0_0_1px_var(--color-accent)]",
      )}
    >
      <div className="text-[10px] tracking-widest text-muted">{label.toUpperCase()}</div>
      <div className={cn("font-sans text-2xl font-semibold", hot ? "text-accent" : "text-danger")}>
        {formatCents(price)}
      </div>
      <div className="text-[11px] text-muted">
        {formatPct(price, 0)} · {formatMult(price)}
      </div>
    </div>
  );
}
