import { createServerFn } from "@tanstack/react-start";
import { asNumber, asString } from "./parse";
import { normalizeEvent, normalizeMarket } from "./parse";
import { ORCHESTRATOR_PROMPT, parseLlmSignal, type LlmSignal } from "./prompts";
import type {
  AiModelOption,
  AiProbeResult,
  Candle,
  CommentItem,
  EventDetail,
  FeedProbe,
  IntegrationHealth,
  OrderBook,
  PolyEventCard,
  PolyPosition,
  PolyTradeRow,
  PortfolioSnapshot,
  PricePoint,
  SeriesWindow,
} from "./types";

const GAMMA = "https://gamma-api.polymarket.com";
const CLOB = "https://clob.polymarket.com";
const DATA = "https://data-api.polymarket.com";
const BINANCE_HOSTS = [
  "https://data-api.binance.vision",
  "https://api.binance.us",
  "https://api.binance.com",
];

async function getJson(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        accept: "application/json",
        "user-agent": "FITSTOCK/1.0",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`${res.status} ${url} ${body.slice(0, 180)}`);
    }
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(t);
  }
}

async function probeUrl(url: string, timeoutMs = 6000): Promise<FeedProbe> {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json", "user-agent": "FITSTOCK/1.0" } });
    clearTimeout(t);
    const latencyMs = Date.now() - t0;
    if (!res.ok) return { ok: false, latencyMs, error: `${res.status}` };
    return { ok: true, latencyMs };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - t0, error: err instanceof Error ? err.message : "unreachable" };
  }
}

async function binanceJson(path: string): Promise<unknown> {
  let last = "binance unreachable";
  for (const host of BINANCE_HOSTS) {
    try {
      return await getJson(`${host}${path}`, {}, 7000);
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(last);
}

function parseKlines(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!Array.isArray(row) || row.length < 6) return null;
      const time = Math.floor(asNumber(row[0]) / 1000);
      const open = asNumber(row[1]);
      const high = asNumber(row[2]);
      const low = asNumber(row[3]);
      const close = asNumber(row[4]);
      const volume = asNumber(row[5]);
      if (!time || !close) return null;
      return { time, open, high, low, close, volume };
    })
    .filter((c): c is Candle => c !== null);
}

function parseBook(raw: unknown, receiveTime: number): OrderBook | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const levels = (side: unknown, desc: boolean): { price: number; size: number }[] => {
    if (!Array.isArray(side)) return [];
    const rows = side
      .map((l) => {
        if (!l || typeof l !== "object") return null;
        const r = l as Record<string, unknown>;
        return { price: asNumber(r.price), size: asNumber(r.size) };
      })
      .filter((l): l is { price: number; size: number } => !!l && l.price > 0);
    rows.sort((a, b) => (desc ? b.price - a.price : a.price - b.price));
    return rows.slice(0, 16);
  };
  const bids = levels(o.bids, true);
  const asks = levels(o.asks, false);
  return {
    tokenId: asString(o.asset_id),
    tickSize: asNumber(o.tick_size, 0.01),
    minOrderSize: asNumber(o.min_order_size, 5),
    bids,
    asks,
    latencyMs: 0,
    eventTime: receiveTime,
    receiveTime,
  };
}

function parseHistory(raw: unknown): PricePoint[] {
  if (!raw) return [];
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { history?: unknown }).history)
      ? ((raw as { history: unknown[] }).history)
      : [];
  return arr
    .map((p) => {
      if (!p || typeof p !== "object") return null;
      const r = p as Record<string, unknown>;
      return { t: asNumber(r.t), p: asNumber(r.p) };
    })
    .filter((p): p is PricePoint => !!p && p.t > 0);
}

