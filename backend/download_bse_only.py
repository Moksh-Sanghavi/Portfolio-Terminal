"""
One-off targeted downloader for companies that have NO NSE code but DO have
a BSE code - the set that load_universe() used to drop entirely. Downloads
just these ~16 companies via their .BO ticker instead of re-running the full
~1038-company bulk download.

Run:
    python download_bse_only.py
"""

import sqlite3
from datetime import datetime, timedelta

import bulk_downloader as bd


def main() -> None:
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=365 * bd.YEARS_LOOKBACK)).strftime("%Y-%m-%d")

    universe = bd.load_universe(bd.CSV_PATH)
    bse_only = [r for r in universe.to_dict("records") if not r["primary_ticker"]]

    if not bse_only:
        print("No BSE-only companies found - nothing to do.")
        return

    print(f"Downloading {len(bse_only)} BSE-only companies: "
          f"{', '.join(r['name'] for r in bse_only)}")

    conn = sqlite3.connect(bd.DB_PATH)
    bd.init_db(conn)

    tickers = [r["fallback_ticker"] for r in bse_only]
    by_ticker = {r["fallback_ticker"]: r for r in bse_only}

    raw = bd.download_batch(tickers, start_date, end_date)

    ok, failed = 0, []
    for ticker in tickers:
        rec = by_ticker[ticker]
        series = bd.extract_close_series(raw, ticker)
        canonical = rec["canonical_ticker"]
        if series is None:
            failed.append(rec["name"])
            bd.upsert_meta(
                conn, canonical, rec["name"], rec["bse_code"], rec["nse_code"],
                rec["market_cap"], "FAILED", None,
            )
        else:
            bd.store_series(conn, canonical, series, source="BSE_ONLY")
            bd.upsert_meta(
                conn, canonical, rec["name"], rec["bse_code"], rec["nse_code"],
                rec["market_cap"], "OK_BSE_ONLY", series,
            )
            ok += 1

    conn.commit()
    conn.close()

    print(f"Done. {ok} succeeded, {len(failed)} failed.")
    if failed:
        print("Failed:", ", ".join(failed))


if __name__ == "__main__":
    main()
