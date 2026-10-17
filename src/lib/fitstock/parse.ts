import type { PolyEventCard, PolyMarket, PolyTag } from "./types";

export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v));
    } catch {
      return [];
    }
  }
  return [];
}

export function parseJsonNumbers(value: unknown): number[] {
  return parseJsonArray(value).map((v) => asNumber(v, 0));
}

function parseTags(raw: unknown): PolyTag[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => {
      if (!t || typeof t !== "object") return null;
      const row = t as Record<string, unknown>;
      const slug = asString(row.slug);
      const label = asString(row.label) || slug;
      const id = asString(row.id);
      if (!slug && !id) return null;
      return { id, label, slug };
    })
    .filter((t): t is PolyTag => t !== null);
}

function firstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s)]+/i);
  return m ? m[0].replace(/[.,;]+$/, "") : null;
}

export function normalizeMarket(
  raw: Record<string, unknown>,
  event: { id: string; title: string; tags: PolyTag[]; description?: string; startDate?: string | null },
): PolyMarket {
  const outcomes = parseJsonArray(raw.outcomes);
  const prices = parseJsonNumbers(raw.outcomePrices);
  const tokens = parseJsonArray(raw.clobTokenIds);
  return {
    id: asString(raw.id),
    eventId: event.id,
    eventTitle: event.title,
    question: asString(raw.question) || asString(raw.groupItemTitle) || "Untitled market",
    slug: asString(raw.slug),
    conditionId: asString(raw.conditionId),
    endDate: asString(raw.endDate) || null,
    startDate: asString(raw.startDate || raw.eventStartTime) || event.startDate || null,
    image: asString(raw.image) || asString(raw.icon) || null,
    description: asString(raw.description) || event.description || "",
    outcomes: outcomes.length ? outcomes : ["Yes", "No"],
    outcomePrices: prices,
    clobTokenIds: tokens,
    bestBid: raw.bestBid == null ? null : asNumber(raw.bestBid, 0),
    bestAsk: raw.bestAsk == null ? null : asNumber(raw.bestAsk, 0),
    spread: raw.spread == null ? null : asNumber(raw.spread, 0),
    liquidityUsdc: asNumber(raw.liquidityNum ?? raw.liquidity, 0),
    volume: asNumber(raw.volumeNum ?? raw.volume, 0),
    volume24hr: asNumber(raw.volume24hr, 0),
    orderMinSize: asNumber(raw.orderMinSize, 5),
    tickSize: asNumber(raw.orderPriceMinTickSize, 0.01),
    enableOrderBook: Boolean(raw.enableOrderBook),
    negRisk: Boolean(raw.negRisk),
    groupItemTitle: asString(raw.groupItemTitle) || null,
    tags: event.tags,
  };
}

export function normalizeEvent(raw: Record<string, unknown>): PolyEventCard | null {
  const id = asString(raw.id);
  const title = asString(raw.title) || asString(raw.question);
  if (!id || !title) return null;
  const tags = parseTags(raw.tags);
  const description = asString(raw.description);
  const startDate = asString(raw.startDate || raw.startTime) || null;
  const resolutionSource =
    asString(raw.resolutionSource) || firstUrl(description) || null;
  const series =
    raw.series && typeof raw.series === "object"
      ? (raw.series as Record<string, unknown>)
      : null;
  const seriesSlug =
    asString(raw.seriesSlug) ||
    asString(series?.slug) ||
    asString(Array.isArray(raw.series) ? (raw.series[0] as Record<string, unknown>)?.slug : "") ||
    null;
  const marketsRaw = Array.isArray(raw.markets) ? raw.markets : [];
  const markets = marketsRaw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .map((m) => normalizeMarket(m, { id, title, tags, description, startDate }))
    .filter((m) => m.id && m.clobTokenIds.length > 0);
  return {
    id,
    title,
    slug: asString(raw.slug),
    description,
    startDate,
    endDate: asString(raw.endDate) || null,
    image: asString(raw.image) || asString(raw.icon) || null,
    resolutionSource,
    seriesSlug,
    commentCount: asNumber(raw.commentCount, 0),
    liquidityUsdc: asNumber(raw.liquidity, 0),
    volume: asNumber(raw.volume, 0),
    volume24hr: asNumber(raw.volume24hr, 0),
    tags,
    markets,
  };
}

export function midpoint(bid: number | null, ask: number | null, fallback: number): number {
  if (bid != null && ask != null && bid > 0 && ask > 0) return (bid + ask) / 2;
  if (ask != null && ask > 0) return ask;
  if (bid != null && bid > 0) return bid;
  return fallback;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function roundToTick(price: number, tick: number): number {
  if (tick <= 0) return price;
  const decimals = String(tick).split(".")[1]?.length ?? 0;
  const rounded = Math.round(price / tick) * tick;
  return Number(rounded.toFixed(decimals));
}

export function formatPct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function formatUsd(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(digits)}`;
}

export function formatPx(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(digits);
  return n.toFixed(Math.min(6, Math.max(digits, 2)));
}

export function formatCents(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "—";
  const c = p * 100;
  return `${c.toFixed(c >= 10 ? 0 : 1)}¢`;
}

export function formatMult(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "—";
  return `×${(1 / p).toFixed(1)}`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return `${d}d ${h}h`;
}

export function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortAddr(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function nowMs(): number {
  return Date.now();
}

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;
}
