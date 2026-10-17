import { create } from "zustand";
import {
  CATEGORIES,
  DEFAULT_RISK,
  type AiModelOption,
  type AiProviderConfig,
  type CalibrationBucket,
  type CategorySlug,
  type ClobCreds,
  type CryptoUnit,
  type EnvMode,
  type EventDetail,
  type IntegrationHealth,
  type LogEntry,
  type MobileTab,
  type PolyEventCard,
  type PortfolioSnapshot,
  type PositionFill,
  type ProbeStatus,
  type RiskLimits,
  type SignalRecord,
  type Snapshot,
  type Timeframe,
  type ViewLayer,
} from "./types";
import { uid } from "./parse";

const SETTINGS_KEY = "fitstock.settings.v1";
const FILLS_KEY = "fitstock.fills.v1";
const CAL_KEY = "fitstock.calibration.v1";

export interface SettingsState extends AiProviderConfig {
  risk: RiskLimits;
  autoLlm: boolean;
  llmCooldownSec: number;
}

const DEFAULT_SETTINGS: SettingsState = {
  xai: true,
  openrouter: false,
  huggingface: false,
  openrouterKey: "",
  huggingfaceKey: "",
  openrouterModel: "openai/gpt-4o-mini",
  huggingfaceModel: "Qwen/Qwen2.5-72B-Instruct",
  risk: { ...DEFAULT_RISK },
  autoLlm: false,
  llmCooldownSec: 60,
};

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...(fallback as object), ...(JSON.parse(raw) as object) } as T;
  } catch {
    return fallback;
  }
}

export interface TerminalState {
  mode: EnvMode;
  killSwitch: boolean;
  category: CategorySlug;
  timeframe: Timeframe;
  unit: CryptoUnit;
  query: string;
  events: PolyEventCard[];
  eventsError: string | null;
  eventsAt: number;
  selectedEventId: string | null;
  selectedMarketId: string | null;
  snapshot: Snapshot | null;
  signal: SignalRecord | null;
  fills: PositionFill[];
  log: LogEntry[];
  settings: SettingsState;
  creds: ClobCreds | null;
  wallet: string | null;
  chainId: string | null;
  xaiReady: boolean;
  chartInterval: string;
  showTv: boolean;
  mobileTab: MobileTab;
  layer: ViewLayer;
  lastLlmAt: number;
  llmBusy: boolean;
  feedBusy: boolean;
  calibration: CalibrationBucket[];
  clockSkewMs: number;
  health: IntegrationHealth | null;
  eventDetail: EventDetail | null;
  eventDetailBusy: boolean;
  portfolio: PortfolioSnapshot | null;
  portfolioBusy: boolean;
  collateralUsdc: number | null;
  walletDetected: boolean;
  openrouterStatus: ProbeStatus;
  huggingfaceStatus: ProbeStatus;
  openrouterError: string | null;
  huggingfaceError: string | null;
  openrouterModels: AiModelOption[];
  huggingfaceModels: AiModelOption[];
  setMode: (mode: EnvMode) => void;
  setKill: (on: boolean) => void;
  setFilters: (p: Partial<Pick<TerminalState, "category" | "timeframe" | "unit" | "query">>) => void;
  setEvents: (events: PolyEventCard[], error?: string | null) => void;
  selectMarket: (eventId: string, marketId: string) => void;
  openCampaign: (eventId: string, marketId: string) => void;
  setSnapshot: (snapshot: Snapshot | null) => void;
  setSignal: (signal: SignalRecord | null) => void;
  patchSignal: (patch: Partial<SignalRecord>) => void;
  addFill: (fill: PositionFill) => void;
  pushLog: (level: LogEntry["level"], message: string) => void;
  setSettings: (patch: Partial<SettingsState>) => void;
  setCreds: (creds: ClobCreds | null) => void;
  setWallet: (addr: string | null) => void;
  setChainId: (id: string | null) => void;
  setXai: (ready: boolean) => void;
  setChartInterval: (i: string) => void;
  setShowTv: (v: boolean) => void;
  setMobileTab: (t: MobileTab) => void;
  setLayer: (l: ViewLayer) => void;
  setLlmBusy: (v: boolean) => void;
  setFeedBusy: (v: boolean) => void;
  markLlm: () => void;
  setCalibration: (b: CalibrationBucket[]) => void;
  setClockSkew: (n: number) => void;
  setHealth: (h: IntegrationHealth | null) => void;
  setEventDetail: (d: EventDetail | null) => void;
  setEventDetailBusy: (v: boolean) => void;
  setPortfolio: (p: PortfolioSnapshot | null) => void;
  setPortfolioBusy: (v: boolean) => void;
  setCollateral: (n: number | null) => void;
  setWalletDetected: (v: boolean) => void;
  setAiProbe: (
    provider: "openrouter" | "huggingface",
    patch: { status: ProbeStatus; error?: string | null; models?: AiModelOption[] },
  ) => void;
  hydrate: () => void;
  disconnectWallet: () => void;
  dailyLossUsdc: () => number;
  openExposureUsdc: () => number;
  polyLive: () => boolean;
}

