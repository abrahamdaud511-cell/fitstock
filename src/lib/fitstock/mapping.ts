import type { CryptoUnit, MarketMap, PolyMarket, Timeframe } from "./types";

interface AssetDef {
  unit: Exclude<CryptoUnit, "ALL">;
  symbol: string;
  aliases: string[];
}

const ASSETS: AssetDef[] = [
  { unit: "BTC", symbol: "BTCUSDT", aliases: ["bitcoin", "btc", "xbt"] },
  { unit: "ETH", symbol: "ETHUSDT", aliases: ["ethereum", "ether", "eth"] },
  { unit: "SOL", symbol: "SOLUSDT", aliases: ["solana", "sol"] },
  { unit: "XRP", symbol: "XRPUSDT", aliases: ["ripple", "xrp"] },
  { unit: "DOGE", symbol: "DOGEUSDT", aliases: ["dogecoin", "doge"] },
  { unit: "BNB", symbol: "BNBUSDT", aliases: ["bnb", "binance coin"] },
  { unit: "ADA", symbol: "ADAUSDT", aliases: ["cardano", "ada"] },
  { unit: "AVAX", symbol: "AVAXUSDT", aliases: ["avalanche", "avax"] },
  { unit: "LINK", symbol: "LINKUSDT", aliases: ["chainlink", "link"] },
];

function parseStrike(text: string): number | null {
  const compact = text.replace(/,/g, "");
  const tagged = compact.match(
    /\$?\s*([0-9]+(?:\.[0-9]+)?)\s*(k|m|b)\b/i,
  );
  if (tagged) {
    const n = Number(tagged[1]);
    const suf = tagged[2].toLowerCase();
    const mul = suf === "k" ? 1_000 : suf === "m" ? 1_000_000 : 1_000_000_000;
    return n * mul;
  }
  const dollar = compact.match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);
  if (dollar) return Number(dollar[1]);
  return null;
}

function detectKind(text: string): MarketMap["kind"] {
  const t = text.toLowerCase();
  if (/\b(below|under|less than|drop(?:s|ping)? below|fall(?:s|ing)? below)\b/.test(t)) {
    return "below";
  }
  if (/\b(above|exceed|over|reach|hit|at least|greater than)\b/.test(t)) {
    return "above";
  }
  if (/\b(up or down|close up|finish up|green day|end up)\b/.test(t) || /\bup\b/.test(t)) {
    if (/\bdown\b/.test(t) && /\bup\b/.test(t)) return "up";
    if (/\bup\b/.test(t)) return "up";
  }
  if (/\b(down day|finish down|close down)\b/.test(t)) return "down";
  return "unknown";
}

export function mapMarket(market: PolyMarket): MarketMap {
  const hay = `${market.eventTitle} ${market.question} ${market.groupItemTitle ?? ""} ${market.tags.map((t) => t.label).join(" ")}`.toLowerCase();
  const asset = ASSETS.find((a) => a.aliases.some((al) => new RegExp(`\\b${al}\\b`, "i").test(hay)));
  if (!asset) {
    return { unit: null, symbol: null, strike: null, kind: "unknown", tradingView: null };
  }
  return {
    unit: asset.unit,
    symbol: asset.symbol,
    strike: parseStrike(`${market.question} ${market.groupItemTitle ?? ""}`),
    kind: detectKind(hay),
    tradingView: `BINANCE:${asset.symbol}`,
  };
}

export function marketUnit(market: PolyMarket): CryptoUnit | "OTHER" {
  return mapMarket(market).unit ?? "OTHER";
}

export function eventMatchesTimeframe(endDate: string | null, tf: Timeframe, now = Date.now()): boolean {
  if (tf === "all") return true;
  if (!endDate) return false;
  const end = Date.parse(endDate);
  if (!Number.isFinite(end)) return false;
  const remaining = end - now;
  if (remaining < 0) return false;
  const hours = remaining / 3_600_000;
  if (tf === "1h") return hours <= 1;
  if (tf === "6h") return hours <= 6;
  if (tf === "24h") return hours <= 24;
  if (tf === "7d") return hours <= 24 * 7;
  if (tf === "30d") return hours <= 24 * 30;
  return true;
}

export function tteSeconds(endDate: string | null, now = Date.now()): number {
  if (!endDate) return Number.POSITIVE_INFINITY;
  const end = Date.parse(endDate);
  if (!Number.isFinite(end)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (end - now) / 1000);
}
