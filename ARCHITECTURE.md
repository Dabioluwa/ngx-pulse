# NGX Pulse — System Architecture

## How the Badge Engine Works

Here is the plain-text explanation of how the system receives a stock request and
outputs a technical setup badge like **Bullish Reversal** or **Consolidating**.

---

### Step 1: Pre-Job Data Preparation (Daily Pipeline)

Every weekday after the Nigerian Exchange closes, an automated Python script wakes
up on GitHub. It contacts the Mansa API to fetch the day's final prices for top
stocks like GTCO, Zenith Bank, and MTNN.

Before saving these numbers, the script computes standard technical formulas:

- **Moving Averages (20-day and 50-day SMA):** Calculates the average closing
  price over recent trading blocks to establish the baseline trend line.
- **Relative Strength Index (14-day RSI):** Computes recent gains versus losses
  on a scale of 0 to 100 to detect overbought or oversold pressure.

These raw prices and computed scores are written directly to the Supabase
PostgreSQL database across three tables:

| Table | Purpose |
|-------|---------|
| `stocks` | Static company metadata (ticker, name, sector) |
| `daily_prices` | EOD OHLCV + valuation metrics per ticker per day |
| `technical_metrics` | Pre-calculated SMA-20, SMA-50, RSI-14, setup badge |

---

### Step 2: The User Asks for a Stock Analysis

When a user opens the web dashboard and searches for or clicks on a ticker
(for example, GTCO), the web app sends a lightweight request to Supabase asking
for that stock's most recent technical metrics.

---

### Step 3: Deterministic Rule Evaluation

Instead of passing the numbers to an AI model, the system passes the database
numbers through an explicit chain of `if/else` conditions written in code:

| Rule | Condition | Badge |
|------|-----------|-------|
| **Bullish Reversal** | RSI < 35 **AND** price > 20-day SMA | `BULLISH_REVERSAL` |
| **Overbought Risk** | RSI > 70 | `OVERBOUGHT_RISK` |
| **Consolidating** | Price within 2% of 20-day SMA **AND** RSI 40–60 | `CONSOLIDATING` |
| Value Play | P/E < 10 **AND** dividend yield > 4% | `VALUE_PLAY` |
| Uptrend | Price above both SMA-20 and SMA-50 | `UPTREND` |
| Downtrend | Price below both SMA-20 and SMA-50 | `DOWNTREND` |
| None matched | — | `NEUTRAL` |

The same rules are enforced in two places:

- **Python** (`python/scraper.py` → `evaluate_setup_badge`) — writes the badge
  to `technical_metrics.setup_badge` during the daily pipeline.
- **TypeScript** (`src/lib/analytics.ts` → `evaluateBadges`) — evaluates the
  same rules client-side when rendering the dashboard from live Supabase data.

---

### Step 4: Instant Screen Rendering

The frontend application reads the evaluation result and immediately displays:

1. **The Visual Badge:** A color-coded status badge showing the exact condition
   (green for Bullish Reversal, yellow for Consolidating, red for Overbought
   Risk).
2. **The Dynamic Bullet Text:** A structured summary sentence populated with
   exact numbers directly from the database, for example:
   > "GTCO is consolidating with an RSI of 48.2, trading within 0.8% of its
   > ₦42.50 moving average."

Because this entire chain uses exact mathematical rules rather than AI
generation, the page loads instantly, costs nothing in API tokens, and never
hallucinates numbers.

---

## Data Flow Diagram

```
┌─────────────┐    ┌─────────────┐    ┌──────────────┐
│  Mansa API  │───▶│   Python    │───▶│   Supabase   │
│  (NGX EOD)  │    │  Scraper    │    │  PostgreSQL  │
└─────────────┘    └─────────────┘    └──────┬───────┘
                                             │
                                      ┌──────▼───────┐
                                      │   Next.js    │
                                      │   Frontend   │
                                      └──────┬───────┘
                                             │
                                      ┌──────▼───────┐
                                      │   Browser    │
                                      │  (Screener)  │
                                      └──────────────┘
```

## GitHub Actions Schedule

The scraper runs automatically at **19:00 WAT (18:00 UTC) Monday–Friday** via
`.github/workflows/daily-scrape.yml`. It can also be triggered manually from
the Actions tab.
