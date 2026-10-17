import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { chatTurn } from "@/lib/fitstock/api";
import { uid } from "@/lib/fitstock/parse";
import { useTerminal } from "@/lib/fitstock/store";
import { cn } from "@/lib/utils";

type Provider = "xai" | "openrouter" | "huggingface";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider?: Provider;
  model?: string;
  ts: number;
}

const CHAT_KEY = "fitstock.chat.v1";

function loadChat(): ChatMsg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMsg[];
    return Array.isArray(parsed) ? parsed.slice(-80) : [];
  } catch {
    return [];
  }
}

export function ChatDashboard({ onBack }: { onBack: () => void }) {
  const settings = useTerminal((s) => s.settings);
  const xai = useTerminal((s) => s.xaiReady);
  const orOk = useTerminal((s) => s.openrouterStatus === "ok");
  const hfOk = useTerminal((s) => s.huggingfaceStatus === "ok");
  const snap = useTerminal((s) => s.snapshot);
  const signal = useTerminal((s) => s.signal);

  const live: { id: Provider; label: string; ready: boolean; model: string }[] = [
    { id: "xai", label: "Grok 4.5", ready: xai && settings.xai, model: "grok-4.5" },
    {
      id: "openrouter",
      label: "OpenRouter",
      ready: Boolean(settings.openrouterKey) && (orOk || settings.openrouter),
      model: settings.openrouterModel,
    },
    {
      id: "huggingface",
      label: "Hugging Face",
      ready: Boolean(settings.huggingfaceKey) && (hfOk || settings.huggingface),
      model: settings.huggingfaceModel,
    },
  ];

  const firstReady = live.find((p) => p.ready)?.id ?? "xai";
  const [provider, setProvider] = useState<Provider>(firstReady);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [useMarket, setUseMarket] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(loadChat());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-80)));
  }, [messages, hydrated]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    const current = live.find((p) => p.id === provider);
    if (current?.ready) return;
    const next = live.find((p) => p.ready);
    if (next) setProvider(next.id);
  }, [xai, settings.xai, settings.openrouterKey, settings.huggingfaceKey, settings.openrouter, settings.huggingface]);

  const active = live.find((p) => p.id === provider);
  const canSend = Boolean(active?.ready) && draft.trim().length > 0 && !busy;

  const context = useMemo(() => {
    if (!useMarket || !snap) return undefined;
    return JSON.stringify({
      market: snap.market.question,
      event: snap.market.eventTitle,
      implied: snap.mispricing.marketImplied,
      quant: snap.mispricing.quantProbability,
      edge: snap.mispricing.edge,
      ttl: snap.ttl.finalSeconds,
      quality: snap.quality.qualityScore,
      binance: snap.binance
        ? {
            symbol: snap.binance.tick.symbol,
            price: snap.binance.tick.price,
            change24h: snap.binance.tick.change24hPct,
          }
        : null,
      signal: signal
        ? { kind: signal.kind, state: signal.state, cal: signal.calibratedProbability, edge: signal.edge }
        : null,
    });
  }, [useMarket, snap, signal]);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    if (!active?.ready) {
      toast.error("No live API for this provider — paste a key in Settings");
      return;
    }
    const user: ChatMsg = { id: uid("chat"), role: "user", content: text, ts: Date.now() };
    const next = [...messages, user];
    setMessages(next);
    setDraft("");
    setBusy(true);
    try {
      const res = await chatTurn({
        data: {
          provider,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          openrouterKey: settings.openrouterKey || undefined,
          huggingfaceKey: settings.huggingfaceKey || undefined,
          openrouterModel: settings.openrouterModel,
          huggingfaceModel: settings.huggingfaceModel,
          marketContext: context,
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        setMessages((cur) => [
          ...cur,
          {
            id: uid("chat"),
            role: "assistant",
            content: `Error: ${res.error}`,
            provider,
            model: res.model,
            ts: Date.now(),
          },
        ]);
        return;
      }
      setMessages((cur) => [
        ...cur,
        {
          id: uid("chat"),
          role: "assistant",
          content: res.text || "(empty reply)",
          provider,
          model: res.model,
          ts: Date.now(),
        },
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back" className="size-9">
          <ArrowLeft className="size-4" />
        </Button>
        <h2 className="font-sans text-sm font-medium">AI Chat</h2>
        <span className="hidden truncate text-[10px] tracking-widest text-muted sm:inline">
          {active?.ready ? active.model : "no live key"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-9"
          aria-label="Clear chat"
          onClick={() => {
            setMessages([]);
            localStorage.removeItem(CHAT_KEY);
          }}
        >
          <Trash2 className="size-4 text-muted" />
        </Button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border px-2 py-2">
        {live.map((p) => (
          <button
            key={p.id}
            onClick={() => setProvider(p.id)}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-2.5 text-[10px] tracking-widest",
              provider === p.id ? "bg-accent text-bg" : "bg-surface-2 text-muted hover:text-fg",
            )}
          >
            <span className={cn("size-1.5 rounded-full", p.ready ? "bg-accent" : "bg-danger", provider === p.id && p.ready && "bg-bg")} />
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setUseMarket((v) => !v)}
          className={cn(
            "ml-auto h-8 shrink-0 rounded-sm px-2 text-[10px] tracking-widest",
            useMarket ? "text-accent" : "text-muted",
          )}
        >
          {useMarket ? "CTX ON" : "CTX OFF"}
        </button>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          {!messages.length ? (
            <div className="rounded-md border border-border bg-surface p-4 text-[12px] leading-relaxed text-muted">
              Chat uses the keys already in Settings. Grok is the app owner key. OpenRouter and Hugging Face use the keys
              you pasted — live models from the probe are used. CTX ON attaches the locked campaign snapshot.
            </div>
          ) : null}
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn("max-w-[92%] rounded-md px-3 py-2 text-[13px] leading-relaxed", m.role === "user" ? "ml-auto bg-accent-dim text-fg" : "bg-surface-2 text-fg")}
            >
              {m.role === "assistant" && m.model ? (
                <div className="mb-1 text-[9px] tracking-widest text-muted">
                  {m.provider} · {m.model}
                </div>
              ) : null}
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}
          {busy ? (
            <div className="flex items-center gap-2 text-[12px] text-accent">
              <Loader2 className="size-3.5 animate-spin" />
              Thinking…
            </div>
          ) : null}
        </div>
      </div>

      <form
        className="shrink-0 border-t border-border p-2 sm:p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder={active?.ready ? "Ask the desk…" : "Enable a provider in Settings"}
            className="min-h-11 flex-1 resize-none rounded-sm bg-surface-2 px-3 py-2 text-sm text-fg outline-none ring-1 ring-border focus:ring-accent"
          />
          <Button type="submit" disabled={!canSend} className="h-11 w-11 shrink-0 p-0" aria-label="Send">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
        {!live.some((p) => p.ready) ? (
          <p className="mx-auto mt-2 max-w-3xl text-[11px] text-warn">
            No live API. Turn on Grok or paste an OpenRouter / Hugging Face key in Settings.
          </p>
        ) : null}
      </form>
    </div>
  );
}