export const fetchEvents = createServerFn({ method: "POST" })
  .validator((input: { category: string; limit?: number; query?: string }) => input)
  .handler(async ({ data }): Promise<{ events: PolyEventCard[]; fetchedAt: number; error?: string }> => {
    try {
      const limit = data.limit ?? 40;
      let url: string;
      if (data.query?.trim()) {
        url = `${GAMMA}/public-search?q=${encodeURIComponent(data.query.trim())}`;
        const raw = (await getJson(url, {}, 10000)) as Record<string, unknown>;
        const list = Array.isArray(raw.events) ? raw.events : [];
        const events = list
          .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
          .map(normalizeEvent)
          .filter((e): e is PolyEventCard => !!e && e.markets.length > 0);
        return { events, fetchedAt: Date.now() };
      }
      const params = new URLSearchParams({
        active: "true",
        closed: "false",
        limit: String(limit),
        order: "volume24hr",
        ascending: "false",
      });
      if (data.category && data.category !== "all") params.set("tag_slug", data.category);
      const raw = await getJson(`${GAMMA}/events?${params.toString()}`, {}, 10000);
      const list = Array.isArray(raw) ? raw : [];
      const events = list
        .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
        .map(normalizeEvent)
        .filter((e): e is PolyEventCard => !!e && e.markets.length > 0);
      return { events, fetchedAt: Date.now() };
    } catch (err) {
      return {
        events: [],
        fetchedAt: Date.now(),
        error: err instanceof Error ? err.message : "Failed to load Polymarket",
      };
    }
  });

export const fetchBinance = createServerFn({ method: "POST" })
  .validator((input: { symbol: string; interval?: string; limit?: number }) => input)
  .handler(async ({ data }) => {
    const symbol = data.symbol.toUpperCase();
    const interval = data.interval ?? "1m";
    const limit = data.limit ?? 180;
    const started = Date.now();
    const [ticker, klines, depth, bookTicker, premium] = await Promise.all([
      binanceJson(`/api/v3/ticker/24hr?symbol=${symbol}`),
      binanceJson(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`),
      binanceJson(`/api/v3/depth?symbol=${symbol}&limit=20`),
      binanceJson(`/api/v3/ticker/bookTicker?symbol=${symbol}`),
      getJson(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`, {}, 4000).catch(() => null),
    ]);
    const receiveTime = Date.now();
    const t = (ticker ?? {}) as Record<string, unknown>;
    const bt = (bookTicker ?? {}) as Record<string, unknown>;
    const pr = premium && typeof premium === "object" ? (premium as Record<string, unknown>) : null;
    const eventTime = asNumber(t.closeTime, receiveTime);
    const price = asNumber(t.lastPrice);
    const bid = asNumber(bt.bidPrice ?? t.bidPrice, price);
    const ask = asNumber(bt.askPrice ?? t.askPrice, price);
    const depthObj = (depth ?? {}) as Record<string, unknown>;
    const candles = parseKlines(klines);
    const toLevels = (side: unknown) =>
      Array.isArray(side)
        ? side
            .slice(0, 12)
            .map((row) =>
              Array.isArray(row)
                ? { price: asNumber(row[0]), size: asNumber(row[1]) }
                : { price: 0, size: 0 },
            )
            .filter((l) => l.price > 0)
        : [];
    return {
      tick: {
        source: "binance" as const,
        symbol,
        eventTime,
        receiveTime,
        latencyMs: Math.max(0, receiveTime - eventTime),
        price,
        bid,
        ask,
        bidQty: asNumber(bt.bidQty ?? t.bidQty),
        askQty: asNumber(bt.askQty ?? t.askQty),
        volume1m: candles.at(-1)?.volume ?? 0,
        volume24h: asNumber(t.volume),
        change24hPct: asNumber(t.priceChangePercent),
        high24h: asNumber(t.highPrice),
        low24h: asNumber(t.lowPrice),
        openPrice: asNumber(t.openPrice),
        fundingRate: pr ? asNumber(pr.lastFundingRate, 0) : null,
        markPrice: pr ? asNumber(pr.markPrice, 0) : null,
        status: price > 0 ? ("VALID" as const) : ("INVALID" as const),
      },
      klines: candles,
      depth: { bids: toLevels(depthObj.bids), asks: toLevels(depthObj.asks) },
      interval,
      roundtripMs: receiveTime - started,
    };
  });

