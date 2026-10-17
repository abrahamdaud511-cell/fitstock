import { useEffect, useRef } from "react";
import { useTerminal } from "@/lib/fitstock/store";

export function PolyOddsChart() {
  const host = useRef<HTMLDivElement>(null);
  const snap = useTerminal((s) => s.snapshot);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let chart: { remove: () => void } | null = null;
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
        rightPriceScale: {
          borderColor: "#1e262c",
          scaleMargins: { top: 0.08, bottom: 0.08 },
        },
        timeScale: { borderColor: "#1e262c", timeVisible: true, secondsVisible: false },
        crosshair: { vertLine: { color: "#3ddc7a", width: 1 }, horzLine: { color: "#3ddc7a", width: 1 } },
        autoSize: true,
      });
      chart = c;
      const yes = c.addSeries(lc.LineSeries, {
        color: "#3ddc7a",
        lineWidth: 2,
        priceFormat: { type: "price", precision: 1, minMove: 0.1 },
      });
      const apply = () => {
        const s = useTerminal.getState().snapshot;
        if (!s?.historyYes.length) return;
        const pts = s.historyYes
          .filter((p) => p.t > 1_000_000_000)
          .map((p) => ({
            time: (p.t > 1e12 ? Math.floor(p.t / 1000) : p.t) as never,
            value: p.p * 100,
          }));
        if (pts.length) yes.setData(pts);
      };
      const unsub = useTerminal.subscribe(apply);
      apply();
      const node = host.current;
      if (node) {
        ro = new ResizeObserver(() => c.resize(node.clientWidth, node.clientHeight));
        ro.observe(node);
      }
      (c as unknown as { __unsub?: () => void }).__unsub = () => {
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
  }, [snap?.market.id]);

  return (
    <div className="relative h-56 w-full sm:h-72">
      <div ref={host} className="absolute inset-0" />
      {!snap?.historyYes.length ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">
          Waiting for Polymarket odds history
        </div>
      ) : null}
    </div>
  );
}
