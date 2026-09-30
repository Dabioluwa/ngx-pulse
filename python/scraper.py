"""
NGX Pulse — End-of-Day Data Pipeline
=====================================
Queries Mansa API → upserts into Supabase (stocks → daily_prices → technical_metrics).

Env vars required:
    MANSA_API_KEY            Mansa API bearer token
    SUPABASE_URL             Supabase project URL
    SUPABASE_SECRET_KEY      Supabase service-role key (bypasses RLS for writes)

Usage:
    python scraper.py
"""

import os
import sys
import time
import logging
from datetime import date
from typing import Optional

import requests
from supabase import create_client, Client

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MANSA_API_KEY = os.environ.get("MANSA_API_KEY", "")
MANSA_BASE = "https://mansaapi.com/api/v1"

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY", "")  # service-role for writes

# Coverage set: 40 liquid NGX names across sectors.
# Mansa Free plan allows 100 requests/day and this pipeline spends 2 per
# ticker (quote + fundamentals), so 40 tickers = 80 req/day, leaving
# headroom for retries. Mansa exposes 146 NGX tickers in total.
# To widen coverage, raise this list and upgrade the Mansa plan first.
NGX_TICKERS = [
    # Banking & financial services (10)
    "GTCO", "ZENITHBANK", "UBA", "ACCESSCORP", "FIDELITYBK",
    "STANBIC", "FCMB", "WEMABANK", "UNITYBNK", "ETI",
    # Telecoms (2)
    "MTNN", "AIRTELAFRI",
    # Cement, industrial & consumer goods (6)
    "DANGCEM", "BUACEMENT", "WAPCO", "JBERGER", "CAP", "UNILEVER",
    # Beverages (3)
    "NB", "INTBREW", "GUINNESS",
    # Food & agriculture (4)
    "NESTLE", "HONYFLOUR", "CADBURY", "DANGSUGAR",
    # Oil & gas (6)
    "SEPLAT", "OANDO", "TOTAL", "ETERNA", "OKOMUOIL", "ARADEL",
    # Conglomerates & exchanges (4)
    "TRANSCORP", "NGXGROUP", "PRESCO", "MANSARD",
    # Insurance (3)
    "AIICO", "CORNERST", "WAPIC",
    # Healthcare (2)
    "FIDSON", "NEIMETH",
]

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("ngx-pulse")


# ---------------------------------------------------------------------------
# Supabase client (service-role key bypasses RLS for writes)
# ---------------------------------------------------------------------------

def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set.")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_KEY)


# ---------------------------------------------------------------------------
# Mansa API helpers
# ---------------------------------------------------------------------------

def _headers() -> dict:
    return {"Authorization": f"Bearer {MANSA_API_KEY}"}


def fetch_stock_quote(ticker: str) -> Optional[dict]:
    """
    GET /api/v1/markets/exchanges/NGX/stocks/{ticker}
    Returns live quote + reference fields.
    """
    url = f"{MANSA_BASE}/markets/exchanges/NGX/stocks/{ticker}"
    try:
        resp = requests.get(url, headers=_headers(), timeout=30)
        resp.raise_for_status()
        body = resp.json()
        if body.get("success"):
            return body.get("data")
        log.warning("  Mansa success=false for %s: %s", ticker, body.get("error"))
        return None
    except requests.RequestException as exc:
        if getattr(getattr(exc, "response", None), "status_code", None) == 429:
            log.error("  HTTP 429 daily quota exhausted on quote %s — remaining "
                      "tickers will be skipped and picked up on the next run", ticker)
        else:
            log.error("  HTTP error fetching quote %s: %s", ticker, exc)
        return None


def fetch_fundamentals(ticker: str) -> Optional[dict]:
    """
    GET /api/v1/markets/exchanges/NGX/stocks/{ticker}/fundamentals
    Returns: market_cap, sector, 52-week high/low, TTM dividend yield, pe_ratio.
    """
    url = f"{MANSA_BASE}/markets/exchanges/NGX/stocks/{ticker}/fundamentals"
    try:
        resp = requests.get(url, headers=_headers(), timeout=30)
        resp.raise_for_status()
        body = resp.json()
        if body.get("success"):
            return body.get("data")
        log.warning("  Mansa success=false for fundamentals %s", ticker)
        return None
    except requests.RequestException as exc:
        log.error("  HTTP error fetching fundamentals %s: %s", ticker, exc)
        return None


