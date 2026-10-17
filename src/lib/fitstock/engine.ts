import { clamp, midpoint } from "./parse";
import { tteSeconds } from "./mapping";
import type {
  BinanceBundle,
  DataQuality,
  FeatureVector,
  MarketMap,
  MispricingResult,
  OrderBook,
  PolyMarket,
  TtlBreakdown,
} from "./types";

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

export function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/** Digital (cash-or-nothing) call probability under zero rates. */
export function digitalCall(spot: number, strike: number, vol: number, tauYears: number): number {
  if (strike <= 0 || spot <= 0) return 0.5;
  if (tauYears <= 1 / (365.25 * 24 * 3600)) return spot >= strike ? 1 : 0;
  const sig = Math.max(vol, 0.05);
  const volT = sig * Math.sqrt(tauYears);
  const d2 = (Math.log(spot / strike) - 0.5 * sig * sig * tauYears) / volT;
  return clamp(normCdf(d2), 0.001, 0.999);
}

function realizedVol(klines: { close: number }[]): number {
  if (klines.length < 8) return 0.5;
  const rets: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    const a = klines[i - 1].close;
    const b = klines[i].close;
    if (a > 0 && b > 0) rets.push(Math.log(b / a));
  }
  const s = stdev(rets);
  // Assume 1m bars when possible; annualize with 525600 minutes/year.
  return clamp(s * Math.sqrt(525_600), 0.1, 3);
}

function pctChange(klines: { close: number }[], bars: number): number {
  if (klines.length < bars + 1) return 0;
  const now = klines[klines.length - 1].close;
  const prev = klines[klines.length - 1 - bars].close;
  if (prev <= 0) return 0;
  return (now - prev) / prev;
}

function volumeDelta(klines: { volume: number }[], window = 5): number {
  if (klines.length < window * 2) return 0;
  const recent = klines.slice(-window).reduce((a, k) => a + k.volume, 0);
  const prev = klines.slice(-window * 2, -window).reduce((a, k) => a + k.volume, 0);
  if (prev <= 0) return 0;
  return clamp((recent - prev) / prev, -1, 3);
}

function bookImbalance(book: { bids: { size: number }[]; asks: { size: number }[] } | null): number {
  if (!book) return 0;
  const bid = book.bids.slice(0, 10).reduce((a, l) => a + l.size, 0);
  const ask = book.asks.slice(0, 10).reduce((a, l) => a + l.size, 0);
  const tot = bid + ask;
  if (tot <= 0) return 0;
  return (bid - ask) / tot;
}

export function assessQuality(input: {
  market: PolyMarket;
  book: OrderBook | null;
  binance: BinanceBundle | null;
  map: MarketMap;
  now?: number;
}): DataQuality {
  const now = input.now ?? Date.now();
  const missing: string[] = [];
  const stale: string[] = [];
  let binanceLatency: number | null = null;
  let polyLatency: number | null = null;

  if (!input.market.clobTokenIds[0]) missing.push("token_yes");
  if (!input.book) missing.push("orderbook");
  else {
    polyLatency = input.book.latencyMs;
    if (now - input.book.receiveTime > 8_000) stale.push("orderbook");
    if (input.book.bids.length === 0 || input.book.asks.length === 0) missing.push("book_depth");
  }
  if (input.map.symbol) {
    if (!input.binance) missing.push("binance");
    else {
      binanceLatency = input.binance.tick.latencyMs;
      if (input.binance.tick.status !== "VALID") stale.push("binance_tick");
      if (now - input.binance.tick.receiveTime > 8_000) stale.push("binance");
    }
  }

  let score = 1;
  score -= missing.length * 0.12;
  score -= stale.length * 0.08;
  if (binanceLatency != null && binanceLatency > 400) score -= 0.06;
  if (polyLatency != null && polyLatency > 600) score -= 0.06;
  if (input.market.liquidityUsdc < 500) score -= 0.1;
  score = clamp(score, 0, 1);

  let status: DataQuality["status"] = "HEALTHY";
  if (missing.includes("orderbook") || (input.map.symbol && missing.includes("binance"))) status = "DOWN";
  else if (score < 0.55 || stale.length > 0) status = "STALE";
  else if (score < 0.85) status = "DEGRADED";

  return {
    status,
    binanceLatencyMs: binanceLatency,
    polymarketLatencyMs: polyLatency,
    missingFields: missing,
    staleFields: stale,
    qualityScore: score,
  };
}

export function buildFeatures(input: {
  market: PolyMarket;
  book: OrderBook | null;
  binance: BinanceBundle | null;
  map: MarketMap;
  quality: DataQuality;
  now?: number;
}): FeatureVector {
  const now = input.now ?? Date.now();
  const tte = tteSeconds(input.market.endDate, now);
  const klines = input.binance?.klines ?? [];
  const d1 = pctChange(klines, 1);
  const d5 = pctChange(klines, 5);
  const vol = realizedVol(klines);
  const vdelta = volumeDelta(klines);
  const imb =
    bookImbalance(input.binance?.depth ?? null) * 0.6 + bookImbalance(input.book) * 0.4;
  const yes = input.market.outcomePrices[0] ?? 0.5;
  const ask = input.market.bestAsk ?? input.book?.asks[0]?.price ?? yes;
  const bid = input.market.bestBid ?? input.book?.bids[0]?.price ?? yes;
  const polySpread = Math.max(0, ask - bid);
  const binSpreadBps = input.binance
    ? ((input.binance.tick.ask - input.binance.tick.bid) / input.binance.tick.price) * 10_000
    : 0;

  const expiryPressure = clamp(1 - tte / (24 * 3600), 0, 1);
  const spreadPenalty = clamp(polySpread / 0.08, 0, 1);
  const liqPenalty = clamp(1 - input.market.liquidityUsdc / 20_000, 0, 1);
  const stalePenalty = 1 - input.quality.qualityScore;
  const momentum = clamp(0.5 + d5 * 12 + d1 * 8, 0, 1);

  return {
    probabilityGap: 0,
    momentumScore: momentum,
    orderbookImbalance: clamp((imb + 1) / 2, 0, 1),
    volumeConfirmation: clamp(0.5 + vdelta / 2, 0, 1),
    expiryPressure,
    spreadPenalty,
    liquidityPenalty: liqPenalty,
    dataStalenessPenalty: clamp(stalePenalty, 0, 1),
    volatility: vol,
    delta1m: d1,
    delta5m: d5,
    volumeDelta: vdelta,
    polySpread,
    binanceSpreadBps: binSpreadBps,
    tteSeconds: tte,
  };
}

