"""
Quantitative calculation engine for the portfolio backtester.

Reads cached daily closing prices from market_data.db (populated once by
bulk_downloader.py), cleans/aligns them, builds a custom weighted portfolio,
and computes fixed-horizon (3/6/12 month) point-to-point returns against the
Nifty 50 benchmark.

This module never talks to yfinance directly - it only reads the local cache,
so every run is fast.
"""

import sqlite3
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

DB_PATH = str(Path(__file__).resolve().parent / "market_data.db")
BENCHMARK_TICKER = "^NSEI"
BENCHMARK_LABEL = "Nifty50"
INITIAL_INVESTMENT = 10_000.0
WEIGHT_TOLERANCE = 1e-3

#DEFAULT_ASSETS = ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "ICICIBANK.NS", "INFY.NS"]
DEFAULT_ASSETS = ["ICICIAMC.NS", "BSE.NS", "CUMMINSIND.NS", "LLOYDSME.NS", "PERSISTENT.NS", "MCX.NS", "SCHAEFFLER.NS", "APLAPOLLO.NS", "ANTHEM.NS", "NAVINFLUOR.NS", "ANANDRATHI.NS", "IKS.NS", "ACUTAAS.NS", "RRKABEL.NS", "CEMPRO.NS", "RUBICON.NS", "SHRIPISTON.NS", "FINEORG.NS", "PRIVISCL.NS", "VIJAYA.NS", "ATLANTAELE.NS", "SEDEMAC.NS", "CORONA.NS", "KIRLPNU.NS", "LUMAXTECH.NS", "SUDEEPPHRM.NS", "MANORAMA.NS", "PRICOLLTD.NS", "JSLL.NS", "AEROFLEX.NS", "FIEMIND.NS", "RPEL.NS", "GOLDIAM.NS", "SANGHVIMOV.NS"]

# ---------------------------------------------------------------------------
# 1. Data Acquisition (reads from local SQLite cache, not the network)
# ---------------------------------------------------------------------------

def get_available_tickers(db_path: str = DB_PATH) -> pd.DataFrame:
    """Return the full selectable NSE universe (name, ticker, market cap, coverage)."""
    conn = sqlite3.connect(db_path)
    try:
        df = pd.read_sql_query(
            "SELECT ticker, name, market_cap, status, first_date, last_date, row_count "
            "FROM meta WHERE status LIKE 'OK%' ORDER BY market_cap DESC",
            conn,
        )
    finally:
        conn.close()
    return df


def search_tickers(query: str, db_path: str = DB_PATH) -> pd.DataFrame:
    """Case-insensitive substring search over ticker symbol and company name."""
    universe = get_available_tickers(db_path)
    mask = (
        universe["ticker"].str.contains(query, case=False, na=False)
        | universe["name"].str.contains(query, case=False, na=False)
    )
    return universe[mask].reset_index(drop=True)


def load_prices(tickers: list[str], db_path: str = DB_PATH) -> pd.DataFrame:
    """
    Load daily close prices for the given tickers (plus the Nifty 50 benchmark)
    from the local cache and pivot into a wide Date x Ticker DataFrame.
    Missing/failed tickers are logged and excluded rather than raising.
    """
    all_tickers = list(dict.fromkeys(tickers + [BENCHMARK_TICKER]))
    conn = sqlite3.connect(db_path)
    try:
        placeholders = ",".join("?" for _ in all_tickers)
        query = f"SELECT date, ticker, close FROM prices WHERE ticker IN ({placeholders})"
        long_df = pd.read_sql_query(query, conn, params=all_tickers)
    finally:
        conn.close()

    found_tickers = set(long_df["ticker"].unique())
    for t in all_tickers:
        if t not in found_tickers:
            print(f"WARNING: no cached data found for '{t}' - excluding from this run. "
                  f"Run bulk_downloader.py to (re)populate the cache.")

    if long_df.empty:
        raise ValueError("No price data available for any requested ticker. "
                          "Have you run bulk_downloader.py yet?")

    wide = long_df.pivot(index="date", columns="ticker", values="close")
    wide.index = pd.to_datetime(wide.index)
    wide = wide.rename(columns={BENCHMARK_TICKER: BENCHMARK_LABEL})
    return wide.sort_index()