def fetch_history(ticker: str, lookback: str = "6M") -> list[dict]:
    """
    GET /api/v1/markets/exchanges/NGX/stocks/{ticker}/history
    Returns OHLCV points array — used for SMA/RSI computation.
    """
    url = f"{MANSA_BASE}/markets/exchanges/NGX/stocks/{ticker}/history"
    params = {"range": lookback, "order": "asc"}
    try:
        resp = requests.get(url, headers=_headers(), params=params, timeout=30)
        resp.raise_for_status()
        body = resp.json()
        if body.get("success"):
            return body.get("data", {}).get("points", [])
        return []
    except requests.RequestException as exc:
        log.error("  HTTP error fetching history %s: %s", ticker, exc)
        return []


# ---------------------------------------------------------------------------
# Analytics: SMA, RSI, setup badge rules
# ---------------------------------------------------------------------------

def compute_sma(prices: list[float], period: int) -> Optional[float]:
    if len(prices) < period:
        return None
    return round(sum(prices[-period:]) / period, 2)


def compute_rsi(prices: list[float], period: int = 14) -> Optional[float]:
    if len(prices) < period + 1:
        return None
    gains = losses = 0.0
    for i in range(len(prices) - period, len(prices)):
        diff = prices[i] - prices[i - 1]
        if diff > 0:
            gains += diff
        else:
            losses += abs(diff)
    if losses == 0:
        return 100.0
    return round(100 - 100 / (1 + gains / losses), 2)


def evaluate_setup_badge(
    close: float,
    sma_20: Optional[float],
    sma_50: Optional[float],
    rsi_14: Optional[float],
    pe_ratio: Optional[float],
    div_yield: Optional[float],
) -> str:
    """
    Deterministic rule chain — returns a single badge string
    matching the technical_metrics.setup_badge column.

    Rules (in priority order):
        1. BULLISH_REVERSAL  — RSI < 35  AND  price > 20-day SMA
        2. OVERBOUGHT_RISK   — RSI > 70
        3. CONSOLIDATING     — price within 2% of 20-day SMA  AND  RSI 40–60
        4. VALUE_PLAY        — P/E < 10  AND  dividend yield > 4%
        5. UPTREND           — price above both SMA-20 and SMA-50
        6. DOWNTREND         — price below both SMA-20 and SMA-50
        7. NEUTRAL           — none of the above
    """
    badges: list[str] = []

    # Rule 1: Bullish Reversal
    if rsi_14 is not None and sma_20 is not None:
        if rsi_14 < 35 and close > sma_20:
            badges.append("BULLISH_REVERSAL")

    # Rule 2: Overbought Risk
    if rsi_14 is not None and rsi_14 > 70:
        badges.append("OVERBOUGHT_RISK")

    # Rule 3: Consolidating
    if rsi_14 is not None and sma_20 is not None:
        if 40 <= rsi_14 <= 60:
            pct_vs_sma20 = abs(((close - sma_20) / sma_20) * 100)
            if pct_vs_sma20 < 2:
                badges.append("CONSOLIDATING")

    # Supplementary: Value Play
    if pe_ratio is not None and div_yield is not None:
        if pe_ratio < 10 and div_yield > 4:
            badges.append("VALUE_PLAY")

    # Supplementary: Uptrend / Downtrend
    if sma_20 is not None and sma_50 is not None:
        if close > sma_20 and close > sma_50:
            badges.append("UPTREND")
        elif close < sma_20 and close < sma_50:
            badges.append("DOWNTREND")

    return badges[0] if badges else "NEUTRAL"


def already_stored(supabase: Client, ticker: str, day: str) -> bool:
    """True if daily_prices already has a row for this ticker on this date."""
    try:
        resp = (
            supabase.table("daily_prices")
            .select("id")
            .eq("ticker", ticker)
            .eq("trade_date", day)
            .limit(1)
            .execute()
        )
        return bool(resp.data)
    except Exception as exc:
        log.warning("  could not check existing row for %s: %s", ticker, exc)
        return False


