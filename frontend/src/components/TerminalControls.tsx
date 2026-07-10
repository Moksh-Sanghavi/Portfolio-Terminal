import { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Scale,
  Search,
  Loader2,
  PlayCircle,
  IndianRupee,
  
} from "lucide-react";
import DatePicker from "./DatePicker";
import type { HorizonKey, RebalanceFrequency, TickerInfo } from "../types";

const HORIZONS: HorizonKey[] = ["3M", "6M", "12M", "3Y", "5Y"];
const REBALANCE_OPTIONS: { label: string; value: RebalanceFrequency }[] = [
  { label: "Buy & Hold", value: null },
  { label: "Daily", value: "daily" },
  { label: "Monthly", value: "monthly" },
  { label: "Quarterly", value: "quarterly" },
];

interface TerminalControlsProps {
  universe: TickerInfo[];
  universeLoading: boolean;
  portfolio: string[];
  weights: Record<string, number>;
  tickerNameLookup: Record<string, string>;
  onAddTicker: (ticker: string) => void;
  onRemoveTicker: (ticker: string) => void;
  onWeightChange: (ticker: string, value: number) => void;
  onEqualWeights: () => void;
  startDate: string;
  onStartDateChange: (date: string) => void;
  datasetMinDate?: string;
  horizon: HorizonKey;
  onHorizonChange: (h: HorizonKey) => void;
  rebalanceFrequency: RebalanceFrequency;
  onRebalanceChange: (r: RebalanceFrequency) => void;
  initialInvestment: number;
  onInitialInvestmentChange: (value: number) => void;
  onRunBacktest: () => void;
  isRunning: boolean;
}

