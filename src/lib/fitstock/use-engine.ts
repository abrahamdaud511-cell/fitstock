import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  binanceTime,
  fetchBinance,
  fetchEventDetail,
  fetchEvents,
  fetchMarketBundle,
  fetchPortfolio,
  getAiStatus,
  probeAi,
  probeIntegrations,
  runAgent,
} from "./api";
import { assessQuality, buildFeatures, calibrate, computeTtl, modelAgreement, scoreMispricing } from "./engine";
import { getEthereum, l2Headers } from "./clob";
import { clobProxy } from "./api";
import { mapMarket, eventMatchesTimeframe, marketUnit } from "./mapping";
import { uid } from "./parse";
import { deriveKind, evaluateRisk } from "./risk";
import { useTerminal } from "./store";
import type { PolyEventCard, PolyMarket, SignalRecord, Snapshot } from "./types";

function compactForLlm(snap: Snapshot) {
  return {
    market: {
      question: snap.market.question,
      event: snap.market.eventTitle,
      outcome: "YES",
      odds: snap.mispricing.marketImplied,
      bid: snap.market.bestBid,
      ask: snap.market.bestAsk,
      liquidity_usdc: snap.market.liquidityUsdc,
      expiry: snap.market.endDate,
      tick_size: snap.market.tickSize,
      min_size: snap.market.orderMinSize,
    },
    map: snap.map,
    market_data: snap.binance
      ? {
          symbol: snap.binance.tick.symbol,
          binance_price: snap.binance.tick.price,
          delta_1m: snap.features.delta1m,
          delta_5m: snap.features.delta5m,
          volume_delta: snap.features.volumeDelta,
          volatility: snap.features.volatility,
          orderbook_imbalance: snap.features.orderbookImbalance,
          funding: snap.binance.tick.fundingRate,
        }
      : null,
    probability: {
      quant: snap.mispricing.quantProbability,
      rules: snap.mispricing.rulesProbability,
      market_implied: snap.mispricing.marketImplied,
      edge: snap.mispricing.edge,
    },
    quality: snap.quality,
    ttl: snap.ttl,
    comments: snap.comments.slice(0, 4),
  };
}

export function filterEvents(
  events: PolyEventCard[],
  timeframe: ReturnType<typeof useTerminal.getState>["timeframe"],
  unit: ReturnType<typeof useTerminal.getState>["unit"],
): PolyEventCard[] {
  return events
    .map((ev) => ({
      ...ev,
      markets: ev.markets.filter((m) => {
        if (!eventMatchesTimeframe(m.endDate ?? ev.endDate, timeframe)) return false;
        if (unit === "ALL") return true;
        return marketUnit(m) === unit;
      }),
    }))
    .filter((ev) => ev.markets.length > 0);
}

async function refreshCollateral() {
  const st = useTerminal.getState();
  if (!st.creds) return;
  try {
    const path = "/balance-allowance?asset_type=COLLATERAL&signature_type=0";
    const headers = await l2Headers({
      address: st.creds.address,
      apiKey: st.creds.apiKey,
      secret: st.creds.secret,
      passphrase: st.creds.passphrase,
      method: "GET",
      path,
    });
    const res = await clobProxy({ data: { method: "GET", path, headers } });
    if (res.status >= 200 && res.status < 300) {
      const parsed = JSON.parse(res.body) as { balance?: string; allowance?: string };
      const bal = Number(parsed.balance ?? 0);
      if (Number.isFinite(bal)) st.setCollateral(bal / 1e6 > 1e3 ? bal / 1e6 : bal);
    }
  } catch {
    /* collateral is optional */
  }
}

