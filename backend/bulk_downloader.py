"""
Incremental bulk downloader - safe to re-run as often as you like (e.g. daily).

Reads Universe.csv (Name, BSE Code, NSE Code, Market Capitalization) and keeps
a local SQLite database (market_data.db) stocked with daily closing prices for
every listed company plus the Nifty 50 benchmark (^NSEI). The backtest engine
only ever reads from this database, so running a backtest never has to wait on
a live yfinance download.

Each ticker already in the database is topped up starting from the day after
its last stored date, instead of being re-downloaded from scratch - so a daily
re-run only fetches the handful of new trading days, not the whole history.
Tickers that have never been downloaded before still get the full 5-year
backfill. Tickers whose data is already current (last stored date >= today)
are skipped entirely with no network call.

Run:
    python bulk_downloader.py
"""

import sqlite3
import time
import logging
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
import yfinance as yf

_SCRIPT_DIR = Path(__file__).resolve().parent
CSV_PATH = str(_SCRIPT_DIR / "Universe.csv")
DB_PATH = str(_SCRIPT_DIR / "market_data.db")
BENCHMARK_TICKER = "^NSEI"
YEARS_LOOKBACK = 5
BATCH_SIZE = 100
BATCH_SLEEP_SECONDS = 1.5

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("bulk_downloader")


def load_universe(csv_path: str) -> pd.DataFrame:
    """
    Load the market-cap-filtered company list. Companies with an NSE code get
    ".NS" as their primary ticker (BSE, if present, is a fallback if the NSE
    download fails). Companies with NO NSE code but a valid BSE code are NOT
    dropped - they're downloaded directly via their BSE ".BO" ticker, which
    also becomes their canonical (permanent) ticker since there's no NSE
    equivalent. Only rows with neither code are excluded entirely.
    """
    df = pd.read_csv(csv_path)
    df = df.rename(
        columns={
            "Name": "name",
            "BSE Code": "bse_code",
            "NSE Code": "nse_code",
            "Market Capitalization": "market_cap",
        }
    )
    df["nse_code"] = df["nse_code"].fillna("").astype(str).str.strip()

    bse_numeric = pd.to_numeric(df["bse_code"], errors="coerce")
    df["bse_code"] = bse_numeric.apply(lambda x: "" if pd.isna(x) else str(int(x)))

    df = df[(df["nse_code"] != "") | (df["bse_code"] != "")].copy()

    df["primary_ticker"] = df["nse_code"].apply(lambda x: f"{x}.NS" if x else "")
    df["fallback_ticker"] = df["bse_code"].apply(lambda x: f"{x}.BO" if x else "")
    df["canonical_ticker"] = df.apply(
        lambda r: r["primary_ticker"] or r["fallback_ticker"], axis=1
    )
    return df.reset_index(drop=True)