function PillGroup<T extends string | null>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.label}
          onClick={() => onChange(opt.value)}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors ${
            value === opt.value
              ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
              : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function TerminalControls({
  universe,
  universeLoading,
  portfolio,
  weights,
  tickerNameLookup,
  onAddTicker,
  onRemoveTicker,
  onWeightChange,
  onEqualWeights,
  startDate,
  onStartDateChange,
  datasetMinDate,
  horizon,
  onHorizonChange,
  rebalanceFrequency,
  onRebalanceChange,
  initialInvestment,
  onInitialInvestmentChange,
  onRunBacktest,
  isRunning,
}: TerminalControlsProps) {
  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return universe
      .filter((t) => t.ticker.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, universe]);

  const totalWeight = useMemo(
    () => portfolio.reduce((sum, t) => sum + (weights[t] ?? 0), 0),
    [portfolio, weights],
  );
  const weightOk = Math.abs(totalWeight - 100) < 0.01;
  const capitalOk = initialInvestment > 0;
  const canRun = portfolio.length > 0 && weightOk && capitalOk && !isRunning;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <aside className="flex h-full w-[420px] shrink-0 flex-col overflow-y-auto border-r border-zinc-800/80 bg-zinc-950 px-5 py-6">
      

      {/* ---- Stock search / add ---- */}
      <div className="mt-6">
        <label className="mb-1.5 block text-[14px] font-semibold uppercase tracking-wider text-zinc-500">
          Add Assets
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setDropdownOpen(true);
            }}
            onFocus={() => setDropdownOpen(true)}
            placeholder="Search ticker or company..."
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-2.5 pl-9 pr-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-emerald-600"
          />
          {dropdownOpen && query && (
            <div className="absolute z-20 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/40">
              {universeLoading ? (
                <div className="px-3 py-3 text-xs text-zinc-500">Loading universe...</div>
              ) : matches.length === 0 ? (
                <div className="px-3 py-3 text-xs text-zinc-500">No matches found.</div>
              ) : (
                matches.map((t) => {
                  const already = portfolio.includes(t.ticker);
                  return (
                    <button
                      key={t.ticker}
                      disabled={already}
                      onClick={() => {
                        onAddTicker(t.ticker);
                        setQuery("");
                        setDropdownOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-2 border-b border-zinc-800/60 px-3.5 py-2.5 text-left last:border-0 hover:bg-zinc-800/60 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-zinc-200">
                          {t.ticker}
                        </span>
                        <span className="block truncate text-[14px] font-medium text-zinc-400">{t.name}</span>
                      </span>
                      <Plus className="h-3.5 w-3.5 shrink-0 text-emerald-500" strokeWidth={2.5} />
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---- Asset weight matrix ---- */}
      <div className="mt-6">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[14px] font-semibold uppercase tracking-wider text-zinc-500">
            Portfolio ({portfolio.length})
          </span>
          <button
            onClick={onEqualWeights}
            disabled={portfolio.length === 0}
            className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400 transition-colors hover:border-emerald-700 hover:text-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Scale className="h-3 w-3" />
            Apply Equal Weights
          </button>
        </div>

        {portfolio.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 px-3 py-6 text-center text-xs text-zinc-600">
            Search above to add assets to your portfolio.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {portfolio.map((ticker, index) => (
              <div
                key={ticker}
                className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold tabular-nums text-zinc-400">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-zinc-200">
                    {ticker}
                  </div>
                  <div className="truncate text-xs font-medium text-zinc-400">
                    {tickerNameLookup[ticker] ?? ""}
                  </div>
                </div>
                <div className="relative w-[76px] shrink-0">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={weights[ticker] ?? 0}
                    onChange={(e) => onWeightChange(ticker, Number(e.target.value))}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 py-1.5 pl-2 pr-5 text-right text-xs tabular-nums text-zinc-100 outline-none focus:border-emerald-600"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600">
                    %
                  </span>
                </div>
                <button
                  onClick={() => onRemoveTicker(ticker)}
                  className="shrink-0 rounded-lg p-1.5 text-zinc-600 transition-colors hover:bg-rose-500/10 hover:text-rose-500"
                  aria-label={`Remove ${ticker}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {portfolio.length > 0 && (
          <div
            className={`mt-3 flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${
              weightOk
                ? "border-emerald-800/60 bg-emerald-500/10 text-emerald-500"
                : "animate-flash border-amber-800/60 bg-amber-500/10 text-amber-500"
            }`}
          >
            <span>{weightOk ? "ALLOCATION VALID" : "ALLOCATION INVALID"}</span>
            <span className="tabular-nums">{totalWeight.toFixed(2)}%</span>
          </div>
        )}
      </div>

      {/* ---- Initial capital ---- */}
      <div className="mt-6">
        <label className="mb-1.5 block text-[14px] font-semibold uppercase tracking-wider text-zinc-500">
          Initial Capital
        </label>
        <div className="relative">
          <IndianRupee className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
          <input
            type="number"
            min={1}
            step={1000}
            value={initialInvestment}
            onChange={(e) => onInitialInvestmentChange(Number(e.target.value))}
            className={`w-full rounded-xl border bg-zinc-900 py-2.5 pl-9 pr-3 text-sm tabular-nums text-zinc-200 outline-none transition-colors focus:border-emerald-600 ${
              capitalOk ? "border-zinc-800" : "border-rose-700"
            }`}
          />
        </div>
        {!capitalOk && (
          <p className="mt-1.5 text-[14px] text-rose-500">Initial capital must be greater than zero.</p>
        )}
      </div>

      {/* ---- Temporal controls ---- */}
      <div className="mt-5">
        <label className="mb-1.5 block text-[14px] font-semibold uppercase tracking-wider text-zinc-500">
          Start Date (T&#8320;)
        </label>
        <DatePicker value={startDate} onChange={onStartDateChange} max={today} min={datasetMinDate} />
      </div>

      <div className="mt-5">
        <label className="mb-1.5 block text-[14px] font-semibold uppercase tracking-wider text-zinc-500">
          Evaluation Horizon
        </label>
        <PillGroup
          options={HORIZONS.map((h) => ({ label: h, value: h }))}
          value={horizon}
          onChange={onHorizonChange}
        />
      </div>

      <div className="mt-5">
        <label className="mb-1.5 block text-[14px] font-semibold uppercase tracking-wider text-zinc-500">
          Rebalancing
        </label>
        <PillGroup options={REBALANCE_OPTIONS} value={rebalanceFrequency} onChange={onRebalanceChange} />
      </div>

      {/* ---- Run button ---- */}
      <div className="mt-6 border-t border-zinc-800/80 pt-5">
        <button
          onClick={onRunBacktest}
          disabled={!canRun}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold tracking-wide text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
        >
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PlayCircle className="h-4 w-4" strokeWidth={2.5} />
          )}
          Run Backtest
        </button>
      </div>

      {dropdownOpen && (
        <button
          className="fixed inset-0 z-10 cursor-default"
          onClick={() => setDropdownOpen(false)}
          aria-label="Close search dropdown"
          tabIndex={-1}
        />
      )}
    </aside>
  );
}
