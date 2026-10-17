import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatPct, formatPx } from "@/lib/fitstock/parse";
import { useTerminal } from "@/lib/fitstock/store";
import { cn } from "@/lib/utils";

const INTERVALS = ["1m", "5m", "15m", "1h", "4h"] as const;

export function MagicChart({ embed = false }: { embed?: boolean }) {
  const snap = useTerminal((s) => s.snapshot);
  const interval = useTerminal((s) => s.chartInterval);
  const setInterval_ = useTerminal((s) => s.setChartInterval);
  const showTv = useTerminal((s) => s.showTv);
  const setShowTv = useTerminal((s) => s.setShowTv);
  const events = useTerminal((s) => s.events);
  const selectedEventId = useTerminal((s) => s.selectedEventId);
  const selectedMarketId = useTerminal((s) => s.selectedMarketId);
  const selectMarket = useTerminal((s) => s.selectMarket);
  const event = events.find((e) => e.id === selectedEventId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {embed ? null : (
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto border-b border-border px-3 py-2">
          <div className="text-[10px] tracking-[0.22em] text-muted">MAGIC CHART</div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {INTERVALS.map((i) => (
              <button
                key={i}
                onClick={() => setInterval_(i)}
                className={cn(
                  "h-7 px-1.5 text-[10px] tracking-widest",
                  interval === i ? "text-accent" : "text-muted hover:text-fg",
                )}
              >
                {i.toUpperCase()}
              </button>
            ))}
            <Button variant={showTv ? "dim" : "ghost"} size="sm" onClick={() => setShowTv(!showTv)}>
              TV
            </Button>
          </div>
        </div>
      )}
      {embed ? null : snap?.binance ? (
        <div className="flex gap-3 border-b border-border px-3 py-1.5 text-[11px]">
          <span className="text-muted">{snap.binance.tick.symbol}</span>
          <span className="tabular text-fg">{formatPx(snap.binance.tick.price)}</span>
          <span className={cn("tabular", snap.binance.tick.change24hPct >= 0 ? "text-accent" : "text-danger")}>
            {snap.binance.tick.change24hPct >= 0 ? "+" : ""}
            {snap.binance.tick.change24hPct.toFixed(2)}%
          </span>
          <span className="hidden text-muted sm:inline">
            Δ1m {(snap.features.delta1m * 100).toFixed(2)}% · Δ5m {(snap.features.delta5m * 100).toFixed(2)}%
          </span>
          {snap.map.strike ? (
            <span className="text-muted">
              K {formatPx(snap.map.strike)} {snap.map.kind.toUpperCase()}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="border-b border-border px-3 py-1.5 text-[11px] text-muted">
          {snap ? "No Binance map for this campaign — poly book only" : "Awaiting market lock"}
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {showTv && snap?.map.tradingView && !embed ? (
          <iframe
            title="TradingView"
            className="absolute inset-0 size-full border-0"
            src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(snap.map.tradingView)}&interval=${intervalToTv(interval)}&hidesidetoolbar=1&theme=dark&style=1&locale=en&hideideas=1`}
          />
        ) : (
          <ChartCanvas />
        )}
      </div>
      {!embed && event && event.markets.length > 1 ? (
        <div className="max-h-28 overflow-y-auto border-t border-border px-3 py-2">
          <div className="mb-1 text-[10px] tracking-[0.22em] text-muted">CAMPAIGN LADDER</div>
          <div className="space-y-1">
            {event.markets.map((m) => {
              const yes = m.outcomePrices[0] ?? 0;
              return (
                <button
                  key={m.id}
                  onClick={() => selectMarket(event.id, m.id)}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <span className="w-28 truncate text-[10px] text-muted">
                    {m.groupItemTitle || m.question}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-sm bg-surface-3">
                    <span
                      className={cn("block h-full", selectedMarketId === m.id ? "bg-accent" : "bg-border-strong")}
                      style={{ width: `${Math.round(yes * 100)}%` }}
                    />
                  </span>
                  <span className="tabular w-10 text-right text-[10px] text-fg">{formatPct(yes, 0)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function intervalToTv(i: string): string {
  if (i === "1m") return "1";
  if (i === "5m") return "5";
  if (i === "15m") return "15";
  if (i === "1h") return "60";
  if (i === "4h") return "240";
  return "15";
}

function ChartCanvas() {
  const host = useRef<HTMLDivElement>(null);
  const snap = useTerminal((s) => s.snapshot);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let chart: { remove: () => void; resize: (w: number, h: number) => void } | null = null;
    let ro: ResizeObserver | null = null;

    void import("lightweight-charts").then((lc) => {
      if (disposed || !host.current) return;
      const c = lc.createChart(host.current, {
        layout: {
          background: { type: lc.ColorType.Solid, color: "#0c0f12" },
          textColor: "#7b857c",
          fontFamily: "IBM Plex Mono, monospace",
          fontSize: 11,
          attributionLogo: false,
        },
        grid: {
          vertLines: { color: "#1e262c" },
          horzLines: { color: "#1e262c" },
        },
        rightPriceScale: { borderColor: "#1e262c" },
        timeScale: { borderColor: "#1e262c", timeVisible: true, secondsVisible: false },
        crosshair: { vertLine: { color: "#3ddc7a", width: 1 }, horzLine: { color: "#3ddc7a", width: 1 } },
        autoSize: true,
      });
      chart = c;
      const candle = c.addSeries(lc.CandlestickSeries, {
        upColor: "#3ddc7a",
        downColor: "#e25b4a",
        borderVisible: false,
        wickUpColor: "#3ddc7a",
        wickDownColor: "#e25b4a",
      });
      let strikeLine: { applyOptions: (o: { price: number }) => void } | null = null;
      const apply = () => {
        const s = useTerminal.getState().snapshot;
        if (!s) return;
        if (s.binance?.klines.length) {
          candle.setData(
            s.binance.klines.map((k) => ({
              time: k.time as never,
              open: k.open,
              high: k.high,
              low: k.low,
              close: k.close,
            })),
          );
        }
        if (s.map.strike && s.binance) {
          if (!strikeLine) {
            strikeLine = candle.createPriceLine({
              price: s.map.strike,
              color: "#c4a35a",
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: "K",
            });
          } else {
            strikeLine.applyOptions({ price: s.map.strike });
          }
        }
      };
      const unsub = useTerminal.subscribe(apply);
      apply();
      setReady(true);

      const node = host.current;
      if (node) {
        ro = new ResizeObserver(() => {
          c.resize(node.clientWidth, node.clientHeight);
        });
        ro.observe(node);
      }

      (chart as unknown as { __unsub?: () => void }).__unsub = () => {
        unsub();
        ro?.disconnect();
      };
    });

    return () => {
      disposed = true;
      const extra = chart as unknown as { __unsub?: () => void } | null;
      extra?.__unsub?.();
      chart?.remove();
    };
  }, [snap?.market.id, snap?.binance?.interval]);

  return (
    <div className="absolute inset-0">
      <div ref={host} className="size-full" />
      {!ready && !snap?.binance ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">
          {snap?.historyYes.length ? "Campaign odds loaded · no Binance overlay" : "Waiting for candles"}
        </div>
      ) : null}
    </div>
  );
}
