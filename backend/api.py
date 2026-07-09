"""
FastAPI layer over backtest_engine.py - the only way the React frontend
touches the Python backend. No business logic lives here; every endpoint is a
thin adapter that calls into backtest_engine.py and reshapes the result into
JSON the frontend can plot/table directly.

Run with:
    uvicorn api:app --reload --port 8000
"""

from datetime import datetime

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

import backtest_engine as be

app = FastAPI(title="Portfolio Terminal API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5180", "http://127.0.0.1:5180"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class BacktestRequest(BaseModel):
    weights: dict[str, float]  # ticker -> weight as a PERCENT (0-100), e.g. {"TCS.NS": 30}
    start_date: str  # YYYY-MM-DD
    rebalance_frequency: str | None = None  # None | "daily" | "monthly" | "quarterly"
    initial_investment: float = 10_000.0  # in rupees

    @field_validator("rebalance_frequency")
    @classmethod
    def _validate_rebalance(cls, v):
        if v not in be.REBALANCE_FREQUENCIES:
            raise ValueError(f"rebalance_frequency must be one of {be.REBALANCE_FREQUENCIES}")
        return v

    @field_validator("initial_investment")
    @classmethod
    def _validate_initial_investment(cls, v):
        if v <= 0:
            raise ValueError("initial_investment must be positive")
        return v


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "connected", "timestamp": datetime.now().isoformat(timespec="seconds")}


@app.get("/api/tickers")
def list_tickers(search: str | None = None):
    universe = be.get_available_tickers()
    if search:
        universe = be.search_tickers(search)
    return universe.to_dict(orient="records")


@app.post("/api/backtest")
def run_backtest(req: BacktestRequest):
    weights_frac = {t: w / 100.0 for t, w in req.weights.items()}

    try:
        be.validate_weights(weights_frac)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    try:
        result = be.run_backtest(
            assets=list(weights_frac.keys()),
            weights=weights_frac,
            start_date=req.start_date,
            rebalance_frequency=req.rebalance_frequency,
            initial_investment=req.initial_investment,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    wealth_df = result["wealth_df"]
    prices = result["prices"]
    horizon_results = result["horizon_results"]

    ticker_names = dict(
        zip(be.get_available_tickers()["ticker"], be.get_available_tickers()["name"])
    )

    # Full wealth timeline, chart-ready.
    timeline = [
        {
            "date": idx.strftime("%Y-%m-%d"),
            "portfolio": round(float(row["Custom_Portfolio"]), 2),
            "nifty": round(float(row[be.BENCHMARK_LABEL]), 2),
        }
        for idx, row in wealth_df.iterrows()
    ]

    # Per-asset breakdown for every horizon that has real data, so the frontend
    # can switch the 3M/6M/12M tab without another round trip.
    start_actual = pd.Timestamp(horizon_results["start_date_actual_trading_day"])
    asset_breakdown_by_horizon: dict[str, list] = {}
    for label, h in horizon_results["horizons"].items():
        if isinstance(h["portfolio_return"], str):
            asset_breakdown_by_horizon[label] = []
            continue
        end_actual = pd.Timestamp(h["actual_trading_day"])
        rows = []
        for ticker, w in weights_frac.items():
            p0 = float(prices.loc[start_actual, ticker])
            p1 = float(prices.loc[end_actual, ticker])
            ret = (p1 - p0) / p0
            rows.append(
                {
                    "ticker": ticker,
                    "name": ticker_names.get(ticker, ""),
                    "weightPct": round(w * 100, 4),
                    "standaloneReturnPct": round(ret * 100, 4),
                    "weightedContributionPct": round(ret * w * 100, 4),
                }
            )
        asset_breakdown_by_horizon[label] = rows

    return {
        "timeline": timeline,
        "startDateRequested": horizon_results["start_date_requested"],
        "startDateActual": horizon_results["start_date_actual_trading_day"],
        "lastAvailableDate": wealth_df.index.max().strftime("%Y-%m-%d"),
        "horizons": horizon_results["horizons"],
        "assetBreakdownByHorizon": asset_breakdown_by_horizon,
    }
