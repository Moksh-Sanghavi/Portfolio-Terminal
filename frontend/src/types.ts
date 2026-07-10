export interface TickerInfo {
  ticker: string;
  name: string;
  market_cap: number;
  status: string;
  first_date: string;
  last_date: string;
  row_count: number;
}

export type HorizonKey = "3M" | "6M" | "12M" | "3Y" | "5Y" | "MAX";

export interface HorizonResult {
  portfolio_return: number | "Data Unavailable";
  nifty_return: number | "Data Unavailable";
  portfolio_cagr?: number | null;
  nifty_cagr?: number | null;
  portfolio_sharpe?: number | null;
  nifty_sharpe?: number | null;
  portfolio_max_drawdown?: number | null;
  nifty_max_drawdown?: number | null;
  target_date: string;
  actual_trading_day?: string;
  portfolio_value?: number;
  nifty_value?: number;
}

export interface AssetBreakdownRow {
  ticker: string;
  name: string;
  weightPct: number;
  standaloneReturnPct: number;
  weightedContributionPct: number;
}

export interface TimelinePoint {
  date: string;
  portfolio: number;
  nifty: number;
}

export interface BacktestResponse {
  timeline: TimelinePoint[];
  startDateRequested: string;
  startDateActual: string;
  lastAvailableDate: string;
  horizons: Record<HorizonKey, HorizonResult>;
  assetBreakdownByHorizon: Record<HorizonKey, AssetBreakdownRow[]>;
}

export type RebalanceFrequency = null | "daily" | "monthly" | "quarterly";