export function useEngine() {
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    useTerminal.getState().hydrate();
    useTerminal.getState().pushLog("info", "FITSTOCK terminal online — live Polymarket + Binance feeds");
    void getAiStatus().then((s) => useTerminal.getState().setXai(s.xai));
    void binanceTime().then((t) => useTerminal.getState().setClockSkew(t.localTime - t.serverTime));
    const eth = getEthereum();
    useTerminal.getState().setWalletDetected(Boolean(eth));
    if (eth) {
      void eth.request({ method: "eth_accounts" }).then((acc) => {
        const list = acc as string[];
        if (list?.[0]) {
          const st = useTerminal.getState();
          if (!st.wallet) st.setWallet(list[0]);
        }
      });
      void eth.request({ method: "eth_chainId" }).then((id) => {
        if (typeof id === "string") useTerminal.getState().setChainId(id);
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const h = await probeIntegrations();
        if (cancelled) return;
        useTerminal.getState().setHealth(h);
        const st = useTerminal.getState();
        const live = h.gamma.ok && h.clob.ok;
        if (!live) st.pushLog("warn", `Polymarket degraded · gamma ${h.gamma.ok ? "ok" : "down"} · clob ${h.clob.ok ? "ok" : "down"}`);
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 25_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const category = useTerminal((s) => s.category);
  const query = useTerminal((s) => s.query);
  const timeframe = useTerminal((s) => s.timeframe);
  const unit = useTerminal((s) => s.unit);
  const selectedEventId = useTerminal((s) => s.selectedEventId);
  const selectedMarketId = useTerminal((s) => s.selectedMarketId);
  const chartInterval = useTerminal((s) => s.chartInterval);
  const wallet = useTerminal((s) => s.wallet);
  const openrouterKey = useTerminal((s) => s.settings.openrouterKey);
  const huggingfaceKey = useTerminal((s) => s.settings.huggingfaceKey);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await fetchEvents({ data: { category, query, limit: 48 } });
      if (cancelled) return;
      useTerminal.getState().setEvents(res.events, res.error ?? null);
      if (res.error) useTerminal.getState().pushLog("error", `Polymarket feed: ${res.error}`);
      const st = useTerminal.getState();
      const filtered = filterEvents(res.events, st.timeframe, st.unit);
      const pool = filtered.length ? filtered : res.events;
      if (!st.selectedMarketId && pool[0]?.markets[0]) {
        const candidates = pool.flatMap((ev) =>
          ev.markets.map((m) => ({ ev, m, map: mapMarket(m) })),
        );
        const crypto = candidates.filter((c) => c.map.unit);
        const ranked = (crypto.length ? crypto : candidates)
          .slice()
          .sort((a, b) => Math.abs((a.m.outcomePrices[0] ?? 0.5) - 0.5) - Math.abs((b.m.outcomePrices[0] ?? 0.5) - 0.5));
        const pick = ranked[0];
        const ev = pick.ev;
        const m = pick.m;
        st.selectMarket(ev.id, m.id);
        st.pushLog("info", `Locked campaign ${ev.title.slice(0, 64)}`);
      }
    };
    void load();
    const id = setInterval(() => void load(), 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [category, query]);

  useEffect(() => {
    if (!selectedEventId) return;
    let cancelled = false;
    useTerminal.getState().setEventDetailBusy(true);
    void fetchEventDetail({ data: { eventId: selectedEventId } })
      .then((d) => {
        if (!cancelled) useTerminal.getState().setEventDetail(d);
      })
      .catch((err) => {
        if (!cancelled) {
          useTerminal.getState().pushLog("warn", err instanceof Error ? err.message : "Event detail failed");
        }
      })
      .finally(() => {
        if (!cancelled) useTerminal.getState().setEventDetailBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEventId]);

  useEffect(() => {
    if (!wallet) {
      useTerminal.getState().setPortfolio(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      useTerminal.getState().setPortfolioBusy(true);
      try {
        const p = await fetchPortfolio({ data: { address: wallet } });
        if (!cancelled) useTerminal.getState().setPortfolio(p);
        await refreshCollateral();
      } finally {
        if (!cancelled) useTerminal.getState().setPortfolioBusy(false);
      }
    };
    void load();
    const id = setInterval(() => void load(), 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [wallet]);

  useEffect(() => {
    if (!openrouterKey.trim()) {
      useTerminal.getState().setAiProbe("openrouter", { status: "idle", error: null, models: [] });
      return;
    }
    let cancelled = false;
    useTerminal.getState().setAiProbe("openrouter", { status: "checking", error: null });
    const t = setTimeout(() => {
      void probeAi({ data: { provider: "openrouter", key: openrouterKey } }).then((r) => {
        if (cancelled) return;
        useTerminal.getState().setAiProbe("openrouter", {
          status: r.ok ? "ok" : "fail",
          error: r.error ?? null,
          models: r.models,
        });
        if (r.ok) {
          useTerminal.getState().pushLog("info", `OpenRouter live · ${r.models.filter((m) => m.free).length} free models`);
          const st = useTerminal.getState();
          if (!st.settings.openrouter) st.setSettings({ openrouter: true });
        } else {
          useTerminal.getState().pushLog("warn", `OpenRouter: ${r.error}`);
        }
      });
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [openrouterKey]);

  useEffect(() => {
    if (!huggingfaceKey.trim()) {
      useTerminal.getState().setAiProbe("huggingface", { status: "idle", error: null, models: [] });
      return;
    }
    let cancelled = false;
    useTerminal.getState().setAiProbe("huggingface", { status: "checking", error: null });
    const t = setTimeout(() => {
      void probeAi({ data: { provider: "huggingface", key: huggingfaceKey } }).then((r) => {
        if (cancelled) return;
        useTerminal.getState().setAiProbe("huggingface", {
          status: r.ok ? "ok" : "fail",
          error: r.error ?? null,
          models: r.models,
        });
        if (r.ok) {
          useTerminal.getState().pushLog("info", `Hugging Face live · ${r.models.length} models`);
          const st = useTerminal.getState();
          if (!st.settings.huggingface) st.setSettings({ huggingface: true });
        } else {
          useTerminal.getState().pushLog("warn", `Hugging Face: ${r.error}`);
        }
      });
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [huggingfaceKey]);

  useEffect(() => {
    if (!selectedMarketId) return;
    let cancelled = false;
    const tick = async () => {
      const st = useTerminal.getState();
      st.setFeedBusy(true);
      try {
        const bundle = await fetchMarketBundle({
          data: { marketId: selectedMarketId, eventId: selectedEventId ?? undefined },
        });
        if (cancelled) return;
        const market: PolyMarket = {
          ...bundle.market,
          eventId: selectedEventId || bundle.market.eventId,
          eventTitle:
            st.events.find((e) => e.id === selectedEventId)?.title || bundle.market.eventTitle || bundle.market.question,
        };
        const mapped = mapMarket(market);
        let binance = null;
        if (mapped.symbol) {
          try {
            const b = await fetchBinance({
              data: { symbol: mapped.symbol, interval: st.chartInterval, limit: 180 },
            });
            const lastVol = b.klines.at(-1)?.volume ?? 0;
            binance = { ...b, tick: { ...b.tick, volume1m: lastVol } };
          } catch (err) {
            st.pushLog("warn", `Binance feed: ${err instanceof Error ? err.message : "error"}`);
          }
        }
        const quality = assessQuality({ market, book: bundle.bookYes, binance, map: mapped });
        const features = buildFeatures({ market, book: bundle.bookYes, binance, map: mapped, quality });
        const mispricing = scoreMispricing({ market, book: bundle.bookYes, binance, map: mapped, features });
        const ttl = computeTtl({ features, quality });
        const snapshot: Snapshot = {
          market,
          bookYes: bundle.bookYes,
          bookNo: bundle.bookNo,
          historyYes: bundle.historyYes,
          historyNo: bundle.historyNo,
          binance,
          map: mapped,
          comments: bundle.comments,
          quality,
          features,
          mispricing,
          ttl,
          clockSkewMs: st.clockSkewMs,
        };
        st.setSnapshot(snapshot);

        const cal = calibrate(mispricing.quantProbability * 0.62 + mispricing.rulesProbability * 0.38, st.calibration);
        const kind = deriveKind(cal, mispricing.executablePrice, quality);
        const existing = st.signal;
        const stillLive = existing && existing.marketId === market.id && Date.now() < existing.expiresAt;
        if (existing && existing.marketId === market.id && Date.now() >= existing.expiresAt && existing.state !== "EXPIRED") {
          st.patchSignal({ state: "EXPIRED", kind: "HOLD" });
          st.pushLog("warn", "Signal TTL expired — execution locked");
        } else if (!stillLive || existing?.state === "IDLE" || existing?.state === "HOLD" || existing?.state === "EXPIRED") {
          if (kind !== "HOLD" && quality.qualityScore >= 0.7) {
            const rec = makeSignal(snapshot, kind, cal, cal, null, ["QUANT", "RULES"]);
            st.setSignal(rec);
            st.pushLog("signal", `Detected ${kind} edge ${(rec.edge * 100).toFixed(1)}% · TTL ${rec.ttlSeconds}s`);
          } else if (!existing || existing.marketId !== market.id) {
            st.setSignal(makeSignal(snapshot, "HOLD", cal, cal, null, quality.status === "HEALTHY" ? ["NO_EDGE"] : ["DATA_QUALITY"]));
          }
        } else if (existing && (existing.state === "DETECTED" || existing.state === "QUALIFIED")) {
          st.patchSignal({
            edge: cal - mispricing.executablePrice,
            marketImplied: mispricing.marketImplied,
            calibratedProbability: cal,
            dataQuality: quality.qualityScore,
          });
        }

        if (
          st.settings.autoLlm &&
          kind !== "HOLD" &&
          Date.now() - st.lastLlmAt > st.settings.llmCooldownSec * 1000 &&
          !st.llmBusy
        ) {
          void runLlm(snapshot);
        }
      } catch (err) {
        useTerminal.getState().pushLog("error", err instanceof Error ? err.message : "Feed error");
      } finally {
        if (!cancelled) useTerminal.getState().setFeedBusy(false);
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 2500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selectedMarketId, selectedEventId, chartInterval]);

  const events = useTerminal((s) => s.events);
  const visible = useMemo(() => filterEvents(events, timeframe, unit), [events, timeframe, unit]);

  const runLlm = useCallback(async (snap?: Snapshot | null) => {
    const st = useTerminal.getState();
    const snapshot = snap ?? st.snapshot;
    if (!snapshot) return;
    if (st.llmBusy) return;
    st.setLlmBusy(true);
    st.patchSignal({ state: "ANALYZING" });
    st.pushLog("info", "Agent pipeline: orchestrator → market/news/risk fusion");
    try {
      const res = await runAgent({
        data: {
          snapshot: compactForLlm(snapshot),
          useXai: st.settings.xai,
          useOpenrouter: st.settings.openrouter,
          useHuggingface: st.settings.huggingface,
          openrouterKey: st.settings.openrouterKey || undefined,
          huggingfaceKey: st.settings.huggingfaceKey || undefined,
          openrouterModel: st.settings.openrouterModel,
          huggingfaceModel: st.settings.huggingfaceModel,
        },
      });
      st.markLlm();
      if (res.error && !res.results.length) {
        st.pushLog("error", res.error);
        st.patchSignal({ state: "HOLD", llmReason: res.error });
        return;
      }
      for (const r of res.results) {
        st.pushLog(
          r.error ? "warn" : "info",
          `${r.provider}/${r.model} ${r.error ? r.error : `ok ${r.latencyMs}ms p=${r.parsed?.calibrated_probability ?? "—"}`}`,
        );
      }
      const parsed = res.results.map((r) => r.parsed).filter((p): p is NonNullable<typeof p> => !!p);
      const llmVals = parsed.map((p) => p.calibrated_probability).filter((n) => n > 0 && n < 1);
      const llmAvg = llmVals.length ? llmVals.reduce((a, b) => a + b, 0) / llmVals.length : null;
      const quant = snapshot.mispricing.quantProbability;
      const rules = snapshot.mispricing.rulesProbability;
      const ensemble =
        llmAvg != null ? 0.38 * quant + 0.32 * llmAvg + 0.3 * rules : 0.62 * quant + 0.38 * rules;
      const cal = calibrate(ensemble, st.calibration);
      const agree = modelAgreement([quant, rules, llmAvg ?? quant]);
      const kind = deriveKind(cal, snapshot.mispricing.executablePrice, snapshot.quality);
      const reasons = [
        ...new Set(parsed.flatMap((p) => p.reason_codes)),
        "ENSEMBLE",
        llmAvg == null ? "LLM_UNAVAILABLE" : "LLM",
      ];
      const rationale = parsed.map((p) => p.rationale).filter(Boolean)[0] ?? null;
      const rec = makeSignal(snapshot, kind, llmAvg ?? ensemble, cal, rationale, reasons, agree);
      rec.state = kind === "HOLD" || kind === "SKIP" ? "HOLD" : "QUALIFIED";
      st.setSignal(rec);
      st.pushLog(
        "signal",
        `Fusion ${kind} · raw ${(rec.rawProbability * 100).toFixed(1)}% · cal ${(cal * 100).toFixed(1)}% · agree ${(agree * 100).toFixed(0)}%`,
      );
    } catch (err) {
      st.pushLog("error", err instanceof Error ? err.message : "Agent failed");
      st.patchSignal({ state: "HOLD" });
    } finally {
      st.setLlmBusy(false);
    }
  }, []);

  const arm = useCallback(() => {
    const st = useTerminal.getState();
    const snap = st.snapshot;
    const sig = st.signal;
    if (!snap || !sig) return;
    if (st.killSwitch) {
      st.pushLog("error", "Kill switch is armed");
      return;
    }
    if (Date.now() >= sig.expiresAt) {
      st.patchSignal({ state: "EXPIRED" });
      st.pushLog("warn", "TTL expired — cannot arm");
      return;
    }
    const risk = evaluateRisk({
      market: snap.market,
      book: snap.bookYes,
      mispricing: snap.mispricing,
      quality: snap.quality,
      ttl: snap.ttl,
      kind: sig.kind,
      limits: st.settings.risk,
      mode: st.mode,
      killSwitch: st.killSwitch,
      dailyLossUsdc: st.dailyLossUsdc(),
      openExposureUsdc: st.openExposureUsdc(),
      signalCreatedAt: sig.createdAt,
    });
    if (risk.status === "REJECT") {
      st.patchSignal({ state: "REJECTED", reasonCodes: [...sig.reasonCodes, ...risk.reasons] });
      st.pushLog("warn", `Risk gate REJECT ${risk.reasons.join(",")}`);
      return;
    }
    st.patchSignal({
      state: "ARMED",
      suggestedAmountUsdc: risk.suggestedAmountUsdc,
      limitPrice: risk.limitPrice,
      sizeShares: risk.sizeShares,
    });
    st.pushLog("info", `ARMED ${sig.kind} ${risk.sizeShares.toFixed(2)} @ ${risk.limitPrice} · $${risk.suggestedAmountUsdc.toFixed(2)}`);
  }, []);

  return { visible, runLlm, arm };
}

function makeSignal(
  snap: Snapshot,
  kind: SignalRecord["kind"],
  raw: number,
  cal: number,
  rationale: string | null,
  reasons: string[],
  agree = 1,
): SignalRecord {
  const ttl = snap.ttl.finalSeconds;
  return {
    signalId: uid("sig"),
    createdAt: Date.now(),
    expiresAt: Date.now() + ttl * 1000,
    state: kind === "HOLD" || kind === "SKIP" ? "HOLD" : "DETECTED",
    kind,
    marketId: snap.market.id,
    eventId: snap.market.eventId,
    question: snap.market.question,
    outcome: kind === "BUY_NO" ? "NO" : "YES",
    rawProbability: raw,
    calibratedProbability: cal,
    marketImplied: snap.mispricing.marketImplied,
    edge: (kind === "BUY_NO" ? 1 - cal : cal) - snap.mispricing.executablePrice,
    mispricingScore: snap.mispricing.score,
    confidence: snap.quality.qualityScore * agree,
    dataQuality: snap.quality.qualityScore,
    modelAgreement: agree,
    ttlSeconds: ttl,
    reasonCodes: reasons,
    suggestedAmountUsdc: 0,
    limitPrice: snap.mispricing.executablePrice,
    sizeShares: 0,
    llmReason: rationale,
  };
}