export const fetchMarketBundle = createServerFn({ method: "POST" })
  .validator((input: { marketId: string; eventId?: string }) => input)
  .handler(async ({ data }) => {
    const started = Date.now();
    const raw = await getJson(`${GAMMA}/markets/${encodeURIComponent(data.marketId)}`, {}, 8000);
    if (!raw || typeof raw !== "object") throw new Error("Market not found");
    const row = raw as Record<string, unknown>;
    const market = normalizeMarket(row, {
      id: asString(row.eventId ?? data.eventId ?? ""),
      title: asString(row.question),
      tags: [],
      description: asString(row.description),
      startDate: asString(row.startDate) || null,
    });
    const yes = market.clobTokenIds[0];
    const no = market.clobTokenIds[1];
    const receive = Date.now();
    const [bookYesRaw, bookNoRaw, histYesRaw, histNoRaw, commentsRaw] = await Promise.all([
      yes ? getJson(`${CLOB}/book?token_id=${encodeURIComponent(yes)}`, {}, 7000).catch(() => null) : null,
      no ? getJson(`${CLOB}/book?token_id=${encodeURIComponent(no)}`, {}, 7000).catch(() => null) : null,
      yes
        ? getJson(
            `${CLOB}/prices-history?market=${encodeURIComponent(yes)}&interval=max&fidelity=30`,
            {},
            8000,
          ).catch(() =>
            getJson(
              `${CLOB}/prices-history?market=${encodeURIComponent(yes)}&interval=1d&fidelity=10`,
              {},
              8000,
            ).catch(() => null),
          )
        : null,
      no
        ? getJson(
            `${CLOB}/prices-history?market=${encodeURIComponent(no)}&interval=max&fidelity=30`,
            {},
            8000,
          ).catch(() => null)
        : null,
      data.eventId
        ? getJson(
            `${GAMMA}/comments?parent_entity_type=Event&parent_entity_id=${encodeURIComponent(data.eventId)}&limit=8`,
            {},
            6000,
          ).catch(() => null)
        : null,
    ]);
    const bookYes = parseBook(bookYesRaw, receive);
    const bookNo = parseBook(bookNoRaw, receive);
    if (bookYes) bookYes.latencyMs = Date.now() - started;
    if (bookNo) bookNo.latencyMs = Date.now() - started;

    const comments: CommentItem[] = [];
    const cArr = Array.isArray(commentsRaw)
      ? commentsRaw
      : commentsRaw && typeof commentsRaw === "object" && Array.isArray((commentsRaw as { comments?: unknown }).comments)
        ? ((commentsRaw as { comments: unknown[] }).comments)
        : [];
    for (const c of cArr.slice(0, 8)) {
      if (!c || typeof c !== "object") continue;
      const r = c as Record<string, unknown>;
      const body = asString(r.body || r.content || r.text);
      if (!body) continue;
      comments.push({
        body: body.slice(0, 280),
        name: asString(r.userName || r.name) || null,
        createdAt: asString(r.createdAt) || null,
      });
    }

    return {
      market,
      bookYes,
      bookNo,
      historyYes: parseHistory(histYesRaw),
      historyNo: parseHistory(histNoRaw),
      comments,
      fetchedAt: Date.now(),
    };
  });

function asEventList(raw: unknown): PolyEventCard[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { events?: unknown }).events)
      ? ((raw as { events: unknown[] }).events)
      : [];
  return list
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map(normalizeEvent)
    .filter((e): e is PolyEventCard => !!e && e.markets.length > 0);
}