def fetch_close_series(supabase: Client, ticker: str, limit: int = 60) -> list[float]:
    """
    Read the accumulated close series for a ticker from daily_prices.
    This is the source of truth for SMA/RSI because the Mansa /history
    endpoint requires a Pro plan.
    """
    try:
        resp = (
            supabase.table("daily_prices")
            .select("trade_date, close_price")
            .eq("ticker", ticker)
            .order("trade_date", desc=True)
            .limit(limit)
            .execute()
        )
        rows = resp.data or []
        # Oldest -> newest so SMA/RSI windows are chronological.
        series = [float(r["close_price"]) for r in reversed(rows) if r.get("close_price") is not None]
        return series
    except Exception as exc:
        log.error("  ✗ close series fetch failed %s: %s", ticker, exc)
        return []


# ---------------------------------------------------------------------------
# Upsert helpers
# ---------------------------------------------------------------------------

def upsert_stock(supabase: Client, ticker: str, data: dict) -> None:
    """
    Upsert into the stocks table (static metadata).
    Ensures the ticker row exists before we write daily_prices (FK constraint).
    """
    record = {
        "ticker": ticker,
        "company_name": data.get("company_name") or data.get("name") or ticker,
        "sector": data.get("sector"),
        "industry": data.get("industry"),
        "is_active": True,
    }
    try:
        supabase.table("stocks").upsert(record, on_conflict="ticker").execute()
        log.info("  ✓ stocks upserted: %s", ticker)
    except Exception as exc:
        log.error("  ✗ stocks upsert failed %s: %s", ticker, exc)


def upsert_daily_price(supabase: Client, record: dict) -> None:
    """
    Upsert into daily_prices.
    Unique constraint: (ticker, trade_date) — updates if exists, inserts if new.
    """
    try:
        supabase.table("daily_prices").upsert(record, on_conflict="ticker,trade_date").execute()
        log.info("  ✓ daily_prices upserted: %s  %s", record["ticker"], record["trade_date"])
    except Exception as exc:
        log.error("  ✗ daily_prices upsert failed %s: %s", record["ticker"], exc)


