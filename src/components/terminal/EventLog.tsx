import { useTerminal } from "@/lib/fitstock/store";
import { cn } from "@/lib/utils";

export function EventLog() {
  const log = useTerminal((s) => s.log);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-3 py-1.5 text-[10px] tracking-[0.22em] text-muted">
        EVENT LOG
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-3 py-1 font-mono text-[11px]">
        {log.map((e) => (
          <li key={e.id} className="flex gap-2 py-0.5">
            <span className="tabular text-faint">{new Date(e.ts).toISOString().slice(11, 19)}</span>
            <span
              className={cn(
                e.level === "error" && "text-danger",
                e.level === "warn" && "text-warn",
                e.level === "signal" && "text-accent",
                e.level === "info" && "text-muted",
              )}
            >
              {e.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