def chunked(items, size):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def init_db(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS prices (
            date TEXT NOT NULL,
            ticker TEXT NOT NULL,
            close REAL,
            source TEXT,
            PRIMARY KEY (date, ticker)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_prices_ticker ON prices(ticker)")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS meta (
            ticker TEXT PRIMARY KEY,
            name TEXT,
            bse_code TEXT,
            nse_code TEXT,
            market_cap REAL,
            status TEXT,
            first_date TEXT,
            last_date TEXT,
            row_count INTEGER,
            last_updated TEXT
        )
        """
    )
    conn.commit()


def extract_close_series(raw: pd.DataFrame, ticker: str) -> pd.Series | None:
    """Pull a single ticker's Close column out of a (possibly multi-ticker) yf.download result."""
    try:
        if isinstance(raw.columns, pd.MultiIndex):
            if ticker not in raw.columns.get_level_values(0):
                return None
            series = raw[ticker]["Close"]
        else:
            # Single-ticker batch: columns are flat (Open, High, Low, Close, Volume)
            series = raw["Close"]
    except (KeyError, IndexError):
        return None

    series = series.dropna()
    if series.empty:
        return None
    return series


def download_batch(tickers: list[str], start: str, end: str) -> pd.DataFrame:
    return yf.download(
        tickers=tickers,
        start=start,
        end=end,
        auto_adjust=True,
        progress=False,
        threads=True,
        group_by="ticker",
    )


def store_series(conn: sqlite3.Connection, ticker: str, series: pd.Series, source: str) -> None:
    idx = pd.to_datetime(series.index).tz_localize(None)
    rows = [
        (d.strftime("%Y-%m-%d"), ticker, float(v), source)
        for d, v in zip(idx, series.values)
    ]
    conn.executemany(
        "INSERT OR REPLACE INTO prices (date, ticker, close, source) VALUES (?, ?, ?, ?)",
        rows,
    )


def get_last_dates(conn: sqlite3.Connection) -> dict[str, str]:
    """Latest stored date (YYYY-MM-DD) per ticker, straight from the prices table.

    Using the prices table (not meta) means this stays correct even if a
    ticker's canonical storage location changed (e.g. NSE -> BSE fallback).
    """
    rows = conn.execute("SELECT ticker, MAX(date) FROM prices GROUP BY ticker").fetchall()
    return {ticker: last_date for ticker, last_date in rows}


def next_start_date(last_date: str | None, default_start: str) -> str:
    """Day after `last_date`, or `default_start` if the ticker has no history yet."""
    if not last_date:
        return default_start
    return (datetime.strptime(last_date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")


def upsert_meta(
    conn: sqlite3.Connection,
    ticker: str,
    name: str,
    bse_code: str,
    nse_code: str,
    market_cap: float,
    status: str,
    series: pd.Series | None,
) -> None:
    # Recompute stats from the full prices table rather than trusting `series`
    # directly - on an incremental run `series` only holds the newly fetched
    # rows, so first_date/row_count would otherwise regress on every re-run.
    first_date, last_date, row_count = conn.execute(
        "SELECT MIN(date), MAX(date), COUNT(*) FROM prices WHERE ticker = ?", (ticker,)
    ).fetchone()
    row_count = row_count or 0

    conn.execute(
        """
        INSERT INTO meta (ticker, name, bse_code, nse_code, market_cap, status, first_date, last_date, row_count, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ticker) DO UPDATE SET
            name=excluded.name,
            bse_code=excluded.bse_code,
            nse_code=excluded.nse_code,
            market_cap=excluded.market_cap,
            status=excluded.status,
            first_date=excluded.first_date,
            last_date=excluded.last_date,
            row_count=excluded.row_count,
            last_updated=excluded.last_updated
        """,
        (
            ticker,
            name,
            bse_code,
            nse_code,
            market_cap,
            status,
            first_date,
            last_date,
            row_count,
            datetime.now().isoformat(timespec="seconds"),
        ),
    )


def bucket_by_start(
    tickers: list[str], last_dates: dict[str, str], default_start: str, end_date: str
) -> tuple[dict[str, list[str]], int]:
    """Group tickers by the start date they need fetching from.

    Tickers whose required start date is already past `end_date` (i.e. their
    stored data is current) are dropped entirely - no network call needed.
    Returns (buckets keyed by start-date string, count skipped as up-to-date).
    """
    buckets: dict[str, list[str]] = defaultdict(list)
    skipped = 0
    for ticker in tickers:
        ticker_start = next_start_date(last_dates.get(ticker), default_start)
        if ticker_start > end_date:
            skipped += 1
            continue
        buckets[ticker_start].append(ticker)
    return buckets, skipped


def main() -> None:
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=365 * YEARS_LOOKBACK)).strftime("%Y-%m-%d")

    log.info("Loading universe from %s", CSV_PATH)
    universe = load_universe(CSV_PATH)
    log.info("Loaded %d companies (min market cap filter already applied in CSV)", len(universe))

    conn = sqlite3.connect(DB_PATH)
    init_db(conn)

    last_dates = get_last_dates(conn)
    log.info("%d tickers already have stored history; only new dates will be fetched for them", len(last_dates))

    # --- Pass 1: primary NSE (.NS) tickers, plus the Nifty 50 benchmark ---
    records = universe.to_dict("records")
    has_nse = [r for r in records if r["primary_ticker"]]
    bse_only = [r for r in records if not r["primary_ticker"]]
    if bse_only:
        log.info(
            "%d companies have no NSE code and will be downloaded directly via BSE: %s",
            len(bse_only), ", ".join(r["name"] for r in bse_only),
        )

    primary_tickers = [r["primary_ticker"] for r in has_nse] + [BENCHMARK_TICKER]
    by_primary = {r["primary_ticker"]: r for r in has_nse}

    buckets, skipped = bucket_by_start(primary_tickers, last_dates, start_date, end_date)
    if skipped:
        log.info("Pass 1: %d tickers already up to date, skipped entirely", skipped)

    failed_primary: list[str] = []
    succeeded: set[str] = set()

    total_to_fetch = sum(len(v) for v in buckets.values())
    log.info("Pass 1: fetching %d tickers across %d start-date bucket(s)", total_to_fetch, len(buckets))

    for bucket_start, bucket_tickers in buckets.items():
        total_batches = (len(bucket_tickers) + BATCH_SIZE - 1) // BATCH_SIZE
        for batch_num, batch in enumerate(chunked(bucket_tickers, BATCH_SIZE), start=1):
            log.info(
                "Pass 1/2 - from %s - batch %d/%d (%d tickers)",
                bucket_start, batch_num, total_batches, len(batch),
            )
            try:
                raw = download_batch(batch, bucket_start, end_date)
            except Exception as exc:
                log.warning("Batch %d failed entirely: %s", batch_num, exc)
                failed_primary.extend(batch)
                continue

            for ticker in batch:
                series = extract_close_series(raw, ticker)
                if ticker == BENCHMARK_TICKER:
                    if series is None:
                        if ticker not in last_dates:
                            log.warning("Benchmark %s failed to download in this batch", ticker)
                            failed_primary.append(ticker)
                        # else: already has history, just nothing new (e.g. no new
                        # trading days yet) - not a failure, leave it as-is.
                    else:
                        store_series(conn, ticker, series, source="INDEX")
                        succeeded.add(ticker)
                    continue

                rec = by_primary[ticker]
                if series is None:
                    if ticker not in last_dates:
                        failed_primary.append(ticker)
                    else:
                        succeeded.add(ticker)
                else:
                    store_series(conn, ticker, series, source="NSE")
                    upsert_meta(
                        conn, ticker, rec["name"], rec["bse_code"], rec["nse_code"],
                        rec["market_cap"], "OK", series,
                    )
                    succeeded.add(ticker)

            conn.commit()
            time.sleep(BATCH_SLEEP_SECONDS)

    # ^NSEI is not part of `universe`, so it never needs a meta row, but log its outcome.
    if BENCHMARK_TICKER in failed_primary:
        log.error("Could not download benchmark %s - retrying alone", BENCHMARK_TICKER)
        try:
            retry_start = next_start_date(last_dates.get(BENCHMARK_TICKER), start_date)
            raw = download_batch([BENCHMARK_TICKER], retry_start, end_date)
            series = extract_close_series(raw, BENCHMARK_TICKER)
            if series is not None:
                store_series(conn, BENCHMARK_TICKER, series, source="INDEX")
                succeeded.add(BENCHMARK_TICKER)
                failed_primary.remove(BENCHMARK_TICKER)
        except Exception as exc:
            log.error("Benchmark retry failed: %s", exc)

    conn.commit()
    log.info(
        "Pass 1 complete: %d succeeded, %d failed and will be retried on BSE",
        len(succeeded), len(failed_primary),
    )

    # --- Pass 2: BSE (.BO) for anything that failed on NSE, plus companies that
    # never had an NSE code to begin with (bse_only) ---
    candidates = [by_primary[t] for t in failed_primary if t in by_primary] + bse_only
    fallback_records = [r for r in candidates if r["bse_code"]]
    no_bse_code = [r for r in candidates if not r["bse_code"]]

    still_failed: list[dict] = []
    for rec in no_bse_code:
        if rec["canonical_ticker"] not in last_dates:
            still_failed.append(rec)
            upsert_meta(
                conn, rec["canonical_ticker"], rec["name"], rec["bse_code"], rec["nse_code"],
                rec["market_cap"], "FAILED", None,
            )

    # Data ends up stored under `canonical_ticker`, not `fallback_ticker` (the
    # yfinance symbol), so bucket by the canonical ticker's stored history.
    fallback_buckets, fallback_skipped = bucket_by_start(
        [r["canonical_ticker"] for r in fallback_records], last_dates, start_date, end_date,
    )
    canonical_to_fb = {r["canonical_ticker"]: r["fallback_ticker"] for r in fallback_records}
    by_canonical = {r["canonical_ticker"]: r for r in fallback_records}
    if fallback_skipped:
        log.info("Pass 2: %d tickers already up to date, skipped entirely", fallback_skipped)

    for bucket_start, canonical_tickers in fallback_buckets.items():
        total_batches = (len(canonical_tickers) + BATCH_SIZE - 1) // BATCH_SIZE
        for batch_num, batch in enumerate(chunked(canonical_tickers, BATCH_SIZE), start=1):
            fb_batch = [canonical_to_fb[c] for c in batch]
            log.info(
                "Pass 2/2 - from %s - batch %d/%d (%d tickers)",
                bucket_start, batch_num, total_batches, len(batch),
            )
            try:
                raw = download_batch(fb_batch, bucket_start, end_date)
            except Exception as exc:
                log.warning("Fallback batch %d failed entirely: %s", batch_num, exc)
                for canonical_ticker in batch:
                    rec = by_canonical[canonical_ticker]
                    if canonical_ticker not in last_dates:
                        still_failed.append(rec)
                        upsert_meta(
                            conn, canonical_ticker, rec["name"], rec["bse_code"], rec["nse_code"],
                            rec["market_cap"], "FAILED", None,
                        )
                conn.commit()
                continue

            for canonical_ticker in batch:
                rec = by_canonical[canonical_ticker]
                fb_ticker = canonical_to_fb[canonical_ticker]
                series = extract_close_series(raw, fb_ticker)
                # A company with no NSE code was only ever attempted via BSE
                # (BSE_ONLY); one that HAD an NSE code but failed and landed
                # here recovered via the fallback (BSE_FALLBACK).
                had_nse = bool(rec["primary_ticker"])
                if series is None:
                    if canonical_ticker not in last_dates:
                        still_failed.append(rec)
                        upsert_meta(
                            conn, canonical_ticker, rec["name"], rec["bse_code"], rec["nse_code"],
                            rec["market_cap"], "FAILED", None,
                        )
                    # else: already has history, just nothing new this run - leave as-is.
                else:
                    source = "BSE_FALLBACK" if had_nse else "BSE_ONLY"
                    status = "OK_VIA_BSE" if had_nse else "OK_BSE_ONLY"
                    store_series(conn, canonical_ticker, series, source=source)
                    upsert_meta(
                        conn, canonical_ticker, rec["name"], rec["bse_code"], rec["nse_code"],
                        rec["market_cap"], status, series,
                    )

            conn.commit()
            time.sleep(BATCH_SLEEP_SECONDS)

    conn.commit()

    if still_failed:
        log.warning("%d tickers had no data on NSE or BSE and were skipped:", len(still_failed))
        for rec in still_failed:
            log.warning("  - %s (%s / %s)", rec["name"], rec["nse_code"], rec["bse_code"])

    total_ok = conn.execute("SELECT COUNT(*) FROM meta WHERE status LIKE 'OK%'").fetchone()[0]
    total_failed = conn.execute("SELECT COUNT(*) FROM meta WHERE status = 'FAILED'").fetchone()[0]
    log.info("Done. %d tickers stored successfully, %d permanently failed. DB: %s", total_ok, total_failed, DB_PATH)

    conn.close()


if __name__ == "__main__":
    main()