# ---------------------------------------------------------------------------
# 2. Data Cleaning & Alignment
# ---------------------------------------------------------------------------

def clean_and_align(prices: pd.DataFrame) -> pd.DataFrame:
    """
    Normalize the index to timezone-naive calendar dates, then fix holiday /
    listing-mismatch gaps: forward-fill first (carry last traded price),
    then back-fill (covers NaNs at the very start of a series).
    """
    cleaned = prices.copy()
    idx = pd.to_datetime(cleaned.index)
    if idx.tz is not None:
        idx = idx.tz_localize(None)
    cleaned.index = idx.normalize()
    cleaned = cleaned[~cleaned.index.duplicated(keep="last")].sort_index()

    missing_before = int(cleaned.isna().sum().sum())
    cleaned = cleaned.ffill().bfill()
    missing_after = int(cleaned.isna().sum().sum())

    print(f"Data aligned and cleaned successfully: {cleaned.shape[1]} series, "
          f"{cleaned.shape[0]} trading days ({cleaned.index.min().date()} to {cleaned.index.max().date()}), "
          f"{missing_before} gaps filled (ffill+bfill), {missing_after} remaining NaNs.")
    return cleaned


# ---------------------------------------------------------------------------
# 3. Quantitative Calculation Engine
# ---------------------------------------------------------------------------

def validate_weights(weights: dict[str, float]) -> None:
    total = sum(weights.values())
    if abs(total - 1.0) > WEIGHT_TOLERANCE:
        raise ValueError(
            f"Portfolio weights must sum to exactly 1.0 (100%). Got {total:.6f} instead. "
            f"Weights provided: {weights}"
        )


def compute_daily_returns(prices: pd.DataFrame) -> pd.DataFrame:
    return prices.pct_change()


REBALANCE_FREQUENCIES = (None, "daily", "monthly", "quarterly")


def _rebalance_positions(dates: pd.DatetimeIndex, rebalance_frequency: str | None) -> set[int]:
    """
    Row positions (into `dates`) on which the portfolio should be reset back to its
    target weights. Position 0 is always included - that's the initial buy.
    """
    if rebalance_frequency not in REBALANCE_FREQUENCIES:
        raise ValueError(
            f"Invalid rebalance_frequency {rebalance_frequency!r}. "
            f"Must be one of {REBALANCE_FREQUENCIES}."
        )

    if rebalance_frequency is None:
        return {0}

    if rebalance_frequency == "daily":
        return set(range(len(dates)))

    period_code = {"monthly": "M", "quarterly": "Q"}[rebalance_frequency]
    periods = dates.to_period(period_code)
    positions = {0}
    positions.update(i for i in range(1, len(dates)) if periods[i] != periods[i - 1])
    return positions


