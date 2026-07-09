import { useEffect, useState } from "react";
import { Radio, Sun, Moon } from "lucide-react";
import { checkHealth } from "../api";
import type { Theme } from "../colors";

interface HeaderProps {
  theme: Theme;
  onToggleTheme: () => void;
}

export default function Header({ theme, onToggleTheme }: HeaderProps) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [timestamp, setTimestamp] = useState<string>("");

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
          Portfolio Terminal
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
    </header>
  );
}
