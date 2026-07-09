import type { BacktestResponse, RebalanceFrequency, TickerInfo } from "./types";

const BASE = "/api";

export async function checkHealth(): Promise<{ status: string; timestamp: string } | null> {
  try {
    const res = await fetch(`${BASE}/health`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchTickers(search?: string): Promise<TickerInfo[]> {
  const url = search ? `${BASE}/tickers?search=${encodeURIComponent(search)}` : `${BASE}/tickers`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch tickers");
  return res.json();
}

export async function runBacktest(
  weights: Record<string, number>,
  startDate: string,
  rebalanceFrequency: RebalanceFrequency,
  initialInvestment: number,
): Promise<BacktestResponse> {
  const res = await fetch(`${BASE}/backtest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      weights,
      start_date: startDate,
      rebalance_frequency: rebalanceFrequency,
      initial_investment: initialInvestment,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Backtest failed");
  }
  return res.json();
}
