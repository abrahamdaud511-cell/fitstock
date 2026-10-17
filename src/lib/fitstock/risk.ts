import { clamp, roundToTick } from "./parse";
import type {
  DataQuality,
  EnvMode,
  MispricingResult,
  OrderBook,
  PolyMarket,
  RiskDecision,
  RiskLimits,
  SignalKind,
  SignalRecord,
  TtlBreakdown,
} from "./types";

export function evaluateRisk(input: {
  market: PolyMarket;
  book: OrderBook | null;
  mispricing: MispricingResult;
  quality: DataQuality;
  ttl: TtlBreakdown;
  kind: SignalKind;
  limits: RiskLimits;
  mode: EnvMode;
  killSwitch: boolean;
  dailyLossUsdc: number;
  openExposureUsdc: number;
  signalCreatedAt: number;
  now?: number;
}): RiskDecision {
  const now = input.now ?? Date.now();
  const reasons: string[] = [];
  const tick = input.book?.tickSize || input.market.tickSize || 0.01;
  const minSize = input.book?.minOrderSize || input.market.orderMinSize || 5;
  const asks = input.book?.asks ?? [];
  const bids = input.book?.bids ?? [];
  const bestAsk = asks[0]?.price ?? input.market.bestAsk ?? input.mispricing.executablePrice;
  const bestBid = bids[0]?.price ?? input.market.bestBid ?? bestAsk;
  const buy = input.kind === "BUY_YES" || input.kind === "BUY_NO";
  const limitPrice = roundToTick(buy ? bestAsk : bestBid, tick);
  const spread = Math.max(0, bestAsk - bestBid);
  const mid = (bestAsk + bestBid) / 2 || limitPrice;
  const slippageBps = mid > 0 ? (spread / mid) * 10_000 : 10_000;

  if (input.killSwitch) reasons.push("KILL_SWITCH");
  if (!input.market.enableOrderBook) reasons.push("MARKET_NOT_CLOB");
  if (input.kind === "HOLD" || input.kind === "SKIP") reasons.push("NO_TRADE_SIGNAL");
  if (input.quality.status === "DOWN" || input.quality.status === "STALE") reasons.push("DATA_STALE");
  if (input.quality.qualityScore < 0.7) reasons.push("DATA_QUALITY");
  if (!Number.isFinite(limitPrice) || limitPrice <= 0 || limitPrice >= 1) reasons.push("PRICE_INVALID");
  if (slippageBps > input.limits.maxSlippageBps) reasons.push("SLIPPAGE");
  if (input.market.liquidityUsdc < 250) reasons.push("LIQUIDITY");
  if (now - input.signalCreatedAt > input.ttl.finalSeconds * 1000) reasons.push("TTL_EXPIRED");
  if (input.dailyLossUsdc >= input.limits.maxDailyLossUsdc) reasons.push("DAILY_LOSS_LIMIT");
  if (!buy) {
    /* HOLD/SKIP already flagged */
  }

  const edge = Math.abs(input.mispricing.edge);
  const rawUsdc = clamp(
    input.limits.minOrderUsdc + edge * 18,
    input.limits.minOrderUsdc,
    input.limits.maxOrderUsdc,
  );
  let amount = rawUsdc;
  if (input.openExposureUsdc + amount > input.limits.maxPositionUsdc) {
    amount = Math.max(0, input.limits.maxPositionUsdc - input.openExposureUsdc);
    if (amount < input.limits.minOrderUsdc) reasons.push("POSITION_LIMIT");
  }

  const px = Math.max(limitPrice, tick);
  let sizeShares = amount / px;
  if (sizeShares < minSize) {
    const needed = minSize * px;
    if (needed > input.limits.maxOrderUsdc) reasons.push("MIN_SIZE_EXCEEDS_MAX");
    else if (needed < input.limits.minOrderUsdc * 0.5) reasons.push("SIZE_INVALID");
    else {
      amount = needed;
      sizeShares = minSize;
    }
  }

  if (input.mode === "LIVE" && reasons.includes("KILL_SWITCH")) {
    /* already */
  }

  const unique = [...new Set(reasons)];
  return {
    status: unique.length ? "REJECT" : "PASS",
    reasons: unique,
    suggestedAmountUsdc: Number(amount.toFixed(2)),
    slippageBps: Number(slippageBps.toFixed(1)),
    tickSize: tick,
    minSize,
    sizeShares: Number(sizeShares.toFixed(4)),
    limitPrice: px,
  };
}

export function deriveKind(calibrated: number, executableYes: number, quality: DataQuality): SignalKind {
  if (quality.status === "DOWN" || quality.status === "STALE" || quality.qualityScore < 0.62) {
    return "HOLD";
  }
  const edgeYes = calibrated - executableYes;
  const execNo = 1 - executableYes;
  const edgeNo = 1 - calibrated - execNo;
  if (edgeYes >= 0.06 && calibrated >= 0.55) return "BUY_YES";
  if (edgeNo >= 0.06 && calibrated <= 0.45) return "BUY_NO";
  return "HOLD";
}

export function isLiveSignal(signal: SignalRecord, now = Date.now()): boolean {
  return now < signal.expiresAt && signal.state !== "EXPIRED" && signal.state !== "CANCELLED";
}
