export type EnvMode = "PAPER" | "LIVE";
export type SignalKind = "BUY_YES" | "BUY_NO" | "HOLD" | "SKIP";
export type FeedStatus = "HEALTHY" | "DEGRADED" | "STALE" | "DOWN";
export type SignalState =
  | "IDLE"
  | "DETECTED"
  | "VALIDATING"
  | "ANALYZING"
  | "QUALIFIED"
  | "ARMED"
  | "EXECUTION_PENDING"
  | "SUBMITTED"
  | "PARTIAL_FILL"
  | "FILLED"
  | "CANCELLED"
  | "REJECTED"
  | "EXPIRED"
  | "HOLD";

export type ViewLayer = "terminal" | "campaign" | "portfolio" | "wallet" | "chat";
export type MobileTab = "markets" | "campaign" | "terminal" | "portfolio" | "chat";
export type PortfolioFilter = "all" | "positions" | "history" | "trading" | "deposits";
export type ProbeStatus = "idle" | "checking" | "ok" | "fail";

export type CategorySlug =
  | "all"
  | "crypto"
  | "politics"
  | "sports"
  | "pop-culture"
  | "finance"
  | "science"
  | "tech"
  | "geopolitics"
  | "mentions";

export type Timeframe = "1h" | "6h" | "24h" | "7d" | "30d" | "all";

export const CATEGORIES: { slug: CategorySlug; label: string }[] = [
  { slug: "all", label: "ALL" },
  { slug: "crypto", label: "CRYPTO" },
  { slug: "politics", label: "POLITICS" },
  { slug: "sports", label: "SPORTS" },
  { slug: "finance", label: "FINANCE" },
  { slug: "geopolitics", label: "GEO" },
  { slug: "tech", label: "TECH" },
  { slug: "science", label: "SCIENCE" },
  { slug: "pop-culture", label: "CULTURE" },
  { slug: "mentions", label: "MENTIONS" },
];

export const TIMEFRAMES: { id: Timeframe; label: string }[] = [
  { id: "1h", label: "1H" },
  { id: "6h", label: "6H" },
  { id: "24h", label: "24H" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
  { id: "all", label: "ALL" },
];

export const CRYPTO_UNITS = [
  "ALL",
  "BTC",
  "ETH",
  "SOL",
  "XRP",
  "DOGE",
  "BNB",
  "ADA",
  "AVAX",
  "LINK",
] as const;

export type CryptoUnit = (typeof CRYPTO_UNITS)[number];

export interface PolyTag {
  id: string;
  label: string;
  slug: string;
}

export interface PolyMarket {
  id: string;
  eventId: string;
  eventTitle: string;
  question: string;
  slug: string;
  conditionId: string;
  endDate: string | null;
  startDate: string | null;
  image: string | null;
  description: string;
  outcomes: string[];
  outcomePrices: number[];
  clobTokenIds: string[];
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  liquidityUsdc: number;
  volume: number;
  volume24hr: number;
  orderMinSize: number;
  tickSize: number;
  enableOrderBook: boolean;
  negRisk: boolean;
  groupItemTitle: string | null;
  tags: PolyTag[];
}

export interface PolyEventCard {
  id: string;
  title: string;
  slug: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  image: string | null;
  resolutionSource: string | null;
  seriesSlug: string | null;
  commentCount: number;
  liquidityUsdc: number;
  volume: number;
  volume24hr: number;
  tags: PolyTag[];
  markets: PolyMarket[];
}

export interface SeriesWindow {
  id: string;
  marketId: string;
  title: string;
  start: string | null;
  end: string | null;
  yes: number;
  closed: boolean;
}

export interface EventDetail {
  event: PolyEventCard;
  related: PolyEventCard[];
  windows: SeriesWindow[];
}

export interface BookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  tokenId: string;
  tickSize: number;
  minOrderSize: number;
  bids: BookLevel[];
  asks: BookLevel[];
  latencyMs: number;
  eventTime: number;
  receiveTime: number;
}

