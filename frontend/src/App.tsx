import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Grid3x3 } from "lucide-react";
import Header from "./components/Header";
import TerminalControls from "./components/TerminalControls";
import HorizonChart from "./components/HorizonChart";
import DrawdownChart from "./components/DrawdownChart";
import MetricsGrid from "./components/MetricsGrid";
import { fetchTickers, runBacktest } from "./api";
import type { Theme } from "./colors";
import type { BacktestResponse, HorizonKey, RebalanceFrequency, TickerInfo } from "./types";
import { type HistoryEntry, clearHistory, loadHistory, removeHistoryEntry, saveHistoryEntry } from "./history";

const THEME_STORAGE_KEY = "portfolio-terminal-theme";

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

const DEFAULT_ASSETS = [
  "ICICIAMC.NS", "BSE.NS", "CUMMINSIND.NS", "LLOYDSME.NS", "PERSISTENT.NS", "MCX.NS",
  "SCHAEFFLER.NS", "APLAPOLLO.NS", "ANTHEM.NS", "NAVINFLUOR.NS", "ANANDRATHI.NS", "IKS.NS",
  "ACUTAAS.NS", "RRKABEL.NS", "CEMPRO.NS", "RUBICON.NS", "SHRIPISTON.NS", "FINEORG.NS",
  "PRIVISCL.NS", "VIJAYA.NS", "ATLANTAELE.NS", "SEDEMAC.NS", "CORONA.NS", "KIRLPNU.NS",
  "LUMAXTECH.NS", "SUDEEPPHRM.NS", "MANORAMA.NS", "PRICOLLTD.NS", "JSLL.NS", "AEROFLEX.NS",
  "FIEMIND.NS", "RPEL.NS", "GOLDIAM.NS", "SANGHVIMOV.NS",
];

function defaultStartDate(): string {
  return "2022-01-01";
}