export const fetchEventDetail = createServerFn({ method: "POST" })
  .validator((input: { eventId: string }) => input)
  .handler(async ({ data }): Promise<EventDetail> => {
    const raw = await getJson(`${GAMMA}/events/${encodeURIComponent(data.eventId)}`, {}, 9000);
    if (!raw || typeof raw !== "object") throw new Error("Event not found");
    const event = normalizeEvent(raw as Record<string, unknown>);
    if (!event) throw new Error("Event unreadable");

    let related: PolyEventCard[] = [];
    let windows: SeriesWindow[] = [];
    const tag = event.tags.find((t) => t.slug && t.slug !== "crypto")?.slug ?? event.tags[0]?.slug;
    const seed = event.title.split(/[-–—]/)[0]?.trim().slice(0, 48) || event.title.slice(0, 48);

    const jobs: Promise<unknown>[] = [];
    if (event.seriesSlug) {
      jobs.push(
        getJson(
          `${GAMMA}/events?series_slug=${encodeURIComponent(event.seriesSlug)}&limit=16&order=endDate&ascending=true`,
          {},
          8000,
        ).catch(() => null),
      );
    } else {
      jobs.push(Promise.resolve(null));
    }
    jobs.push(
      getJson(`${GAMMA}/public-search?q=${encodeURIComponent(seed)}`, {}, 8000).catch(() => null),
    );
    if (tag) {
      jobs.push(
        getJson(
          `${GAMMA}/events?tag_slug=${encodeURIComponent(tag)}&active=true&closed=false&limit=12&order=volume24hr&ascending=false`,
          {},
          8000,
        ).catch(() => null),
      );
    }
    const [seriesRaw, searchRaw, tagRaw] = await Promise.all(jobs);

    const seriesEvents = asEventList(seriesRaw);
    if (seriesEvents.length) {
      windows = seriesEvents.flatMap((ev) => {
        const m = ev.markets[0];
        if (!m) return [];
        return [
          {
            id: ev.id,
            marketId: m.id,
            title: ev.title,
            start: ev.startDate,
            end: ev.endDate,
            yes: m.outcomePrices[0] ?? 0,
            closed: Date.parse(ev.endDate ?? "") < Date.now(),
          },
        ];
      });
    }

    const pool = [...asEventList(searchRaw), ...asEventList(tagRaw), ...seriesEvents];
    const seen = new Set<string>([event.id]);
    for (const ev of pool) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      related.push(ev);
      if (related.length >= 8) break;
    }

    if (!windows.length && event.markets.length > 1 && /up or down|5m|15 min|hourly/i.test(event.title)) {
      windows = event.markets.slice(0, 16).map((m) => ({
        id: m.id,
        marketId: m.id,
        title: m.groupItemTitle || m.question,
        start: m.startDate,
        end: m.endDate,
        yes: m.outcomePrices[0] ?? 0,
        closed: Date.parse(m.endDate ?? "") < Date.now(),
      }));
    }

    const uniqueEnds = new Set(windows.map((w) => w.end || w.id));
    if (windows.length < 3 || uniqueEnds.size < 3) windows = [];
    const seriesLike = windows.some((w) => /up or down|\b\d+\s*m\b|hour/i.test(`${w.title} ${event.title}`));
    if (!seriesLike) windows = [];

    return { event, related, windows };
  });

function mapPosition(r: Record<string, unknown>): PolyPosition {
  return {
    title: asString(r.title || r.name),
    outcome: asString(r.outcome),
    size: asNumber(r.current_size ?? r.size ?? r.currentSize),
    avgPrice: asNumber(r.avg_price ?? r.avgPrice),
    currentPrice: asNumber(r.current_price ?? r.curPrice ?? r.currPrice),
    currentValue: asNumber(r.current_value ?? r.currentValue),
    cashPnl: asNumber(r.cashPnl ?? r.unrealized_pnl ?? r.unrealizedPnl),
    realizedPnl: asNumber(r.realized_pnl ?? r.realizedPnl),
    percentPnl: asNumber(r.percentPnl ?? r.percent_pnl),
    icon: asString(r.icon) || null,
    slug: asString(r.slug || r.event_slug || r.eventSlug),
    eventSlug: asString(r.event_slug || r.eventSlug),
    eventId: asString(r.event_id ?? r.eventId),
    endDate: asString(r.end_date || r.endDate) || null,
    status: asString(r.status, "OPEN"),
    conditionId: asString(r.condition_id || r.conditionId),
    redeemable: Boolean(r.redeemable),
  };
}

