import {  Minus, LayoutGrid } from "lucide-react";
import type { AssetBreakdownRow, HorizonResult } from "../types";

interface MetricsGridProps {
  horizonResult: HorizonResult;
  assetBreakdown: AssetBreakdownRow[];
}

function MetricBox({
  title,
  returnPct,
  cagrPct,
  sharpe,
  maxDrawdownPct,
  value,
  unavailable,
  tone,
}: {
  title: string;
  returnPct: number | null;
  cagrPct: number | null;
  sharpe: number | null;
  maxDrawdownPct: number | null;
  value: number | undefined;
  unavailable: boolean;
  tone: "positive" | "negative" | "neutral";
}) {
  const toneClasses =
    tone === "positive"
      ? "text-emerald-500 border-l-emerald-500"
      : tone === "negative"
        ? "text-rose-500 border-l-rose-500"
        : "text-slate-300 border-l-slate-500";

  const cagrBadgeClasses =
    tone === "positive"
      ? "border-emerald-700/50 bg-emerald-500/10 text-emerald-400"
      : tone === "negative"
        ? "border-rose-700/50 bg-rose-500/10 text-rose-400"
        : "border-slate-600/50 bg-slate-500/10 text-slate-300";

  return (
    <div
      className={`rounded-2xl border border-zinc-800 border-l-2 bg-zinc-900/40 p-5 shadow-lg shadow-black/20 ${toneClasses.split(" ")[1]}`}
    >
      <div className="mb-3 text-sm font-bold uppercase tracking-widest text-zinc-500">
        {title}
      </div>
      {unavailable ? (
        <div className="text-lg font-bold text-zinc-600">Data Unavailable</div>
      ) : (
        <>
          <div className={`flex items-baseline gap-1.5 text-2xl font-bold tabular-nums ${toneClasses.split(" ")[0]}`}>

            {returnPct !== null && returnPct >= 0 ? "+" : ""}
            {returnPct?.toFixed(2)}%
          </div>
          <div className="mt-2 text-sm tabular-nums text-zinc-400">
            ₹{value?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          {cagrPct !== null && !Number.isNaN(cagrPct) && (
            <div
              className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold tabular-nums ${cagrBadgeClasses}`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">CAGR</span>
              {cagrPct >= 0 ? "+" : ""}
              {cagrPct.toFixed(2)}%
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-400">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-2.5 py-1.5">
              <div className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Sharpe</div>
              <div className="tabular-nums text-zinc-200">
                {sharpe === null || Number.isNaN(sharpe) ? "-" : sharpe.toFixed(2)}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-2.5 py-1.5">
              <div className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Max Drawdown</div>
              <div className="tabular-nums text-rose-400">
                {maxDrawdownPct === null || Number.isNaN(maxDrawdownPct)
                  ? "-"
                  : `${maxDrawdownPct.toFixed(2)}%`}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AlphaBox({ alpha, unavailable }: { alpha: number | null; unavailable: boolean }) {
  const positive = alpha !== null && alpha >= 0;
  return (
    <div
      className={`rounded-2xl border border-l-2 p-5 shadow-lg shadow-black/20 ${
        unavailable
          ? "border-zinc-800 border-l-zinc-600 bg-zinc-900/40"
          : positive
            ? "border-emerald-800/50 border-l-emerald-500 bg-emerald-500/5"
            : "border-rose-800/50 border-l-rose-500 bg-rose-500/5"
      }`}
    >
      <div className="mb-3 text-sm font-bold uppercase tracking-widest text-zinc-500">
        Alpha Generated
      </div>
      {unavailable ? (
        <div className="text-lg font-bold text-zinc-600">Data Unavailable</div>
      ) : (
        <>
          <div
            className={`flex items-baseline gap-1.5 text-2xl font-bold tabular-nums ${
              positive ? "text-emerald-500" : "text-rose-500"
            }`}
          >
            
            {positive ? "+" : ""}
            {alpha?.toFixed(2)}%
          </div>
          <div className="mt-2 flex items-center gap-1 text-xs text-zinc-500">
            Portfolio vs Nifty 50
          </div>
        </>
      )}
    </div>
  );
}

export default function MetricsGrid({ horizonResult, assetBreakdown }: MetricsGridProps) {
  const dataUnavailable = typeof horizonResult.portfolio_return === "string";
  const pr = dataUnavailable ? null : (horizonResult.portfolio_return as number) * 100;
  const nr = dataUnavailable ? null : (horizonResult.nifty_return as number) * 100;
  const portfolioCagr =
    dataUnavailable || horizonResult.portfolio_cagr === undefined
      ? null
      : horizonResult.portfolio_cagr * 100;
  const niftyCagr =
    dataUnavailable || horizonResult.nifty_cagr === undefined ? null : horizonResult.nifty_cagr * 100;
  const alpha = pr !== null && nr !== null ? pr - nr : null;

  const portfolioSharpe = dataUnavailable ? null : horizonResult.portfolio_sharpe ?? null;
  const niftySharpe = dataUnavailable ? null : horizonResult.nifty_sharpe ?? null;
  const portfolioMaxDrawdown =
    dataUnavailable || horizonResult.portfolio_max_drawdown == null
      ? null
      : horizonResult.portfolio_max_drawdown * 100;
  const niftyMaxDrawdown =
    dataUnavailable || horizonResult.nifty_max_drawdown == null ? null : horizonResult.nifty_max_drawdown * 100;

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricBox
          title="Custom Portfolio"
          returnPct={pr}
          cagrPct={portfolioCagr}
          sharpe={portfolioSharpe}
          maxDrawdownPct={portfolioMaxDrawdown}
          value={horizonResult.portfolio_value}
          unavailable={dataUnavailable}
          tone={pr !== null && pr >= 0 ? "positive" : "negative"}
        />
        <MetricBox
          title="Nifty 50 Index"
          returnPct={nr}
          cagrPct={niftyCagr}
          sharpe={niftySharpe}
          maxDrawdownPct={niftyMaxDrawdown}
          value={horizonResult.nifty_value}
          unavailable={dataUnavailable}
          tone="neutral"
        />
        <AlphaBox alpha={alpha} unavailable={dataUnavailable} />
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 shadow-lg shadow-black/20">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
            <LayoutGrid className="h-4 w-4 text-emerald-400" strokeWidth={2.25} />
          </span>
          <div>
            <div className="text-sm font-semibold text-zinc-100">Asset-Level Breakdown</div>
            <div className="text-[11px] text-zinc-500">Per-asset return and weighted contribution</div>
          </div>
        </div>
        {dataUnavailable ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-6 text-center text-sm text-zinc-500">
            Asset-level breakdown unavailable for this horizon.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/60 text-left text-[11px] uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-2.5 font-semibold">Ticker</th>
                  <th className="px-4 py-2.5 font-semibold">Company</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Weight</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Standalone Return</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Weighted Contribution</th>
                </tr>
              </thead>
              <tbody>
                {assetBreakdown.map((row) => (
                  <tr
                    key={row.ticker}
                    className="border-b border-zinc-900 last:border-0 hover:bg-zinc-950/40"
                  >
                    <td className="px-4 py-2.5 font-semibold text-zinc-200">
                      {row.ticker}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-zinc-300">{row.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-300">
                      {row.weightPct.toFixed(2)}%
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums ${
                        row.standaloneReturnPct >= 0 ? "text-emerald-500" : "text-rose-500"
                      }`}
                    >
                      {row.standaloneReturnPct >= 0 ? "+" : ""}
                      {row.standaloneReturnPct.toFixed(2)}%
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums ${
                        row.weightedContributionPct >= 0 ? "text-emerald-500" : "text-rose-500"
                      }`}
                    >
                      {row.weightedContributionPct >= 0 ? "+" : ""}
                      {row.weightedContributionPct.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
