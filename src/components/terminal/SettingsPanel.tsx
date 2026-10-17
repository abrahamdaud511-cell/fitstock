import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTerminal } from "@/lib/fitstock/store";
import type { AiModelOption, ProbeStatus } from "@/lib/fitstock/types";
import { cn } from "@/lib/utils";

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useTerminal((s) => s.settings);
  const setSettings = useTerminal((s) => s.setSettings);
  const xai = useTerminal((s) => s.xaiReady);
  const orStatus = useTerminal((s) => s.openrouterStatus);
  const hfStatus = useTerminal((s) => s.huggingfaceStatus);
  const orError = useTerminal((s) => s.openrouterError);
  const hfError = useTerminal((s) => s.huggingfaceError);
  const orModels = useTerminal((s) => s.openrouterModels);
  const hfModels = useTerminal((s) => s.huggingfaceModels);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 p-3 sm:items-center">
      <div
        role="dialog"
        aria-labelledby="settings-title"
        className="panel max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-lg bg-surface p-4 shadow-[0_0_0_1px_var(--color-border-strong)]"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="settings-title" className="font-sans text-base font-semibold tracking-wide">
            Providers & risk
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
        <p className="mb-4 text-[12px] leading-relaxed text-muted">
          Paste a key — status is probed live. Free models are selectable immediately. Keys stay in this browser. Grok
          uses the app owner key. Live trading signs in your wallet.
        </p>
        <Toggle
          label={`xAI Grok 4.5 ${xai ? "(ready)" : "(unavailable)"}`}
          checked={settings.xai}
          onChange={(v) => setSettings({ xai: v })}
        />
        <Toggle
          label="OpenRouter"
          checked={settings.openrouter}
          onChange={(v) => setSettings({ openrouter: v })}
        />
        <div className="mb-3 grid gap-2">
          <Field
            label="OpenRouter key"
            type="password"
            value={settings.openrouterKey}
            onChange={(v) => setSettings({ openrouterKey: v, openrouter: v.trim().length > 0 ? true : settings.openrouter })}
          />
          <StatusLine status={orStatus} error={orError} count={orModels.length} free={orModels.filter((m) => m.free).length} />
          {orModels.length ? (
            <ModelList
              models={orModels}
              selected={settings.openrouterModel}
              onSelect={(id) => setSettings({ openrouterModel: id, openrouter: true })}
            />
          ) : (
            <Field
              label="OpenRouter model (manual)"
              value={settings.openrouterModel}
              onChange={(v) => setSettings({ openrouterModel: v })}
            />
          )}
        </div>
        <Toggle
          label="Hugging Face"
          checked={settings.huggingface}
          onChange={(v) => setSettings({ huggingface: v })}
        />
        <div className="mb-3 grid gap-2">
          <Field
            label="Hugging Face key"
            type="password"
            value={settings.huggingfaceKey}
            onChange={(v) =>
              setSettings({ huggingfaceKey: v, huggingface: v.trim().length > 0 ? true : settings.huggingface })
            }
          />
          <StatusLine status={hfStatus} error={hfError} count={hfModels.length} free={hfModels.filter((m) => m.free).length} />
          {hfModels.length ? (
            <ModelList
              models={hfModels}
              selected={settings.huggingfaceModel}
              onSelect={(id) => setSettings({ huggingfaceModel: id, huggingface: true })}
            />
          ) : (
            <Field
              label="HF model (manual)"
              value={settings.huggingfaceModel}
              onChange={(v) => setSettings({ huggingfaceModel: v })}
            />
          )}
        </div>
        <Toggle
          label="LLM auto (cooldown, high-edge only)"
          checked={settings.autoLlm}
          onChange={(v) => setSettings({ autoLlm: v })}
        />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Num
            label="Min USDC"
            value={settings.risk.minOrderUsdc}
            onChange={(v) => setSettings({ risk: { ...settings.risk, minOrderUsdc: v } })}
          />
          <Num
            label="Max USDC"
            value={settings.risk.maxOrderUsdc}
            onChange={(v) => setSettings({ risk: { ...settings.risk, maxOrderUsdc: v } })}
          />
          <Num
            label="Max position"
            value={settings.risk.maxPositionUsdc}
            onChange={(v) => setSettings({ risk: { ...settings.risk, maxPositionUsdc: v } })}
          />
          <Num
            label="Max daily loss"
            value={settings.risk.maxDailyLossUsdc}
            onChange={(v) => setSettings({ risk: { ...settings.risk, maxDailyLossUsdc: v } })}
          />
          <Num
            label="Max slip bps"
            value={settings.risk.maxSlippageBps}
            onChange={(v) => setSettings({ risk: { ...settings.risk, maxSlippageBps: v } })}
          />
        </div>
        <Button className="mt-4 w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

function StatusLine({
  status,
  error,
  count,
  free,
}: {
  status: ProbeStatus;
  error: string | null;
  count: number;
  free: number;
}) {
  if (status === "idle") return <div className="text-[11px] text-muted">Paste a key to probe models</div>;
  if (status === "checking") {
    return (
      <div className="flex items-center gap-2 text-[11px] text-warn">
        <Loader2 className="size-3 animate-spin" />
        Checking API…
      </div>
    );
  }
  if (status === "fail") return <div className="text-[11px] text-danger">{error || "Key rejected"}</div>;
  return (
    <div className="text-[11px] text-accent">
      Live · {count} models · {free} free
    </div>
  );
}

function ModelList({
  models,
  selected,
  onSelect,
}: {
  models: AiModelOption[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const free = models.filter((m) => m.free);
  const paid = models.filter((m) => !m.free);
  const shown = [...free, ...paid.slice(0, 24)];
  return (
    <div className="max-h-48 overflow-y-auto rounded-sm ring-1 ring-border">
      {shown.map((m) => (
        <button
          key={m.id}
          onClick={() => onSelect(m.id)}
          className={cn(
            "flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px]",
            selected === m.id ? "bg-accent-dim text-accent" : "hover:bg-surface-2",
          )}
        >
          <span
            className={cn(
              "w-10 shrink-0 text-[9px] tracking-widest",
              m.free ? "text-accent" : "text-warn",
            )}
          >
            {m.free ? "FREE" : "PAID"}
          </span>
          <span className="min-w-0 flex-1 truncate">{m.name}</span>
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mb-2 flex h-10 items-center justify-between gap-3 text-[12px]">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={checked ? "h-6 w-10 rounded-full bg-accent" : "h-6 w-10 rounded-full bg-surface-3"}
      >
        <span className={checked ? "ml-5 block size-5 rounded-full bg-bg" : "ml-0.5 block size-5 rounded-full bg-muted"} />
      </button>
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-[10px] tracking-widest text-muted">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-sm bg-surface-2 px-2 font-mono text-xs text-fg outline-none ring-1 ring-border focus:ring-accent"
      />
    </label>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="grid gap-1 text-[10px] tracking-widest text-muted">
      {label}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-10 rounded-sm bg-surface-2 px-2 font-mono text-xs text-fg outline-none ring-1 ring-border focus:ring-accent"
      />
    </label>
  );
}