type Tab = "chart" | "metrics";

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const [universe, setUniverse] = useState<TickerInfo[]>([]);
  const [universeLoading, setUniverseLoading] = useState(true);

  const [portfolio, setPortfolio] = useState<string[]>(DEFAULT_ASSETS);
  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries(
      DEFAULT_ASSETS.map((t) => [t, Math.round((100 / DEFAULT_ASSETS.length) * 10000) / 10000]),
    ),
  );

  const [startDate, setStartDate] = useState(defaultStartDate());
  const [horizon, setHorizon] = useState<HorizonKey>("3Y");
  const [rebalanceFrequency, setRebalanceFrequency] = useState<RebalanceFrequency>(null);
  const [initialInvestment, setInitialInvestment] = useState(10_000_000);

  const [activeTab, setActiveTab] = useState<Tab>("chart");
  const [result, setResult] = useState<BacktestResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());

  useEffect(() => {
    fetchTickers()
      .then(setUniverse)
      .catch(() => setError("Failed to load ticker universe. Is the backend running?"))
      .finally(() => setUniverseLoading(false));
  }, []);

  const tickerNameLookup = useMemo(
    () => Object.fromEntries(universe.map((t) => [t.ticker, t.name])),
    [universe],
  );

  // Earliest first_date across the whole cached universe - drives the
  // DatePicker's year-jump dropdown so it only lists years we actually have data for.
  const datasetMinDate = useMemo(() => {
    if (universe.length === 0) return undefined;
    return universe.reduce((min, t) => (t.first_date < min ? t.first_date : min), universe[0].first_date);
  }, [universe]);

  const addTicker = (ticker: string) => {
    setPortfolio((prev) => (prev.includes(ticker) ? prev : [...prev, ticker]));
    setWeights((prev) => {
      if (ticker in prev) return prev;
      const nextCount = portfolio.includes(ticker) ? portfolio.length : portfolio.length + 1;
      return { ...prev, [ticker]: Math.round((100 / nextCount) * 100) / 100 };
    });
  };

  const removeTicker = (ticker: string) => {
    setPortfolio((prev) => prev.filter((t) => t !== ticker));
    setWeights((prev) => {
      const next = { ...prev };
      delete next[ticker];
      return next;
    });
  };

  const weightChange = (ticker: string, value: number) => {
    setWeights((prev) => ({ ...prev, [ticker]: value }));
  };

  const equalWeights = () => {
    const n = portfolio.length;
    if (n === 0) return;
    const share = Math.round((100 / n) * 10000) / 10000;
    setWeights(Object.fromEntries(portfolio.map((t) => [t, share])));
  };

  const handleRunBacktest = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const activeWeights = Object.fromEntries(portfolio.map((t) => [t, weights[t] ?? 0]));
      const res = await runBacktest(activeWeights, startDate, rebalanceFrequency, initialInvestment);
      setResult(res);
      setHistory(
        saveHistoryEntry({
          portfolio,
          weights: activeWeights,
          startDate,
          rebalanceFrequency,
          initialInvestment,
          result: res,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest failed.");
    } finally {
      setIsRunning(false);
    }
  };

  const handleSelectHistory = (entry: HistoryEntry) => {
    setPortfolio(entry.portfolio);
    setWeights(entry.weights);
    setStartDate(entry.startDate);
    setRebalanceFrequency(entry.rebalanceFrequency);
    setInitialInvestment(entry.initialInvestment);
    setResult(entry.result);
    setError(null);
    setActiveTab("chart");
  };

  const handleRemoveHistory = (id: string) => setHistory(removeHistoryEntry(id));
  const handleClearHistory = () => setHistory(clearHistory());

  const currentHorizonResult = result?.horizons[horizon];
  const dataUnavailable = currentHorizonResult
    ? typeof currentHorizonResult.portfolio_return === "string"
    : false;
  const endDate = dataUnavailable
    ? result?.lastAvailableDate
    : currentHorizonResult?.actual_trading_day;

  const chartData = useMemo(() => {
    if (!result || !endDate) return [];
    return result.timeline.filter(
      (p) => p.date >= result.startDateActual && p.date <= endDate,
    );
  }, [result, endDate]);

  const actualInitialInvestment = result?.timeline[0]?.portfolio ?? initialInvestment;
  const noteBanner = result
    ? `Tracking a normalized baseline investment of ₹${actualInitialInvestment.toLocaleString("en-IN")} from ${result.startDateActual} to ${endDate ?? result.lastAvailableDate}.`
    : "";

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-zinc-100">
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        history={history}
        onSelectHistory={handleSelectHistory}
        onRemoveHistory={handleRemoveHistory}
        onClearHistory={handleClearHistory}
      />
      <div className="flex min-h-0 flex-1">
        <TerminalControls
          universe={universe}
          universeLoading={universeLoading}
          portfolio={portfolio}
          weights={weights}
          tickerNameLookup={tickerNameLookup}
          onAddTicker={addTicker}
          onRemoveTicker={removeTicker}
          onWeightChange={weightChange}
          onEqualWeights={equalWeights}
          startDate={startDate}
          onStartDateChange={setStartDate}
          datasetMinDate={datasetMinDate}
          horizon={horizon}
          onHorizonChange={setHorizon}
          rebalanceFrequency={rebalanceFrequency}
          onRebalanceChange={setRebalanceFrequency}
          initialInvestment={initialInvestment}
          onInitialInvestmentChange={setInitialInvestment}
          onRunBacktest={handleRunBacktest}
          isRunning={isRunning}
        />

        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-800/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {!result ? (
            <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 text-center text-zinc-500">
              <BarChart3 className="mb-3 h-8 w-8 text-zinc-700" />
              <p className="text-sm">
                Configure your portfolio in the control panel and click{" "}
                <span className="font-semibold text-zinc-300">Run Backtest</span> to begin.
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                A default portfolio is pre-loaded to get you started.
              </p>
            </div>
          ) : (
            <>
              {dataUnavailable && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-800/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-500">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Selected horizon extends beyond available historical data. Displaying
                  maximum available data up to {result.lastAvailableDate}.
                </div>
              )}

              <div className="mb-5 flex w-fit gap-1 rounded-full border border-zinc-800 bg-zinc-900 p-1">
                <button
                  onClick={() => setActiveTab("chart")}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold tracking-wide transition-colors ${
                    activeTab === "chart"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  Performance Chart
                </button>
                <button
                  onClick={() => setActiveTab("metrics")}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold tracking-wide transition-colors ${
                    activeTab === "metrics"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <Grid3x3 className="h-3.5 w-3.5" />
                  Portfolio Composition & Metrics
                </button>
              </div>

              {activeTab === "chart" ? (
                <>
                  <HorizonChart data={chartData} noteBanner={noteBanner} theme={theme} />
                  <DrawdownChart data={chartData} theme={theme} />
                </>
              ) : (
                currentHorizonResult && (
                  <MetricsGrid
                    horizonResult={currentHorizonResult}
                    assetBreakdown={result.assetBreakdownByHorizon[horizon]}
                  />
                )
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