export interface PricePoint {
  t: number;
  p: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BinanceTick {
  source: "binance";
  symbol: string;
  eventTime: number;
  receiveTime: number;
  latencyMs: number;
  price: number;
  bid: number;
  ask: number;
  bidQty: number;
  askQty: number;
  volume1m: number;
  volume24h: number;
  change24hPct: number;
  high24h: number;
  low24h: number;
  openPrice: number;
  fundingRate: number | null;
  markPrice: number | null;
  status: "VALID" | "STALE" | "INVALID";
}

export interface BinanceDepth {
  bids: BookLevel[];
  asks: BookLevel[];
}

export interface BinanceBundle {
  tick: BinanceTick;
  klines: Candle[];
  depth: BinanceDepth;
  interval: string;
}

export interface MarketMap {
  unit: Exclude<CryptoUnit, "ALL"> | null;
  symbol: string | null;
  strike: number | null;
  kind: "above" | "below" | "up" | "down" | "unknown";
  tradingView: string | null;
}

export interface FeatureVector {
  probabilityGap: number;
  momentumScore: number;
  orderbookImbalance: number;
  volumeConfirmation: number;
  expiryPressure: number;
  spreadPenalty: number;
  liquidityPenalty: number;
  dataStalenessPenalty: number;
  volatility: number;
  delta1m: number;
  delta5m: number;
  volumeDelta: number;
  polySpread: number;
  binanceSpreadBps: number;
  tteSeconds: number;
}

export interface DataQuality {
  status: FeedStatus;
  binanceLatencyMs: number | null;
  polymarketLatencyMs: number | null;
  missingFields: string[];
  staleFields: string[];
  qualityScore: number;
}

export interface TtlBreakdown {
  baseSeconds: number;
  volatilityAdjustment: number;
  liquidityAdjustment: number;
  latencyAdjustment: number;
  finalSeconds: number;
}

export interface MispricingResult {
  score: number;
  features: FeatureVector;
  quantProbability: number;
  rulesProbability: number;
  marketImplied: number;
  executablePrice: number;
  edge: number;
}

export interface EnsembleResult {
  models: {
    quant: number;
    llm: number | null;
    rules: number;
  };
  ensembleProbability: number;
  calibratedProbability: number;
  modelAgreement: number;
}

export interface RiskLimits {
  minOrderUsdc: number;
  maxOrderUsdc: number;
  maxPositionUsdc: number;
  maxDailyLossUsdc: number;
  maxSlippageBps: number;
}

export const DEFAULT_RISK: RiskLimits = {
  minOrderUsdc: 1,
  maxOrderUsdc: 10,
  maxPositionUsdc: 25,
  maxDailyLossUsdc: 5,
  maxSlippageBps: 200,
};

export interface RiskDecision {
  status: "PASS" | "REJECT";
  reasons: string[];
  suggestedAmountUsdc: number;
  slippageBps: number;
  tickSize: number;
  minSize: number;
  sizeShares: number;
  limitPrice: number;
}

export interface SignalRecord {
  signalId: string;
  createdAt: number;
  expiresAt: number;
  state: SignalState;
  kind: SignalKind;
  marketId: string;
  eventId: string;
  question: string;
  outcome: "YES" | "NO";
  rawProbability: number;
  calibratedProbability: number;
  marketImplied: number;
  edge: number;
  mispricingScore: number;
  confidence: number;
  dataQuality: number;
  modelAgreement: number;
  ttlSeconds: number;
  reasonCodes: string[];
  suggestedAmountUsdc: number;
  limitPrice: number;
  sizeShares: number;
  llmReason: string | null;
}

export interface LogEntry {
  id: string;
  ts: number;
  level: "info" | "warn" | "error" | "signal";
  message: string;
}

export interface AiProviderConfig {
  xai: boolean;
  openrouter: boolean;
  huggingface: boolean;
  openrouterKey: string;
  huggingfaceKey: string;
  openrouterModel: string;
  huggingfaceModel: string;
}

export interface AiModelOption {
  id: string;
  name: string;
  free: boolean;
  context: number;
  promptPerMillion: number;
  completionPerMillion: number;
  provider: "openrouter" | "huggingface";
}

export interface AiProbeResult {
  ok: boolean;
  error?: string;
  label?: string;
  usage?: number;
  limit?: number | null;
  models: AiModelOption[];
}

export interface FeedProbe {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface IntegrationHealth {
  gamma: FeedProbe;
  clob: FeedProbe;
  data: FeedProbe;
  binance: FeedProbe;
  checkedAt: number;
}

export interface ClobCreds {
  address: string;
  apiKey: string;
  secret: string;
  passphrase: string;
}

export interface PositionFill {
  id: string;
  ts: number;
  marketId: string;
  question: string;
  side: "YES" | "NO";
  price: number;
  sizeShares: number;
  usdc: number;
  mode: EnvMode;
  status: "PAPER_FILL" | "LIVE_SUBMITTED" | "LIVE_FILL" | "REJECTED";
  orderId: string | null;
}

export interface PolyPosition {
  title: string;
  outcome: string;
  size: number;
  avgPrice: number;
  currentPrice: number;
  currentValue: number;
  cashPnl: number;
  realizedPnl: number;
  percentPnl: number;
  icon: string | null;
  slug: string;
  eventSlug: string;
  eventId: string;
  endDate: string | null;
  status: string;
  conditionId: string;
  redeemable: boolean;
}

export interface PolyTradeRow {
  title: string;
  outcome: string;
  side: string;
  size: number;
  price: number;
  usdc: number;
  timestamp: number;
  slug: string;
  transactionHash: string | null;
}

export interface PortfolioSnapshot {
  valueUsdc: number;
  collateralUsdc: number | null;
  positions: PolyPosition[];
  closed: PolyPosition[];
  trades: PolyTradeRow[];
  fetchedAt: number;
  error?: string;
}

export interface CommentItem {
  body: string;
  name: string | null;
  createdAt: string | null;
}

export interface CalibrationBucket {
  bucket: string;
  predicted: number;
  actual: number;
  count: number;
}

export interface Snapshot {
  market: PolyMarket;
  bookYes: OrderBook | null;
  bookNo: OrderBook | null;
  historyYes: PricePoint[];
  historyNo: PricePoint[];
  binance: BinanceBundle | null;
  map: MarketMap;
  comments: CommentItem[];
  quality: DataQuality;
  features: FeatureVector;
  mispricing: MispricingResult;
  ttl: TtlBreakdown;
  clockSkewMs: number;
}
