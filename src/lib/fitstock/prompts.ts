export const ORCHESTRATOR_PROMPT = `You are the intelligence orchestration layer of FITSTOCK.
You analyze structured market data supplied by deterministic services.
You do NOT invent market data.
You do NOT fabricate probabilities, prices, liquidity, timestamps, news, or execution status.

PRIMARY OBJECTIVE
Evaluate whether the supplied Polymarket market snapshot contains a statistically meaningful discrepancy relative to the supplied reference-market data.

CORE PRINCIPLE
The AI is an analysis component, NOT the source of truth.
Authoritative values (price, bid/ask, liquidity, timestamps, expiry, balances, order status) come from system services.
NEVER invent missing values.

If data is missing, stale, contradictory, delayed, malformed, or insufficient:
signal = HOLD, reason_codes includes DATA_INVALID.

ANALYSIS
1. Validate market context, timestamps, liquidity.
2. Analyze momentum, orderbook imbalance, volume, volatility, time-to-expiry.
3. Evaluate probability discrepancy versus executable market price.
4. Penalize wide spread, low liquidity, high latency, conflicting features.
5. Do not convert a weak signal into a trade because expiry is close.

SIGNAL TYPES: BUY_YES | BUY_NO | HOLD | SKIP

Separate: raw_probability, calibrated_probability, model_confidence, data_quality.

Return JSON only. No markdown. No conversational text.
Schema:
{
  "signal": "BUY_YES | BUY_NO | HOLD | SKIP",
  "raw_probability": 0.0,
  "calibrated_probability": 0.0,
  "market_probability": 0.0,
  "edge": 0.0,
  "data_quality": 0.0,
  "model_agreement": 0.0,
  "model_confidence": 0.0,
  "reason_codes": ["CODE"],
  "ttl_seconds": 0,
  "rationale": "one short sentence"
}`;

export interface LlmSignal {
  signal: "BUY_YES" | "BUY_NO" | "HOLD" | "SKIP";
  raw_probability: number;
  calibrated_probability: number;
  market_probability: number;
  edge: number;
  data_quality: number;
  model_agreement: number;
  model_confidence: number;
  reason_codes: string[];
  ttl_seconds: number;
  rationale: string;
}

export function extractJson(text: string): unknown | null {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function num(v: unknown, fb = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fb;
}

export function parseLlmSignal(text: string): LlmSignal | null {
  const raw = extractJson(text);
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const signal = String(o.signal ?? "HOLD").toUpperCase();
  const kind =
    signal === "BUY_YES" || signal === "BUY_NO" || signal === "SKIP" || signal === "HOLD"
      ? signal
      : "HOLD";
  const reasons = Array.isArray(o.reason_codes)
    ? o.reason_codes.map((x) => String(x)).slice(0, 8)
    : [];
  return {
    signal: kind,
    raw_probability: num(o.raw_probability, num(o.calibrated_probability, 0.5)),
    calibrated_probability: num(o.calibrated_probability, num(o.raw_probability, 0.5)),
    market_probability: num(o.market_probability, 0),
    edge: num(o.edge, 0),
    data_quality: num(o.data_quality, 0),
    model_agreement: num(o.model_agreement, 0),
    model_confidence: num(o.model_confidence, 0.5),
    reason_codes: reasons,
    ttl_seconds: Math.round(num(o.ttl_seconds, 8)),
    rationale: String(o.rationale ?? "").slice(0, 280),
  };
}