def build_portfolio_wealth_index(
    prices: pd.DataFrame,
    weights: dict[str, float],
    initial: float = INITIAL_INVESTMENT,
    rebalance_frequency: str | None = None,
) -> pd.Series:
    """
    Track a ₹`initial` portfolio built from `weights`, with configurable rebalancing:

      - rebalance_frequency=None (default): buy-and-hold. Weights are applied ONCE,
        converted into a fixed number of shares per asset, and never touched again.
        Winners grow into a larger share of the portfolio, losers shrink.
      - 'daily': constant-mix. Weights are reapplied every trading day (sells winners /
        buys losers back to target weight daily). Equivalent to compounding a daily
        weighted-average-return series.
      - 'monthly' / 'quarterly': weights are reapplied on the first trading day of each
        new calendar month/quarter; between reset dates the position drifts like
        buy-and-hold.

    Rebalancing here is frictionless (no transaction costs or taxes modeled).
    """
    validate_weights(weights)
    missing = [t for t in weights if t not in prices.columns]
    if missing:
        raise ValueError(f"Weighted ticker(s) not found in loaded price data: {missing}")

    tickers = list(weights.keys())
    price_matrix = prices[tickers].to_numpy()
    n_days = len(prices.index)

    reset_positions = _rebalance_positions(prices.index, rebalance_frequency)

    values = np.empty(n_days)
    shares = np.zeros(len(tickers))

    for i in range(n_days):
        if i in reset_positions:
            # Mark-to-market at today's price with the shares held coming into today,
            # THEN reallocate that value back to the target weights at today's price.
            portfolio_value = initial if i == 0 else float(np.dot(shares, price_matrix[i]))
            shares = np.array(
                [(weights[t] * portfolio_value) / price_matrix[i, j] for j, t in enumerate(tickers)]
            )
        values[i] = float(np.dot(shares, price_matrix[i]))

    return pd.Series(values, index=prices.index, name="Custom_Portfolio")


def build_benchmark_wealth_index(
    prices: pd.Series,
    initial: float = INITIAL_INVESTMENT,
) -> pd.Series:
    """Track a single ₹`initial` lump-sum investment in one price series (e.g. Nifty 50)."""
    units = initial / prices.iloc[0]
    return units * prices


# ---------------------------------------------------------------------------
# 4. Fixed-Horizon Slicing Logic (3, 6, 12 months)
# ---------------------------------------------------------------------------

def _nearest_trading_value(series: pd.Series, target_date: pd.Timestamp):
    """Return (value, actual_date) at the trading day nearest to target_date."""
    idx = series.index
    pos = idx.get_indexer([target_date], method="nearest")[0]
    actual_date = idx[pos]
    return series.iloc[pos], actual_date


def _cagr(start_value: float, end_value: float, start_date: pd.Timestamp, end_date: pd.Timestamp) -> float:
    """Compound annual growth rate between two dated values, annualized regardless
    of whether the underlying window is longer or shorter than a year."""
    years = (end_date - start_date).days / 365.25
    if years <= 0 or start_value <= 0:
        return float("nan")
    return (end_value / start_value) ** (1 / years) - 1


def compute_horizon_returns(
    wealth_df: pd.DataFrame,
    start_date,
    portfolio_col: str = "Custom_Portfolio",
    benchmark_col: str = BENCHMARK_LABEL,
) -> dict:
    """
    Given a wealth-index DataFrame (anchored at start_date) compute point-to-point
    % returns for the Custom Portfolio and Nifty 50 at T0+3M, T0+6M, T0+12M, T0+3Y
    and T0+5Y. Horizons that haven't occurred yet (or precede the cached data)
    return "Data Unavailable".
    """
    start_date = pd.Timestamp(start_date).normalize()
    today = pd.Timestamp(datetime.now().date())
    last_available = wealth_df.index.max()

    start_p, start_p_date = _nearest_trading_value(wealth_df[portfolio_col], start_date)
    start_n, start_n_date = _nearest_trading_value(wealth_df[benchmark_col], start_date)

    horizons = {
        "3M": pd.DateOffset(months=3),
        "6M": pd.DateOffset(months=6),
        "12M": pd.DateOffset(months=12),
        "3Y": pd.DateOffset(years=3),
        "5Y": pd.DateOffset(years=5),
    }

    results = {
        "start_date_requested": str(start_date.date()),
        "start_date_actual_trading_day": str(start_p_date.date()),
        "horizons": {},
    }

    for label, offset in horizons.items():
        target = start_date + offset
        if target > today or target > last_available:
            results["horizons"][label] = {
                "portfolio_return": "Data Unavailable",
                "nifty_return": "Data Unavailable",
                "target_date": str(target.date()),
            }
            continue

        end_p, end_p_date = _nearest_trading_value(wealth_df[portfolio_col], target)
        end_n, end_n_date = _nearest_trading_value(wealth_df[benchmark_col], target)

        results["horizons"][label] = {
            "portfolio_return": (end_p - start_p) / start_p,
            "nifty_return": (end_n - start_n) / start_n,
            "portfolio_cagr": _cagr(start_p, end_p, start_p_date, end_p_date),
            "nifty_cagr": _cagr(start_n, end_n, start_n_date, end_n_date),
            "target_date": str(target.date()),
            "actual_trading_day": str(end_p_date.date()),
            "portfolio_value": end_p,
            "nifty_value": end_n,
        }

    return results


