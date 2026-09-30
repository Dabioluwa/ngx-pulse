# NGX Pulse

Live screener for the Nigerian Exchange. Pulls end-of-day NGX data from the
[Mansa API](https://mansaapi.com), stores it in Supabase, and renders a sortable
market screener with technical indicators and setup badges.

No mock data, no AI-generated numbers. Every figure on screen comes from a
deterministic rule evaluated against stored EOD prices.

Live site: <https://ngx-pulse.netlify.app>

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Charts | Recharts |
| Database | Supabase (PostgreSQL) |
| Data source | Mansa API (NGX quotes + fundamentals) |
| ETL | Python 3.12 |
| Scheduling | GitHub Actions |
| Hosting | Netlify |

## Data flow

```
Mansa API  ──▶  python/scraper.py  ──▶  Supabase  ──▶  Next.js  ──▶  Browser
   (NGX EOD)      (indicators+badges)    PostgreSQL     (screener)
```

Every weekday after the NGX close, the pipeline fetches quotes and fundamentals,
computes SMA-20, SMA-50, and RSI-14 from accumulated closes, evaluates the badge
rules, and upserts into three tables:

| Table | Purpose |
|-------|---------|
| `stocks` | Company metadata (ticker, name, sector, industry) |
| `daily_prices` | EOD prices, volume, market cap, P/E, dividend yield |
| `technical_metrics` | SMA-20, SMA-50, RSI-14, setup badge |

The frontend reads those tables directly. There is no server-side aggregation
layer and no model in the request path.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full badge-rule walkthrough.

## Setup

### Requirements

- Node.js 20+
- Python 3.11+
- A Supabase project
- A Mansa API key

### 1. Install dependencies

```bash
npm install
pip install -r requirements.txt
```

### 2. Configure environment

Copy the template and fill in your values:

```bash
cp .env.local.example .env.local
```

`.env.local` is gitignored. Never commit it.

| Variable | Used by | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Next.js | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Next.js | Publishable key, browser-safe under RLS |
| `SUPABASE_URL` | Scraper | Same URL, server-side |
| `SUPABASE_SECRET_KEY` | Scraper | Service-role key, bypasses RLS for writes |
| `MANSA_API_KEY` | Scraper | Mansa API authentication |

The scraper runs in CI and never talks to the browser, so only the two
`NEXT_PUBLIC_` values ship to the frontend. Keep the secret key server-side.

> Note: newer Supabase dashboards label the anon key as
> `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Both names are supported; set whichever
> your provider issues.

### 3. Create the schema

Apply `supabase/schema.sql` in the Supabase SQL editor. It documents the
normalized three-table layout. It is safe to re-run.

Enable read access for the publishable key by adding an RLS policy on
`daily_prices`, `stocks`, and `technical_metrics` for the `anon` role, or the
frontend will render empty.

### 4. Run the scraper

```bash
python python/scraper.py
```

Ticker symbols must match Mansa exactly. Current set — 40 names across 9
sectors:

| Sector | Tickers |
|--------|---------|
| Banking | GTCO, ZENITHBANK, UBA, ACCESSCORP, FIDELITYBK, STANBIC, FCMB, WEMABANK, UNITYBNK, ETI |
| Telecoms | MTNN, AIRTELAFRI |
| Cement & industrial | DANGCEM, BUACEMENT, WAPCO, JBERGER, CAP, UNILEVER |
| Beverages | NB, INTBREW, GUINNESS |
| Food & agriculture | NESTLE, HONYFLOUR, CADBURY, DANGSUGAR |
| Oil & gas | SEPLAT, OANDO, TOTAL, ETERNA, OKOMUOIL, ARADEL |
| Conglomerates & exchanges | TRANSCORP, NGXGROUP, PRESCO, MANSARD |
| Insurance | AIICO, CORNERST, WAPIC |
| Healthcare | FIDSON, NEIMETH |

### 5. Start the app

```bash
npm run dev     # http://localhost:3000
npm run build   # production build
npm run start   # serve the production build
npm run lint
```

## Scheduled pipeline

`.github/workflows/daily-scrape.yml` runs at **19:00 WAT (18:00 UTC),
Monday–Friday**, and can also be triggered manually from the Actions tab.

Configure repository secrets under **Settings → Secrets and variables → Actions**:
`MANSA_API_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.

The job uses a concurrency group so runs cannot overlap and compete for the
Mansa daily quota.

### Request budget

The Free Mansa plan allows 100 requests per day, and the pipeline makes two
calls per ticker (quote + fundamentals). Forty tickers therefore consume 80 of
the 100 daily requests, leaving roughly 20 for retries. A run that hits HTTP 429
stops early; the next scheduled run picks up whatever it missed, because
already-stored dates are skipped.

To force a re-fetch of the current day:

```bash
FORCE=1 python python/scraper.py
```

## Technical indicators

Indicators are computed in Python from closes stored in Supabase, not fetched
from an upstream history endpoint — the Mansa history route requires a Pro plan
and returns `403 TIER_REQUIRED` on Free.

| Indicator | Minimum history |
|-----------|-----------------|
| RSI-14 | 15 closes |
| SMA-20 | 20 closes |
| SMA-50 | 50 closes |

Early in accumulation most metrics are `NULL` and every badge reads `NEUTRAL`.
That is expected until roughly 50 trading days have been collected. Badge rules
themselves are documented in [ARCHITECTURE.md](ARCHITECTURE.md).

## Natural-language queries

The screener ships with a deterministic query panel at `/api/query`. It parses a
ticker and an intent, then answers from Supabase. Try:

- `Is GTCO bullish?`
- `What's the RSI of MTNN?`
- `Price of ZENITHBANK`
- `How many stocks are oversold?`
- `help`

Responses are assembled from exact database values, so the panel cannot invent
numbers.

## Deployment

The app deploys to Netlify. Set two environment variables in the site settings
under **Site configuration → Environment variables**, applied to production
builds:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

```bash
npm run build
npx netlify deploy --build --prod
```

Because `NEXT_PUBLIC_` values are inlined at build time, a rebuild is required
after changing them. Verify the value landed correctly — a masked or truncated
URL silently produces an empty screener.

## Project layout

```
src/
  app/
    page.tsx                    screener
    stock/[ticker]/page.tsx     detail view
    api/query/route.ts          NL query endpoint
  components/                   table, chart, filters, query panel
  lib/
    supabase.ts                 client + fetch helpers
    queryEngine.ts              query parsing and responses
    analytics.ts                client-side badge rules
    types.ts                    shared types
python/
  scraper.py                    ETL pipeline
supabase/
  schema.sql                    database schema
.github/workflows/
  daily-scrape.yml              scheduled run
```

## Security

- `.env.local` is gitignored; `.env.local.example` contains placeholders only.
- Only `NEXT_PUBLIC_*` values reach the browser.
- The service-role key and Mansa key are needed only by the scraper, in CI.
- If a secret is ever pasted into chat, a commit, or a public file, rotate it in
  the provider dashboard and update GitHub secrets and `.env.local`.

## Notes and limitations

- GitHub disables scheduled workflows after 60 days of repository inactivity.
- OHLC values are `NULL` because the Mansa quote endpoint returns only last
  price, change, and volume.
- P/E is `NULL` for some tickers upstream, since Mansa reports no EPS.
- Screener table scrolls horizontally on narrow viewports.

## License

Private project. All rights reserved.