export function quantProbability(input: {
  market: PolyMarket;
  binance: BinanceBundle | null;
  map: MarketMap;
  features: FeatureVector;
}): number {
  const { map, binance, features } = input;
  const tauYears = features.tteSeconds / (365.25 * 24 * 3600);
  if (binance && map.symbol && map.kind !== "unknown") {
    const spot = binance.tick.price;
    if (map.kind === "above" && map.strike) {
      return digitalCall(spot, map.strike, features.volatility, tauYears);
    }
    if (map.kind === "below" && map.strike) {
      return 1 - digitalCall(spot, map.strike, features.volatility, tauYears);
    }
    if (map.kind === "up" || map.kind === "down") {
      const ref = binance.tick.openPrice || spot;
      const pUp = digitalCall(spot, ref, features.volatility, tauYears);
      return map.kind === "up" ? pUp : 1 - pUp;
    }
  }
  const implied = input.market.outcomePrices[0] ?? 0.5;
  const tilt = (features.momentumScore - 0.5) * 0.18 + (features.orderbookImbalance - 0.5) * 0.1;
  return clamp(implied + tilt, 0.02, 0.98);
}

export function scoreMispricing(input: {
  market: PolyMarket;
  book: OrderBook | null;
  binance: BinanceBundle | null;
  map: MarketMap;
  features: FeatureVector;
}): MispricingResult {
  const ask = input.market.bestAsk ?? input.book?.asks[0]?.price ?? input.market.outcomePrices[0] ?? 0.5;
  const bid = input.market.bestBid ?? input.book?.bids[0]?.price ?? ask;
  const implied = midpoint(bid, ask, input.market.outcomePrices[0] ?? 0.5);
  const quant = quantProbability(input);
  const rules = clamp(
    quant * 0.7 +
      implied * 0.15 +
      (input.features.momentumScore * 0.1 + input.features.orderbookImbalance * 0.05),
    0.02,
    0.98,
  );
  const executable = ask > 0 ? ask : implied;
  const gap = quant - executable;
  const features: FeatureVector = { ...input.features, probabilityGap: gap };

  const raw =
    1.15 * gap +
    0.22 * (features.momentumScore - 0.5) +
    0.16 * (features.orderbookImbalance - 0.5) +
    0.12 * (features.volumeConfirmation - 0.5) +
    0.1 * features.expiryPressure * Math.sign(gap) -
    0.35 * features.spreadPenalty -
    0.28 * features.liquidityPenalty -
    0.4 * features.dataStalenessPenalty;

  const score = clamp(0.5 + raw, 0, 1);

  return {
    score,
    features,
    quantProbability: quant,
    rulesProbability: rules,
    marketImplied: implied,
    executablePrice: executable,
    edge: quant - executable,
  };
}

export function computeTtl(input: {
  features: FeatureVector;
  quality: DataQuality;
}): TtlBreakdown {
  const volAdj = -Math.round(clamp(input.features.volatility / 0.8, 0, 1) * 4);
  const liqAdj = -Math.round(input.features.liquidityPenalty * 2);
  const lat =
    Math.max(input.quality.binanceLatencyMs ?? 0, input.quality.polymarketLatencyMs ?? 0) > 250
      ? -2
      : -1;
  const base = 10;
  const finalSeconds = clamp(base + volAdj + liqAdj + lat, 3, 20);
  return {
    baseSeconds: base,
    volatilityAdjustment: volAdj,
    liquidityAdjustment: liqAdj,
    latencyAdjustment: lat,
    finalSeconds,
  };
}

export function calibrate(raw: number, buckets: { bucket: string; predicted: number; actual: number; count: number }[]): number {
  if (!buckets.length) {
    // Mild shrinkage toward 0.5 — uncalibrated models overstate conviction.
    return clamp(0.5 + (raw - 0.5) * 0.88, 0.02, 0.98);
  }
  const idx = Math.min(9, Math.max(0, Math.floor(raw * 10)));
  const key = `${(idx / 10).toFixed(2)}-${((idx + 1) / 10).toFixed(2)}`;
  const hit = buckets.find((b) => b.bucket === key);
  if (!hit || hit.count < 8) return clamp(0.5 + (raw - 0.5) * 0.88, 0.02, 0.98);
  const empirical = hit.actual;
  const mixed = 0.55 * empirical + 0.45 * raw;
  return clamp(mixed, 0.02, 0.98);
}

export function modelAgreement(values: number[]): number {
  const xs = values.filter((v) => Number.isFinite(v));
  if (xs.length <= 1) return xs.length ? 1 : 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const disp = stdev(xs);
  return clamp(1 - disp / 0.25, 0, 1) * (mean > 0 ? 1 : 0);
}