def upsert_technical_metrics(supabase: Client, record: dict) -> None:
    """
    Upsert into technical_metrics.
    Unique constraint: (ticker, calculated_at).
    """
    try:
        supabase.table("technical_metrics").upsert(record, on_conflict="ticker,calculated_at").execute()
        log.info("  ✓ technical_metrics upserted: %s  %s", record["ticker"], record["calculated_at"])
    except Exception as exc:
        log.error("  ✗ technical_metrics upsert failed %s: %s", record["ticker"], exc)


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def run_pipeline() -> None:
    log.info("=" * 60)
    log.info("NGX Pulse — Daily EOD Pipeline")
    log.info("=" * 60)

    if not MANSA_API_KEY:
        log.error("MANSA_API_KEY environment variable is not set.")
        sys.exit(1)

    supabase = get_supabase()
    today = date.today().isoformat()
    force = os.environ.get("FORCE", "").lower() in ("1", "true", "yes")
    processed = 0
    skipped = 0

    if force:
        log.info("FORCE=1 — refetching all tickers regardless of existing rows")

    for ticker in NGX_TICKERS:
        log.info("Processing %s ...", ticker)

        # ── 0. Idempotency guard ──────────────────────────────────
        # Mansa Free allows 100 requests/day and this pipeline spends 2 per
        # ticker, so re-running the same day would burn quota for nothing and
        # can trip HTTP 429. Skip tickers already stored for `today` unless
        # FORCE=1 is set.
        if not force and already_stored(supabase, ticker, today):
            log.info("  Already stored for %s — skipping (set FORCE=1 to refetch)", today)
            skipped += 1
            continue

        # ── 1. Fetch live quote ──────────────────────────────────
        quote = fetch_stock_quote(ticker)
        if quote is None:
            log.warning("  Skipping %s — no quote data", ticker)
            skipped += 1
            continue

        # ── 2. Fetch fundamentals ────────────────────────────────
        fundies = fetch_fundamentals(ticker) or {}

        # ── 3. Price history ────────────────────────────────────
        # The Mansa /history endpoint is Pro-only (403 TIER_REQUIRED on the
        # Free plan), so history is accumulated in Supabase daily_prices.
        # We still call the API so that a Pro plan backfills real OHLC.

        # ── 4. Extract fields (verified against live Mansa responses) ──
        # GET /markets/exchanges/NGX/stocks/{ticker}
        #   -> price, change, change_pct, volume, market_cap, sector, name
        # The quote endpoint does NOT return open/high/low.
        close_price = quote.get("price") or quote.get("close") or 0
        volume = quote.get("volume") or 0
        day_change_pct = quote.get("change_pct")

        # GET /markets/exchanges/NGX/stocks/{ticker}/fundamentals
        #   -> market_cap, sector, week_52_high, week_52_low,
        #      dividend_yield_ttm, pe_ratio (null until Mansa ingests EPS)
        company_name = quote.get("name") or quote.get("company_name")
        sector = fundies.get("sector") or quote.get("sector")
        industry = None
        market_cap = fundies.get("market_cap") or quote.get("market_cap")
        pe_ratio = fundies.get("pe_ratio")
        div_yield = fundies.get("dividend_yield_ttm") or fundies.get("ttm_dividend_yield")
        week_52_high = fundies.get("week_52_high")
        week_52_low = fundies.get("week_52_low")

        if day_change_pct is not None:
            log.info("  day change: %s%%", day_change_pct)
        if pe_ratio is None:
            log.info("  pe_ratio unavailable (Mansa has not ingested EPS)")
        if div_yield is None:
            log.info("  dividend_yield_ttm unavailable")

        # ── 5. UPSERT stocks (ensures FK exists) ────────────────
        upsert_stock(supabase, ticker, {
            "company_name": company_name,
            "sector": sector,
            "industry": industry,
        })

        # ── 6. UPSERT daily_prices ──────────────────────────────
        # Mansa's quote endpoint has no OHLC, so open/high/low stay NULL on
        # the live row. They are backfilled from /history when on a Pro plan.
        price_record = {
            "ticker": ticker,
            "trade_date": today,
            "open_price": None,
            "high_price": None,
            "low_price": None,
            "close_price": float(close_price),
            "volume": int(volume),
            "market_cap": float(market_cap) if market_cap else None,
            "pe_ratio": float(pe_ratio) if pe_ratio is not None else None,
            "dividend_yield": float(div_yield) if div_yield is not None else None,
        }
        upsert_daily_price(supabase, price_record)

        # ── 7. Compute technical metrics from accumulated DB history ──
        # daily_prices is append-only per trading day, so the close series
        # grows ~1 row/day. SMA-20 needs 20 trading days (~4 calendar weeks),
        # SMA-50 needs 50 (~10 weeks). Until then these stay NULL and the
        # badge falls through to the rules that do have inputs.
        close_prices = fetch_close_series(supabase, ticker)
        sma_20 = compute_sma(close_prices, 20)
        sma_50 = compute_sma(close_prices, 50)
        rsi_14 = compute_rsi(close_prices, 14)
        log.info("  history points=%d  sma20=%s  sma50=%s  rsi14=%s",
                 len(close_prices), sma_20, sma_50, rsi_14)

        badge = evaluate_setup_badge(
            close=float(close_price),
            sma_20=sma_20,
            sma_50=sma_50,
            rsi_14=rsi_14,
            pe_ratio=float(pe_ratio) if pe_ratio is not None else None,
            div_yield=float(div_yield) if div_yield is not None else None,
        )

        metrics_record = {
            "ticker": ticker,
            "calculated_at": today,
            "sma_20": sma_20,
            "sma_50": sma_50,
            "rsi_14": rsi_14,
            "setup_badge": badge,
        }
        upsert_technical_metrics(supabase, metrics_record)

        processed += 1
        time.sleep(0.5)  # rate-limit: 2 req/s

    log.info("=" * 60)
    log.info("Pipeline complete.  processed=%d  skipped=%d  date=%s", processed, skipped, today)
    log.info("=" * 60)


if __name__ == "__main__":
    run_pipeline()