export const useTerminal = create<TerminalState>((set, get) => ({
  mode: "PAPER",
  killSwitch: false,
  category: "crypto",
  timeframe: "7d",
  unit: "ALL",
  query: "",
  events: [],
  eventsError: null,
  eventsAt: 0,
  selectedEventId: null,
  selectedMarketId: null,
  snapshot: null,
  signal: null,
  fills: [],
  log: [],
  settings: DEFAULT_SETTINGS,
  creds: null,
  wallet: null,
  chainId: null,
  xaiReady: false,
  chartInterval: "1m",
  showTv: false,
  mobileTab: "markets",
  layer: "terminal",
  lastLlmAt: 0,
  llmBusy: false,
  feedBusy: false,
  calibration: [],
  clockSkewMs: 0,
  health: null,
  eventDetail: null,
  eventDetailBusy: false,
  portfolio: null,
  portfolioBusy: false,
  collateralUsdc: null,
  walletDetected: false,
  openrouterStatus: "idle",
  huggingfaceStatus: "idle",
  openrouterError: null,
  huggingfaceError: null,
  openrouterModels: [],
  huggingfaceModels: [],
  setMode: (mode) => set({ mode }),
  setKill: (killSwitch) => {
    set({ killSwitch });
    get().pushLog("warn", killSwitch ? "KILL SWITCH ARMED — all execution blocked" : "Kill switch cleared");
  },
  setFilters: (p) => set(p),
  setEvents: (events, error = null) => set({ events, eventsError: error, eventsAt: Date.now() }),
  selectMarket: (eventId, marketId) =>
    set({ selectedEventId: eventId, selectedMarketId: marketId, snapshot: null, signal: null }),
  openCampaign: (eventId, marketId) =>
    set({
      selectedEventId: eventId,
      selectedMarketId: marketId,
      snapshot: null,
      signal: null,
      layer: "campaign",
      mobileTab: "campaign",
    }),
  setSnapshot: (snapshot) => set({ snapshot }),
  setSignal: (signal) => set({ signal }),
  patchSignal: (patch) => {
    const cur = get().signal;
    if (!cur) return;
    set({ signal: { ...cur, ...patch } });
  },
  addFill: (fill) => {
    const fills = [fill, ...get().fills].slice(0, 80);
    set({ fills });
    if (typeof window !== "undefined") localStorage.setItem(FILLS_KEY, JSON.stringify(fills));
  },
  pushLog: (level, message) =>
    set({
      log: [{ id: uid("log"), ts: Date.now(), level, message }, ...get().log].slice(0, 120),
    }),
  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch, risk: { ...get().settings.risk, ...(patch.risk ?? {}) } };
    set({ settings });
    if (typeof window !== "undefined") localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  },
  setCreds: (creds) => {
    set({ creds });
    if (typeof window !== "undefined") {
      if (creds) localStorage.setItem("fitstock.clob.v1", JSON.stringify(creds));
      else localStorage.removeItem("fitstock.clob.v1");
    }
  },
  setWallet: (wallet) => set({ wallet }),
  setChainId: (chainId) => set({ chainId }),
  setXai: (xaiReady) => set({ xaiReady }),
  setChartInterval: (chartInterval) => set({ chartInterval }),
  setShowTv: (showTv) => set({ showTv }),
  setMobileTab: (mobileTab) => {
    const layer: ViewLayer =
      mobileTab === "portfolio"
        ? "portfolio"
        : mobileTab === "campaign"
          ? "campaign"
          : mobileTab === "chat"
            ? "chat"
            : "terminal";
    set({ mobileTab, layer });
  },
  setLayer: (layer) => {
    const mobileTab: MobileTab =
      layer === "portfolio" || layer === "wallet"
        ? "portfolio"
        : layer === "campaign"
          ? "campaign"
          : layer === "chat"
            ? "chat"
            : "terminal";
    set({ layer, mobileTab });
  },
  setLlmBusy: (llmBusy) => set({ llmBusy }),
  setFeedBusy: (feedBusy) => set({ feedBusy }),
  markLlm: () => set({ lastLlmAt: Date.now() }),
  setCalibration: (calibration) => {
    set({ calibration });
    if (typeof window !== "undefined") localStorage.setItem(CAL_KEY, JSON.stringify(calibration));
  },
  setClockSkew: (clockSkewMs) => set({ clockSkewMs }),
  setHealth: (health) => set({ health }),
  setEventDetail: (eventDetail) => set({ eventDetail }),
  setEventDetailBusy: (eventDetailBusy) => set({ eventDetailBusy }),
  setPortfolio: (portfolio) => set({ portfolio }),
  setPortfolioBusy: (portfolioBusy) => set({ portfolioBusy }),
  setCollateral: (collateralUsdc) => set({ collateralUsdc }),
  setWalletDetected: (walletDetected) => set({ walletDetected }),
  setAiProbe: (provider, patch) => {
    if (provider === "openrouter") {
      set({
        openrouterStatus: patch.status,
        openrouterError: patch.error === undefined ? get().openrouterError : patch.error,
        openrouterModels: patch.models ?? get().openrouterModels,
      });
    } else {
      set({
        huggingfaceStatus: patch.status,
        huggingfaceError: patch.error === undefined ? get().huggingfaceError : patch.error,
        huggingfaceModels: patch.models ?? get().huggingfaceModels,
      });
    }
  },
  hydrate: () => {
    const settings = loadJson(SETTINGS_KEY, DEFAULT_SETTINGS);
    const fills = loadJson<PositionFill[]>(FILLS_KEY, []);
    const calibration = loadJson<CalibrationBucket[]>(CAL_KEY, []);
    const creds = loadJson<ClobCreds | null>("fitstock.clob.v1", null);
    set({
      settings: { ...DEFAULT_SETTINGS, ...settings, risk: { ...DEFAULT_RISK, ...settings.risk } },
      fills: Array.isArray(fills) ? fills : [],
      calibration: Array.isArray(calibration) ? calibration : [],
      creds,
      wallet: creds?.address ?? null,
    });
  },
  disconnectWallet: () => {
    set({ wallet: null, creds: null, chainId: null, collateralUsdc: null, portfolio: null });
    if (typeof window !== "undefined") localStorage.removeItem("fitstock.clob.v1");
    get().pushLog("info", "Wallet disconnected · CLOB keys cleared from this browser");
  },
  dailyLossUsdc: () => {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    return get()
      .fills.filter((f) => f.ts >= start.getTime() && f.status === "REJECTED")
      .reduce((a, f) => a + f.usdc * 0, 0);
  },
  openExposureUsdc: () =>
    get()
      .fills.filter((f) => f.status === "PAPER_FILL" || f.status === "LIVE_FILL" || f.status === "LIVE_SUBMITTED")
      .reduce((a, f) => a + f.usdc, 0),
  polyLive: () => {
    const h = get().health;
    return Boolean(h?.gamma.ok && h?.clob.ok);
  },
}));

export { CATEGORIES, DEFAULT_SETTINGS };
