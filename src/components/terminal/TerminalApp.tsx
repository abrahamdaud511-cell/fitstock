import { useState } from "react";
import { Briefcase, CandlestickChart, LayoutList, MessageSquare, Radio } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useEngine } from "@/lib/fitstock/use-engine";
import { useTerminal } from "@/lib/fitstock/store";
import { cn } from "@/lib/utils";
import { BookExec } from "./BookExec";
import { CampaignDetail } from "./CampaignDetail";
import { ChatDashboard } from "./ChatDashboard";
import { EventLog } from "./EventLog";
import { MagicChart } from "./MagicChart";
import { MarketRail } from "./MarketRail";
import { PortfolioView } from "./PortfolioView";
import { SettingsPanel } from "./SettingsPanel";
import { SignalHud } from "./SignalHud";
import { StatusBar } from "./StatusBar";
import { WalletPanel } from "./WalletPanel";

const TABS = [
  { id: "markets", label: "Markets", icon: LayoutList },
  { id: "campaign", label: "Campaign", icon: Radio },
  { id: "terminal", label: "Terminal", icon: CandlestickChart },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "portfolio", label: "Portfolio", icon: Briefcase },
] as const;

export function TerminalApp() {
  const { visible, runLlm, arm } = useEngine();
  const [settings, setSettings] = useState(false);
  const tab = useTerminal((s) => s.mobileTab);
  const setTab = useTerminal((s) => s.setMobileTab);
  const layer = useTerminal((s) => s.layer);
  const setLayer = useTerminal((s) => s.setLayer);

  const overlay =
    layer === "campaign" ? (
      <CampaignDetail onBack={() => setLayer("terminal")} onRun={() => void runLlm()} onArm={arm} />
    ) : layer === "portfolio" ? (
      <PortfolioView onBack={() => setLayer("terminal")} onWallet={() => setLayer("wallet")} />
    ) : layer === "wallet" ? (
      <WalletPanel onBack={() => setLayer("terminal")} />
    ) : layer === "chat" ? (
      <ChatDashboard onBack={() => setLayer("terminal")} />
    ) : null;

  return (
    <div className="relative flex h-dvh min-h-0 min-w-0 flex-col overflow-x-hidden bg-bg text-fg">
      <div className="tick-scan pointer-events-none absolute inset-0 z-10 opacity-40" />
      <StatusBar onSettings={() => setSettings(true)} />

      <div className="relative hidden min-h-0 flex-1 lg:flex">
        {overlay ? (
          <div className="min-h-0 flex-1 overflow-hidden">{overlay}</div>
        ) : (
        <Group orientation="vertical" className="flex-1">
          <Panel defaultSize="78%" minSize="50%">
            <Group orientation="horizontal" className="h-full">
              <Panel defaultSize="24%" minSize="16%" className="panel m-1 overflow-hidden">
                <MarketRail events={visible} />
              </Panel>
              <Separator className="resize-handle" />
              <Panel defaultSize="50%" minSize="30%">
                <Group orientation="vertical" className="h-full">
                  <Panel defaultSize="62%" minSize="30%" className="panel m-1 overflow-hidden">
                    <MagicChart />
                  </Panel>
                  <Separator className="resize-handle" />
                  <Panel defaultSize="38%" minSize="20%" className="panel m-1 overflow-hidden">
                    <BookExec />
                  </Panel>
                </Group>
              </Panel>
              <Separator className="resize-handle" />
              <Panel defaultSize="26%" minSize="18%" className="panel m-1 overflow-hidden">
                <SignalHud onRun={() => void runLlm()} onArm={arm} />
              </Panel>
            </Group>
          </Panel>
          <Separator className="resize-handle" />
          <Panel defaultSize="22%" minSize="10%" className="panel mx-1 mb-1 overflow-hidden">
            <EventLog />
          </Panel>
        </Group>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <div className="min-h-0 flex-1 overflow-hidden">
          {tab === "markets" ? <MarketRail events={visible} /> : null}
          {tab === "campaign" ? (
            <CampaignDetail onBack={() => setTab("markets")} onRun={() => void runLlm()} onArm={arm} />
          ) : null}
          {tab === "terminal" ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="min-h-0 flex-[3]">
                <MagicChart />
              </div>
              <div className="min-h-0 flex-[2] border-t border-border">
                <SignalHud onRun={() => void runLlm()} onArm={arm} />
              </div>
              <div className="h-40 border-t border-border">
                <BookExec />
              </div>
            </div>
          ) : null}
          {tab === "chat" ? <ChatDashboard onBack={() => setTab("markets")} /> : null}
          {tab === "portfolio" ? (
            layer === "wallet" ? (
              <WalletPanel onBack={() => setLayer("portfolio")} />
            ) : (
              <PortfolioView onBack={() => setTab("markets")} onWallet={() => setLayer("wallet")} />
            )
          ) : null}
        </div>
        <nav className="grid h-14 shrink-0 grid-cols-5 border-t border-border bg-surface">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 text-[10px] tracking-widest",
                  on ? "text-accent" : "text-muted",
                )}
              >
                <Icon className="size-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>
      <SettingsPanel open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}
