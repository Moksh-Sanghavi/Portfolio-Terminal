import { useEffect, useState } from "react";
import { Radio, Sun, Moon, History as HistoryIcon, Trash2 } from "lucide-react";
import { checkHealth } from "../api";
import type { Theme } from "../colors";
import type { HistoryEntry } from "../history";

const REBALANCE_LABELS: Record<string, string> = {
  daily: "Daily",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

function rebalanceLabel(freq: HistoryEntry["rebalanceFrequency"]): string {
  return freq ? REBALANCE_LABELS[freq] ?? freq : "Buy & Hold";
}

function formatRunAt(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

interface HeaderProps {
  theme: Theme;
  onToggleTheme: () => void;
  history: HistoryEntry[];
  onSelectHistory: (entry: HistoryEntry) => void;
  onRemoveHistory: (id: string) => void;
  onClearHistory: () => void;
}

export default function Header({
  theme,
  onToggleTheme,
  history,
  onSelectHistory,
  onRemoveHistory,
  onClearHistory,
}: HeaderProps) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [timestamp, setTimestamp] = useState<string>("");
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      const health = await checkHealth();
      if (!mounted) return;
      setConnected(!!health);
      setTimestamp(health?.timestamp ?? "");
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return (
    <header className="flex items-center justify-between border-b border-zinc-800/80 bg-slate-950 px-6 py-3.5">
      <div className="flex items-center gap-3">

        <span className="text-lg font-semibold tracking-wide text-zinc-100">
          Portfolio Terminal | Shatrunjaya Investment Managers LLP
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <button
          onClick={onToggleTheme}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition-colors hover:border-emerald-700 hover:text-emerald-400"
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        <div className="relative">
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
              historyOpen
                ? "border-emerald-700 text-emerald-400"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-emerald-700 hover:text-emerald-400"
            }`}
            aria-label="Backtest history"
            title="Backtest history"
          >
            <HistoryIcon className="h-3.5 w-3.5" />
          </button>

          {historyOpen && (
            <div className="absolute right-0 z-20 mt-2 w-96 rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/40">
              <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Backtest History
                </span>
                {history.length > 0 && (
                  <button
                    onClick={onClearHistory}
                    className="text-[11px] font-semibold text-zinc-500 transition-colors hover:text-rose-500"
                  >
                    Clear All
                  </button>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto">
                {history.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-zinc-500">
                    No backtests run yet. Completed runs will appear here.
                  </div>
                ) : (
                  history.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex w-full items-start justify-between gap-2 border-b border-zinc-800/60 px-4 py-3 last:border-0 hover:bg-zinc-800/60"
                    >
                      <button
                        onClick={() => {
                          onSelectHistory(entry);
                          setHistoryOpen(false);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block text-xs font-semibold tabular-nums text-zinc-300">
                          {formatRunAt(entry.runAt)}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-zinc-500">
                          {entry.portfolio.length} asset{entry.portfolio.length === 1 ? "" : "s"} · from{" "}
                          {entry.startDate} · {rebalanceLabel(entry.rebalanceFrequency)}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-zinc-600">
                          Initial capital: Rs {entry.initialInvestment.toLocaleString("en-IN")}
                        </span>
                      </button>
                      <button
                        onClick={() => onRemoveHistory(entry.id)}
                        className="shrink-0 rounded-lg p-1.5 text-zinc-600 transition-colors hover:bg-rose-500/10 hover:text-rose-500"
                        aria-label="Remove from history"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1.5">
          <Radio
            className={`h-3 w-3 ${connected ? "text-emerald-500" : "text-rose-500"}`}
            strokeWidth={3}
          />
          <span
            className={`text-[11px] font-semibold tracking-wider ${
              connected ? "text-emerald-500" : "text-rose-500"
            }`}
          >
            BACKEND: {connected === null ? "CHECKING..." : connected ? "CONNECTED" : "OFFLINE"}
          </span>
        </div>
        <div className="hidden rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-[11px] tabular-nums text-zinc-400 sm:block">
          {timestamp || "--:--:--"}
        </div>
      </div>

      {historyOpen && (
        <button
          className="fixed inset-0 z-10 cursor-default"
          onClick={() => setHistoryOpen(false)}
          aria-label="Close history panel"
          tabIndex={-1}
        />
      )}
    </header>
  );
}