export const fetchPortfolio = createServerFn({ method: "POST" })
  .validator((input: { address: string }) => input)
  .handler(async ({ data }): Promise<PortfolioSnapshot> => {
    const addr = data.address.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      return { valueUsdc: 0, collateralUsdc: null, positions: [], closed: [], trades: [], fetchedAt: Date.now(), error: "Invalid address" };
    }
    try {
      const [posRaw, closedRaw, valueRaw, tradesRaw] = await Promise.all([
        getJson(`${DATA}/v2/positions?user=${addr}&limit=80`, {}, 9000).catch(() =>
          getJson(`${DATA}/positions?user=${addr}&limit=80&sizeThreshold=0`, {}, 9000).catch(() => null),
        ),
        getJson(`${DATA}/v2/positions?user=${addr}&status=CLOSED&limit=40`, {}, 9000).catch(() =>
          getJson(`${DATA}/closed-positions?user=${addr}&limit=40`, {}, 9000).catch(() => null),
        ),
        getJson(`${DATA}/v2/value?user=${addr}`, {}, 7000).catch(() =>
          getJson(`${DATA}/value?user=${addr}`, {}, 7000).catch(() => null),
        ),
        getJson(`${DATA}/v2/trades?user=${addr}&limit=40`, {}, 9000).catch(() =>
          getJson(`${DATA}/trades?user=${addr}&limit=40`, {}, 9000).catch(() => null),
        ),
      ]);

      const unwrap = (raw: unknown): unknown[] => {
        if (Array.isArray(raw)) return raw;
        if (raw && typeof raw === "object") {
          const o = raw as Record<string, unknown>;
          if (Array.isArray(o.data)) return o.data;
          if (Array.isArray(o.positions)) return o.positions;
          if (Array.isArray(o.trades)) return o.trades;
        }
        return [];
      };

      const positions = unwrap(posRaw)
        .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
        .map(mapPosition)
        .filter((p) => p.title);

      const closed = unwrap(closedRaw)
        .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
        .map(mapPosition)
        .filter((p) => p.title);

      let valueUsdc = 0;
      if (valueRaw && typeof valueRaw === "object") {
        const v = valueRaw as Record<string, unknown>;
        const inner = v.data && typeof v.data === "object" ? (v.data as Record<string, unknown>) : v;
        valueUsdc = asNumber(inner.value ?? inner.user ?? inner.valueUsdc ?? (Array.isArray(inner) ? 0 : 0));
        if (Array.isArray(v.data) && v.data[0] && typeof v.data[0] === "object") {
          valueUsdc = asNumber((v.data[0] as Record<string, unknown>).value, valueUsdc);
        }
      }
      if (!valueUsdc) valueUsdc = positions.reduce((a, p) => a + (p.currentValue || 0), 0);

      const trades: PolyTradeRow[] = unwrap(tradesRaw)
        .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
        .map((t) => ({
          title: asString(t.title),
          outcome: asString(t.outcome),
          side: asString(t.side || t.type),
          size: asNumber(t.size),
          price: asNumber(t.price),
          usdc: asNumber(t.usdcSize ?? t.usdc_size, asNumber(t.size) * asNumber(t.price)),
          timestamp: asNumber(t.timestamp ?? t.createdAt ?? t.match_time) * (asNumber(t.timestamp) > 1e12 ? 1 : 1000),
          slug: asString(t.slug || t.eventSlug),
          transactionHash: asString(t.transactionHash || t.transaction_hash) || null,
        }))
        .filter((t) => t.title);

      return {
        valueUsdc,
        collateralUsdc: null,
        positions,
        closed,
        trades,
        fetchedAt: Date.now(),
      };
    } catch (err) {
      return {
        valueUsdc: 0,
        collateralUsdc: null,
        positions: [],
        closed: [],
        trades: [],
        fetchedAt: Date.now(),
        error: err instanceof Error ? err.message : "Portfolio fetch failed",
      };
    }
  });

export const probeIntegrations = createServerFn({ method: "GET" }).handler(async (): Promise<IntegrationHealth> => {
  const [gamma, clob, data, binance] = await Promise.all([
    probeUrl(`${GAMMA}/markets?limit=1&closed=false`),
    probeUrl(`${CLOB}/time`).then((p) => (p.ok ? p : probeUrl(`${CLOB}/`))),
    probeUrl(`${DATA}/trades?limit=1`),
    probeUrl("https://data-api.binance.vision/api/v3/time"),
  ]);
  return { gamma, clob, data, binance, checkedAt: Date.now() };
});

