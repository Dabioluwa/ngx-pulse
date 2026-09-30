-- ============================================================
-- NGX Pulse — Supabase schema (reference)
--
-- This documents the schema that is ALREADY deployed on the
-- project. It is a reference, not a bootstrap script — the tables
-- already exist, so do NOT re-run the CREATE TABLE statements.
--
-- Verified against the live project on 2026-09-30.
-- ============================================================

-- 1. stocks — static company metadata (one row per ticker)
--    The frontend joins this for company_name / sector, because
--    those columns do NOT exist on daily_prices.
create table if not exists stocks (
  id           uuid primary key default gen_random_uuid(),
  ticker       text        not null,
  company_name text,
  sector       text,
  industry     text,
  is_active    boolean     default true,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),

  constraint uq_stocks_ticker unique (ticker)
);

-- 2. daily_prices — one row per ticker per trading day
--    Append-only. The Mansa quote endpoint returns no OHLC, so
--    open/high/low are NULL on live-inserted rows.
--    This table is the source of truth for SMA/RSI, because the
--    Mansa /history endpoint requires a Pro plan.
create table if not exists daily_prices (
  id             uuid primary key default gen_random_uuid(),
  ticker         text          not null references stocks(ticker),
  trade_date     date          not null,
  open_price     numeric(14,2),
  high_price     numeric(14,2),
  low_price      numeric(14,2),
  close_price    numeric(14,2) not null,
  volume         bigint,
  market_cap     numeric(20,2),
  pe_ratio       numeric(10,2),
  dividend_yield numeric(8,4),
  created_at     timestamptz   default now(),

  -- uniqueness constraint used by the ETL upsert
  constraint uq_daily_prices_ticker_date unique (ticker, trade_date)
);

create index if not exists idx_daily_prices_ticker     on daily_prices(ticker);
create index if not exists idx_daily_prices_trade_date on daily_prices(trade_date desc);

-- 3. technical_metrics — one row per ticker per calculation date
--    sma_20 / sma_50 / rsi_14 stay NULL until enough history has
--    accumulated (20 / 50 / 15 trading days respectively).
create table if not exists technical_metrics (
  id            uuid primary key default gen_random_uuid(),
  ticker        text          not null references stocks(ticker),
  calculated_at date          not null,
  sma_20        numeric(14,2),
  sma_50        numeric(14,2),
  rsi_14        numeric(6,2),
  setup_badge   text,
  created_at    timestamptz   default now(),

  constraint uq_technical_metrics_ticker_date unique (ticker, calculated_at)
);

create index if not exists idx_technical_metrics_ticker on technical_metrics(ticker);

-- ============================================================
-- Notes
-- ------------------------------------------------------------
-- * setup_badge is one of:
--     BULLISH_REVERSAL, OVERBOUGHT_RISK, CONSOLIDATING,
--     VALUE_PLAY, UPTREND, DOWNTREND, NEUTRAL
-- * RLS is enabled. Anonymous/authenticated roles may SELECT
--   (the site reads directly from the browser). All writes go
--   through the service-role key from the ETL pipeline.
-- * Columns that do NOT exist, and are derived in the app layer
--   instead: prev_close (2nd-most-recent daily_prices row),
--   high_52w / low_52w (Mansa week_52_high / week_52_low).
-- ============================================================
