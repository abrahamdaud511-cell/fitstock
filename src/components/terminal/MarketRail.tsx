import { Search } from "lucide-react";
import { CATEGORIES, CRYPTO_UNITS, TIMEFRAMES } from "@/lib/fitstock/types";
import { formatCents, formatDuration, formatMult, formatPct, formatUsd } from "@/lib/fitstock/parse";
import { tteSeconds } from "@/lib/fitstock/mapping";
import { useTerminal } from "@/lib/fitstock/store";
import type { PolyEventCard } from "@/lib/fitstock/types";
import { cn } from "@/lib/utils";

export function MarketRail({ events }: { events: PolyEventCard[] }) {
  const category = useTerminal((s) => s.category);
  const timeframe = useTerminal((s) => s.timeframe);
  const unit = useTerminal((s) => s.unit);
  const query = useTerminal((s) => s.query);
  const setFilters = useTerminal((s) => s.setFilters);
  const selectedEventId = useTerminal((s) => s.selectedEventId);
  const selectedMarketId = useTerminal((s) => s.selectedMarketId);
  const openCampaign = useTerminal((s) => s.openCampaign);
  const err = useTerminal((s) => s.eventsError);
  const eventsAt = useTerminal((s) => s.eventsAt);
  const loading = eventsAt === 0;
  const health = useTerminal((s) => s.health);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] tracking-[0.22em] text-muted">POLYMARKET</div>
          <span className={cn("text-[10px] tracking-widest", health?.gamma.ok ? "text-accent" : "text-danger")}>
            {health?.gamma.ok ? "LIVE" : health ? "DOWN" : "…"}
          </span>
        </div>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setFilters({ query: e.target.value })}
            placeholder="Search campaigns"
            className="h-10 w-full rounded-sm border-0 bg-surface-2 pl-8 pr-2 text-xs text-fg outline-none ring-1 ring-border placeholder:text-faint focus:ring-accent"
          />
        </div>
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.slug}
              onClick={() => setFilters({ category: c.slug })}
              className={cn(
                "h-8 shrink-0 rounded-sm px-2 text-[10px] tracking-widest",
                category === c.slug ? "bg-accent text-bg" : "bg-surface-2 text-muted hover:text-fg",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="mt-1 flex gap-1">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setFilters({ timeframe: t.id })}
              className={cn(
                "h-7 flex-1 rounded-sm text-[10px]",
                timeframe === t.id ? "bg-surface-3 text-accent" : "text-muted hover:text-fg",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {category === "crypto" ? (
          <div className="mt-1 flex gap-1 overflow-x-auto">
            {CRYPTO_UNITS.map((u) => (
              <button
                key={u}
                onClick={() => setFilters({ unit: u })}
                className={cn(
                  "h-7 shrink-0 px-1.5 text-[10px]",
                  unit === u ? "text-accent" : "text-muted hover:text-fg",
                )}
              >
                {u}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? <div className="px-3 py-6 text-xs text-muted">Loading live campaigns…</div> : null}
        {err ? <div className="px-3 py-2 text-xs text-danger">{err}</div> : null}
        {!loading && !events.length && !err ? (
          <div className="px-3 py-6 text-xs text-muted">No live campaigns in this filter. Try ALL time.</div>
        ) : null}
        {events.map((ev) => (
          <EventCard
            key={ev.id}
            ev={ev}
            selectedEventId={selectedEventId}
            selectedMarketId={selectedMarketId}
            onOpen={openCampaign}
          />
        ))}
      </div>
    </div>
  );
}

function EventCard({
  ev,
  selectedEventId,
  selectedMarketId,
  onOpen,
}: {
  ev: PolyEventCard;
  selectedEventId: string | null;
  selectedMarketId: string | null;
  onOpen: (eventId: string, marketId: string) => void;
}) {
  const binary = ev.markets.length === 1 && (ev.markets[0]?.outcomes.length ?? 0) <= 2;
  const m = ev.markets[0];
  const yes = m?.outcomePrices[0] ?? 0;
  const no = m?.outcomePrices[1] ?? 1 - yes;
  const yesLabel = m?.outcomes[0] ?? "Yes";
  const noLabel = m?.outcomes[1] ?? "No";

  return (
    <article className={cn("border-b border-border px-3 py-2.5", selectedEventId === ev.id && "bg-surface-2")}>
      <button onClick={() => onOpen(ev.id, m?.id ?? "")} className="flex w-full items-start justify-between gap-2 text-left">
        <div className="flex min-w-0 items-start gap-2">
          {ev.image ? (
            <img src={ev.image} alt="" className="mt-0.5 size-8 shrink-0 rounded-sm object-cover" />
          ) : null}
          <div className="min-w-0">
            <h3 className="text-[12px] font-medium leading-snug text-fg">{ev.title}</h3>
            <div className="mt-0.5 text-[10px] text-muted">
              {formatDuration(tteSeconds(ev.endDate))}
              {ev.tags[0] ? ` · ${ev.tags[0].label}` : ""}
            </div>
          </div>
        </div>
        <span className="tabular shrink-0 text-[10px] text-muted">{formatUsd(ev.volume24hr)}</span>
      </button>
      {binary && m ? (
        <button
          onClick={() => onOpen(ev.id, m.id)}
          className={cn(
            "mt-2 flex w-full overflow-hidden rounded-md text-left",
            selectedMarketId === m.id ? "shadow-[0_0_0_1px_var(--color-accent)]" : "",
          )}
        >
          <div className="flex-1 bg-accent-dim px-2 py-2">
            <div className="text-[10px] tracking-widest text-muted">{yesLabel.toUpperCase()}</div>
            <div className="tabular text-sm text-accent">{formatCents(yes)}</div>
            <div className="text-[10px] text-muted">{formatMult(yes)}</div>
          </div>
          <div className="flex w-16 flex-col items-center justify-center bg-surface-3">
            <div className="text-[9px] tracking-widest text-muted">ODDS</div>
            <div className="tabular text-sm text-fg">{formatPct(yes, 0)}</div>
          </div>
          <div className="flex-1 bg-danger-dim px-2 py-2 text-right">
            <div className="text-[10px] tracking-widest text-muted">{noLabel.toUpperCase()}</div>
            <div className="tabular text-sm text-danger">{formatCents(no)}</div>
            <div className="text-[10px] text-muted">{formatMult(no)}</div>
          </div>
        </button>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {ev.markets.slice(0, 8).map((mk) => {
            const p = mk.outcomePrices[0] ?? 0;
            const active = selectedMarketId === mk.id;
            return (
              <li key={mk.id}>
                <button
                  onClick={() => onOpen(ev.id, mk.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-1 py-1 text-left text-[11px]",
                    active ? "bg-accent-dim text-accent" : "hover:bg-surface-2",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{mk.groupItemTitle || mk.question}</span>
                  <span className={cn("tabular", p >= 0.5 ? "text-accent" : "text-danger")}>{formatPct(p, 1)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