function isFreePrice(prompt: unknown, completion: unknown, id: string): boolean {
  const p = Number(prompt ?? 1);
  const c = Number(completion ?? 1);
  return (p === 0 && c === 0) || id.endsWith(":free") || id.includes(":free");
}

export const probeAi = createServerFn({ method: "POST" })
  .validator((input: { provider: "openrouter" | "huggingface"; key: string }) => input)
  .handler(async ({ data }): Promise<AiProbeResult> => {
    const key = data.key.trim();
    if (!key) {
      return { ok: false, error: "API key empty", models: [] };
    }
    if (data.provider === "openrouter") {
      try {
        const auth = await fetch("https://openrouter.ai/api/v1/key", {
          headers: { authorization: `Bearer ${key}`, accept: "application/json" },
        });
        if (!auth.ok) {
          const body = await auth.text().catch(() => "");
          return { ok: false, error: `OpenRouter auth ${auth.status} ${body.slice(0, 120)}`, models: [] };
        }
        const info = (await auth.json()) as {
          data?: { label?: string; usage?: number; limit?: number | null };
        };
        const modelsRaw = await fetch("https://openrouter.ai/api/v1/models", {
          headers: { authorization: `Bearer ${key}`, accept: "application/json" },
        });
        const modelsJson = modelsRaw.ok
          ? ((await modelsRaw.json()) as { data?: unknown[] })
          : { data: [] };
        const models: AiModelOption[] = (Array.isArray(modelsJson.data) ? modelsJson.data : [])
          .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
          .map((m) => {
            const pricing = (m.pricing ?? {}) as Record<string, unknown>;
            const id = asString(m.id);
            const prompt = Number(pricing.prompt ?? 0);
            const completion = Number(pricing.completion ?? 0);
            return {
              id,
              name: asString(m.name) || id,
              free: isFreePrice(pricing.prompt, pricing.completion, id),
              context: asNumber(m.context_length, 0),
              promptPerMillion: prompt * 1_000_000,
              completionPerMillion: completion * 1_000_000,
              provider: "openrouter" as const,
            };
          })
          .filter((m) => m.id && !m.id.includes("embedding") && !m.id.includes("whisper"));
        models.sort((a, b) => Number(b.free) - Number(a.free) || a.name.localeCompare(b.name));
        return {
          ok: true,
          label: info.data?.label,
          usage: info.data?.usage,
          limit: info.data?.limit ?? null,
          models: models.slice(0, 80),
        };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "OpenRouter probe failed", models: [] };
      }
    }

    try {
      const who = await fetch("https://huggingface.co/api/whoami-v2", {
        headers: { authorization: `Bearer ${key}`, accept: "application/json" },
      });
      if (!who.ok) {
        const body = await who.text().catch(() => "");
        return { ok: false, error: `Hugging Face auth ${who.status} ${body.slice(0, 120)}`, models: [] };
      }
      const me = (await who.json()) as { name?: string; fullname?: string };
      const list = await fetch("https://router.huggingface.co/v1/models", {
        headers: { authorization: `Bearer ${key}`, accept: "application/json" },
      });
      let models: AiModelOption[] = [];
      if (list.ok) {
        const json = (await list.json()) as { data?: unknown[]; object?: string };
        const rows = Array.isArray(json.data) ? json.data : Array.isArray(json) ? (json as unknown[]) : [];
        models = rows
          .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
          .map((m) => {
            const id = asString(m.id);
            return {
              id,
              name: asString(m.id),
              free: true,
              context: asNumber(m.context_length, 0),
              promptPerMillion: 0,
              completionPerMillion: 0,
              provider: "huggingface" as const,
            };
          })
          .filter((m) => m.id);
      }
      if (!models.length) {
        const fallback = await getJson(
          "https://huggingface.co/api/models?pipeline_tag=text-generation&inference=warm&sort=likes&limit=40",
          { headers: { authorization: `Bearer ${key}` } },
          8000,
        ).catch(() => []);
        const rows = Array.isArray(fallback) ? fallback : [];
        models = rows
          .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
          .map((m) => ({
            id: asString(m.id || m.modelId),
            name: asString(m.id || m.modelId),
            free: true,
            context: 0,
            promptPerMillion: 0,
            completionPerMillion: 0,
            provider: "huggingface" as const,
          }))
          .filter((m) => m.id);
      }
      return { ok: true, label: me.name || me.fullname, models: models.slice(0, 60) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Hugging Face probe failed", models: [] };
    }
  });