# ---------------------------------------------------------------------------
# 5. Execution & Output Display
# ---------------------------------------------------------------------------

def run_backtest(
    assets: list[str],
    weights: dict[str, float],
    start_date: str,
    rebalance_frequency: str | None = None,
    initial_investment: float = INITIAL_INVESTMENT,
) -> dict:
    """
    rebalance_frequency: None (buy-and-hold, default), 'daily', 'monthly', or 'quarterly'.
    See build_portfolio_wealth_index() for what each mode means.
    """
    validate_weights(weights)
    if initial_investment <= 0:
        raise ValueError(f"initial_investment must be positive. Got {initial_investment}.")

    raw_prices = load_prices(assets)
    prices = clean_and_align(raw_prices)

    start_ts = pd.Timestamp(start_date).normalize()
    windowed_prices = prices.loc[prices.index >= start_ts]
    if windowed_prices.empty:
        raise ValueError(f"No trading data available on or after start_date {start_date}")

    # Weights are applied at the first trading day on/after start_date, then either held
    # (buy-and-hold) or periodically reset back to target per rebalance_frequency.
    wealth_df = pd.DataFrame(index=windowed_prices.index)
    wealth_df["Custom_Portfolio"] = build_portfolio_wealth_index(
        windowed_prices, weights, initial=initial_investment, rebalance_frequency=rebalance_frequency
    )
    wealth_df[BENCHMARK_LABEL] = build_benchmark_wealth_index(
        windowed_prices[BENCHMARK_LABEL], initial=initial_investment
    )

    horizon_results = compute_horizon_returns(wealth_df, start_date)

    return {
        "prices": prices,
        "wealth_df": wealth_df,
        "horizon_results": horizon_results,
    }


def _fmt_pct(value) -> str:
    if isinstance(value, str):
        return value
    return f"{value * 100:+.2f}%"


def _fmt_money(value) -> str:
    if isinstance(value, str):
        return value
    return f"Rs {value:,.2f}"


def print_report(
    assets: list[str],
    weights: dict[str, float],
    start_date: str,
    result: dict,
    rebalance_frequency: str | None = None,
) -> None:
    horizon_results = result["horizon_results"]
    wealth_df = result["wealth_df"]

    print("\n" + "=" * 60)
    print("PORTFOLIO BACKTEST REPORT")
    print("=" * 60)
    print(f"Assets & Weights : {weights}")
    print(f"Rebalancing      : {rebalance_frequency or 'buy-and-hold (never rebalanced)'}")
    print(f"Requested start  : {horizon_results['start_date_requested']}")
    print(f"Actual trading day used: {horizon_results['start_date_actual_trading_day']}")

    print("\n--- Point-to-Point Returns (Custom Portfolio vs Nifty 50) ---")
    header = f"{'Horizon':<8}{'Portfolio Return':<20}{'Nifty 50 Return':<20}{'As Of':<12}"
    print(header)
    print("-" * len(header))
    for label in ["3M", "6M", "12M", "3Y", "5Y"]:
        h = horizon_results["horizons"][label]
        as_of = h.get("actual_trading_day", h.get("target_date", "-"))
        print(f"{label:<8}{_fmt_pct(h['portfolio_return']):<20}{_fmt_pct(h['nifty_return']):<20}{as_of:<12}")

    initial_investment = wealth_df["Custom_Portfolio"].iloc[0]
    final_portfolio_value = wealth_df["Custom_Portfolio"].iloc[-1]
    final_nifty_value = wealth_df[BENCHMARK_LABEL].iloc[-1]
    final_date = wealth_df.index[-1].date()

    print(f"\n--- Final Value of {_fmt_money(initial_investment)} Invested on {horizon_results['start_date_actual_trading_day']} ---")
    print(f"As of {final_date}:")
    print(f"  Custom Portfolio : {_fmt_money(final_portfolio_value)}")
    print(f"  Nifty 50         : {_fmt_money(final_nifty_value)}")
    print("=" * 60 + "\n")