export const getAiStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { xai: Boolean(process.env.XAI_API_KEY) };
});

interface ChatResult {
  provider: "xai" | "openrouter" | "huggingface";
  model: string;
  text: string;
  parsed: LlmSignal | null;
  error?: string;
  latencyMs: number;
}

async function chatComplete(input: {
  url: string;
  key: string;
  model: string;
  messages: { role: string; content: string }[];
  provider: ChatResult["provider"];
  temperature?: number;
  maxTokens?: number;
}): Promise<ChatResult> {
  const t0 = Date.now();
  try {
    const res = await fetch(input.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.key}`,
      },
      body: JSON.stringify({
        model: input.model,
        temperature: input.temperature ?? 0.1,
        max_tokens: input.maxTokens ?? 700,
        messages: input.messages,
      }),
    });
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        provider: input.provider,
        model: input.model,
        text: "",
        parsed: null,
        error: `${res.status} ${body.slice(0, 160)}`,
        latencyMs,
      };
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    return {
      provider: input.provider,
      model: input.model,
      text,
      parsed: parseLlmSignal(text),
      latencyMs,
    };
  } catch (err) {
    return {
      provider: input.provider,
      model: input.model,
      text: "",
      parsed: null,
      error: err instanceof Error ? err.message : "LLM error",
      latencyMs: Date.now() - t0,
    };
  }
}

export const runAgent = createServerFn({ method: "POST" })
  .validator(
    (input: {
      snapshot: unknown;
      openrouterKey?: string;
      huggingfaceKey?: string;
      openrouterModel?: string;
      huggingfaceModel?: string;
      useXai: boolean;
      useOpenrouter: boolean;
      useHuggingface: boolean;
    }) => input,
  )
  .handler(async ({ data }): Promise<{ results: ChatResult[]; error?: string }> => {
    const payload = JSON.stringify(data.snapshot);
    if (payload.length > 24_000) {
      return { results: [], error: "Snapshot too large" };
    }
    const messages = [
      { role: "system", content: ORCHESTRATOR_PROMPT },
      {
        role: "user",
        content: `SNAPSHOT (authoritative, do not contradict numeric fields):\n${payload}`,
      },
    ];
    const jobs: Promise<ChatResult>[] = [];
    if (data.useXai) {
      const key = process.env.XAI_API_KEY;
      if (!key) {
        jobs.push(
          Promise.resolve({
            provider: "xai",
            model: "grok-4.5",
            text: "",
            parsed: null,
            error: "xAI is not available in this environment",
            latencyMs: 0,
          }),
        );
      } else {
        jobs.push(
          chatComplete({
            url: "https://api.x.ai/v1/chat/completions",
            key,
            model: "grok-4.5",
            messages,
            provider: "xai",
          }),
        );
      }
    }
    if (data.useOpenrouter && data.openrouterKey) {
      jobs.push(
        chatComplete({
          url: "https://openrouter.ai/api/v1/chat/completions",
          key: data.openrouterKey,
          model: data.openrouterModel || "openai/gpt-4o-mini",
          messages,
          provider: "openrouter",
        }),
      );
    }
    if (data.useHuggingface && data.huggingfaceKey) {
      jobs.push(
        chatComplete({
          url: "https://router.huggingface.co/v1/chat/completions",
          key: data.huggingfaceKey,
          model: data.huggingfaceModel || "Qwen/Qwen2.5-72B-Instruct",
          messages,
          provider: "huggingface",
        }),
      );
    }
    if (!jobs.length) return { results: [], error: "No AI provider enabled" };
    const results = await Promise.all(jobs);
    return { results };
  });

const CHAT_SYSTEM = `You are FITSTOCK desk chat — a live Polymarket and crypto trading assistant.
Be concise, numeric, and honest about uncertainty. Use MARKET CONTEXT when provided; do not invent prices, fills, or orders.
You may reason about mispricing, TTL, Binance vs Polymarket, and risk. Never claim you executed a trade.`;

export const chatTurn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      provider: "xai" | "openrouter" | "huggingface";
      messages: { role: "system" | "user" | "assistant"; content: string }[];
      openrouterKey?: string;
      huggingfaceKey?: string;
      openrouterModel?: string;
      huggingfaceModel?: string;
      marketContext?: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const trimmed = data.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-16)
      .map((m) => ({
        role: m.role,
        content: m.content.slice(0, 4000),
      }));
    if (!trimmed.length) return { ok: false as const, error: "Empty conversation", text: "", model: "", latencyMs: 0 };
    const system = data.marketContext
      ? `${CHAT_SYSTEM}\n\nMARKET CONTEXT:\n${data.marketContext.slice(0, 6000)}`
      : CHAT_SYSTEM;
    const messages = [{ role: "system", content: system }, ...trimmed];

    let result: ChatResult;
    if (data.provider === "xai") {
      const key = process.env.XAI_API_KEY;
      if (!key) return { ok: false as const, error: "xAI is not available", text: "", model: "grok-4.5", latencyMs: 0 };
      result = await chatComplete({
        url: "https://api.x.ai/v1/chat/completions",
        key,
        model: "grok-4.5",
        messages,
        provider: "xai",
        temperature: 0.4,
        maxTokens: 900,
      });
    } else if (data.provider === "openrouter") {
      if (!data.openrouterKey) {
        return { ok: false as const, error: "OpenRouter key missing — paste it in Settings", text: "", model: "", latencyMs: 0 };
      }
      result = await chatComplete({
        url: "https://openrouter.ai/api/v1/chat/completions",
        key: data.openrouterKey,
        model: data.openrouterModel || "openai/gpt-4o-mini",
        messages,
        provider: "openrouter",
        temperature: 0.4,
        maxTokens: 900,
      });
    } else {
      if (!data.huggingfaceKey) {
        return { ok: false as const, error: "Hugging Face key missing — paste it in Settings", text: "", model: "", latencyMs: 0 };
      }
      result = await chatComplete({
        url: "https://router.huggingface.co/v1/chat/completions",
        key: data.huggingfaceKey,
        model: data.huggingfaceModel || "Qwen/Qwen2.5-72B-Instruct",
        messages,
        provider: "huggingface",
        temperature: 0.4,
        maxTokens: 900,
      });
    }
    if (result.error) {
      return { ok: false as const, error: result.error, text: "", model: result.model, latencyMs: result.latencyMs };
    }
    return { ok: true as const, text: result.text, model: result.model, latencyMs: result.latencyMs };
  });

const CLOB_ALLOWED = new Set(["clob.polymarket.com"]);

export const clobProxy = createServerFn({ method: "POST" })
  .validator(
    (input: {
      method: "GET" | "POST" | "DELETE";
      path: string;
      body?: string;
      headers: Record<string, string>;
    }) => input,
  )
  .handler(async ({ data }) => {
    if (!data.path.startsWith("/")) throw new Error("Invalid path");
    if (data.path.includes("://") || data.path.includes("..")) throw new Error("Invalid path");
    const url = `${CLOB}${data.path}`;
    const host = new URL(url).host;
    if (!CLOB_ALLOWED.has(host)) throw new Error("Host not allowed");
    const res = await fetch(url, {
      method: data.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...data.headers,
      },
      body: data.method === "GET" ? undefined : data.body,
    });
    const text = await res.text();
    return { status: res.status, body: text.slice(0, 8000) };
  });

export const binanceTime = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const raw = (await binanceJson("/api/v3/time")) as { serverTime?: number };
    return { serverTime: asNumber(raw.serverTime, Date.now()), localTime: Date.now() };
  } catch {
    return { serverTime: Date.now(), localTime: Date.now() };
  }
});