def _parse_weights_arg(raw: str) -> dict[str, float]:
    """Parse 'TICKER1:0.3,TICKER2:0.7' into {'TICKER1': 0.3, 'TICKER2': 0.7}."""
    weights: dict[str, float] = {}
    for pair in raw.split(","):
        ticker, _, weight = pair.strip().partition(":")
        if not ticker or not weight:
            raise ValueError(f"Malformed --tickers entry {pair!r}. Expected TICKER:WEIGHT.")
        weights[ticker.strip()] = float(weight)
    return weights


def _print_ticker_table(df: pd.DataFrame, limit: int = 50) -> None:
    if df.empty:
        print("No matching tickers found.")
        return
    total = len(df)
    shown = df.head(limit)
    print(shown.to_string(index=False))
    if total > limit:
        print(f"\n... {total - limit} more (showing top {limit} by market cap). Narrow your search to see others.")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Portfolio backtester over the cached NSE universe (market_data.db)."
    )
    parser.add_argument("--list", action="store_true", help="List all available tickers and exit.")
    parser.add_argument("--search", metavar="TERM", help="Search tickers by symbol/name and exit.")
    parser.add_argument(
        "--tickers",
        metavar="TICKER:WEIGHT,...",
        help='Portfolio to backtest, e.g. "RELIANCE.NS:0.5,TCS.NS:0.5". Weights must sum to 1.0.',
    )
    parser.add_argument("--start", metavar="YYYY-MM-DD", help="Backtest start date.")
    parser.add_argument(
        "--rebalance",
        choices=["none", "daily", "monthly", "quarterly"],
        default="none",
        help="Rebalancing frequency (default: none = buy-and-hold).",
    )
    args = parser.parse_args()

    if args.list:
        _print_ticker_table(get_available_tickers())
        return

    if args.search:
        _print_ticker_table(search_tickers(args.search))
        return

    if args.tickers and args.start:
        weights = _parse_weights_arg(args.tickers)
        assets = list(weights.keys())
        rebalance_frequency = None if args.rebalance == "none" else args.rebalance
        result = run_backtest(assets, weights, args.start, rebalance_frequency=rebalance_frequency)
        print_report(assets, weights, args.start, result, rebalance_frequency=rebalance_frequency)
        return

    if args.tickers or args.start:
        parser.error("--tickers and --start must be provided together.")

    # No CLI args: run the built-in demo across all rebalancing modes.
    start_date = "2023-01-15"
    weights = {
        "RELIANCE.NS": 0.30,
        "TCS.NS": 0.30,
        "HDFCBANK.NS": 0.20,
        "ICICIBANK.NS": 0.10,
        "INFY.NS": 0.10,
    }
    assets = list(weights.keys())

    for rebalance_frequency in (None, "monthly", "quarterly", "daily"):
        result = run_backtest(assets, weights, start_date, rebalance_frequency=rebalance_frequency)
        print_report(assets, weights, start_date, result, rebalance_frequency=rebalance_frequency)


if __name__ == "__main__":
    main()
