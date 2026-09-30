"use client";

import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { buildAnalytics, computeSMA, computeRSI } from "@/lib/analytics";
import { FilterState, SortField, SortDirection, StockAnalytics, DailyPrice } from "@/lib/types";
import Header from "@/components/Header";
import FilterBar from "@/components/FilterBar";
import ScreenerTable from "@/components/ScreenerTable";
import QueryPanel from "@/components/QueryPanel";

interface PriceRow {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  close_price: number;
  open_price: number | null;
  high_price: number | null;
  low_price: number | null;
  prev_close: number | null;
  volume: number;
  market_cap: number | null;
  pe_ratio: number | null;
  dividend_yield: number | null;
  trade_date: string;
}

interface MetricsRow {
  ticker: string;
  sma_20: number | null;
  sma_50: number | null;
  rsi_14: number | null;
  setup_badge: string | null;
}

interface HistoryPoint {
  ticker: string;
  close_price: number;
  trade_date: string;
}

async function fetchAllData(): Promise<{ analytics: StockAnalytics[]; historyForCharts: Map<string, { date: string; price: number }[]> }> {
  const empty = { analytics: [] as StockAnalytics[], historyForCharts: new Map<string, { date: string; price: number }[]>() };
  if (!supabase) return empty;

  // 1. Fetch latest prices per ticker
  const { data: prices } = await supabase
    .from("daily_prices")
    .select("*")
    .order("trade_date", { ascending: false })
    .limit(200);

  if (!prices || prices.length === 0) return empty;

  // Deduplicate: keep only the latest row per ticker
  const latestByTicker = new Map<string, PriceRow>();
  for (const row of prices) {
    const t = row.ticker as string;
    if (!latestByTicker.has(t)) {
      latestByTicker.set(t, row as unknown as PriceRow);
    }
  }

  const tickers = [...latestByTicker.keys()];

  // 1b. company_name / sector live on `stocks`, not `daily_prices`.
  const { data: stockRows } = await supabase
    .from("stocks")
    .select("ticker, company_name, sector");
  const metaByTicker = new Map<string, { company_name: string | null; sector: string | null }>();
  if (stockRows) {
    for (const row of stockRows) {
      metaByTicker.set(row.ticker as string, {
        company_name: (row.company_name as string | null) ?? null,
        sector: (row.sector as string | null) ?? null,
      });
    }
  }

  // 1c. Previous close per ticker, for the day-change column.
  // daily_prices has no prev_close column, so derive it from the prior row.
  // `prices` is ordered trade_date DESC, so the 2nd row per ticker is the
  // previous trading day.
  const prevCloseByTicker = new Map<string, number>();
  {
    const rowsSeen = new Map<string, number>();
    for (const row of prices) {
      const t = row.ticker as string;
      const n = (rowsSeen.get(t) ?? 0) + 1;
      rowsSeen.set(t, n);
      if (n === 2) prevCloseByTicker.set(t, row.close_price as number);
    }
  }

  // 2. Fetch latest technical metrics for all tickers
  const { data: metricsRows } = await supabase
    .from("technical_metrics")
    .select("ticker, sma_20, sma_50, rsi_14, setup_badge")
    .order("calculated_at", { ascending: false })
    .limit(200);

  const metricsByTicker = new Map<string, MetricsRow>();
  if (metricsRows) {
    for (const row of metricsRows) {
      const t = row.ticker as string;
      if (!metricsByTicker.has(t)) {
        metricsByTicker.set(t, row as unknown as MetricsRow);
      }
    }
  }

  // 3. Fetch price history for SMA/RSI computation (last 60 days per ticker)
  const historyByTicker = new Map<string, number[]>();
  const { data: historyRows } = await supabase
    .from("daily_prices")
    .select("ticker, close_price, trade_date")
    .order("trade_date", { ascending: true })
    .limit(1000);

  if (historyRows) {
    for (const row of historyRows) {
      const t = row.ticker as string;
      if (!historyByTicker.has(t)) historyByTicker.set(t, []);
      historyByTicker.get(t)!.push(row.close_price as number);
    }
  }

  // 4. Build analytics for each ticker
  const results: StockAnalytics[] = [];
  for (const ticker of tickers) {
    const price = latestByTicker.get(ticker)!;
    const metrics = metricsByTicker.get(ticker);
    const history = historyByTicker.get(ticker) ?? [];

    // Compute indicators from history if metrics not in DB
    const sma20 = metrics?.sma_20 ?? computeSMA(history, 20);
    const sma50 = metrics?.sma_50 ?? computeSMA(history, 50);
    const rsi14 = metrics?.rsi_14 ?? computeRSI(history, 14);

    // Build a DailyPrice-shaped object for the analytics engine
    const meta = metaByTicker.get(ticker);
    const stock: DailyPrice = {
      id: ticker,
      ticker,
      company_name: meta?.company_name ?? null,
      sector: meta?.sector ?? null,
      trade_date: price.trade_date,
      close_price: price.close_price,
      open_price: price.open_price,
      high_price: price.high_price,
      low_price: price.low_price,
      prev_close: prevCloseByTicker.get(ticker) ?? null,
      volume: price.volume,
      market_cap: price.market_cap,
      high_52w: null,
      low_52w: null,
      dividend_yield: price.dividend_yield,
      pe_ratio: price.pe_ratio,
      currency: "NGN",
      source: "supabase",
      created_at: "",
      updated_at: "",
    };

    const analytics = buildAnalytics(stock, history);
    analytics.company_name = meta?.company_name ?? null;
    analytics.sector = meta?.sector ?? null;

    // Override with DB-computed badge if available
    if (metrics?.setup_badge) {
      const badgeMap: Record<string, { label: string; variant: "bullish" | "bearish" | "warning" | "neutral" }> = {
        BULLISH_REVERSAL: { label: "Bullish Reversal", variant: "bullish" },
        OVERBOUGHT_RISK: { label: "Overbought Risk", variant: "bearish" },
        CONSOLIDATING: { label: "Consolidating", variant: "neutral" },
        VALUE_PLAY: { label: "Value Play", variant: "bullish" },
        UPTREND: { label: "Uptrend", variant: "bullish" },
        DOWNTREND: { label: "Downtrend", variant: "bearish" },
        NEUTRAL: { label: "Neutral", variant: "neutral" },
      };
      const mapped = badgeMap[metrics.setup_badge];
      if (mapped) analytics.badges = [mapped];
    }

    results.push(analytics);
  }

  // Build history for mini charts (date + price pairs per ticker)
  const historyForCharts = new Map<string, { date: string; price: number }[]>();
  if (historyRows) {
    const byTicker = new Map<string, { date: string; price: number }[]>();
    for (const row of historyRows) {
      const t = row.ticker as string;
      if (!byTicker.has(t)) byTicker.set(t, []);
      byTicker.get(t)!.push({ date: row.trade_date as string, price: row.close_price as number });
    }
    for (const [t, pts] of byTicker) {
      historyForCharts.set(t, pts);
    }
  }

  return { analytics: results, historyForCharts };
}

export default function Home() {
  const [analyticsData, setAnalyticsData] = useState<StockAnalytics[]>([]);
  const [historyForCharts, setHistoryForCharts] = useState<Map<string, { date: string; price: number }[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({ search: "", sector: "", badge: "" });
  const [sortField, setSortField] = useState<SortField>("market_cap");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  useEffect(() => {
    fetchAllData().then(({ analytics, historyForCharts }) => {
      setAnalyticsData(analytics);
      setHistoryForCharts(historyForCharts);
      setLoading(false);
    });
  }, []);

  const sectors = useMemo(
    () => [...new Set(analyticsData.map((s) => s.sector).filter(Boolean))].sort() as string[],
    [analyticsData]
  );
  const allBadges = useMemo(
    () => [...new Set(analyticsData.flatMap((a) => a.badges.map((b) => b.label)))].sort(),
    [analyticsData]
  );

  const filtered = useMemo(() => {
    let result = analyticsData;

    if (filters.search) {
      const q = filters.search.toUpperCase();
      result = result.filter((s) => s.ticker.includes(q) || (s.company_name ?? "").toUpperCase().includes(q));
    }
    if (filters.sector) result = result.filter((s) => s.sector === filters.sector);
    if (filters.badge) result = result.filter((s) => s.badges.some((b) => b.label === filters.badge));

    result.sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;
      switch (sortField) {
        case "ticker": aVal = a.ticker; bVal = b.ticker;
          return sortDir === "asc" ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal as string);
        case "close_price": aVal = a.close_price; bVal = b.close_price; break;
        case "price_change_pct": aVal = a.indicators.price_change_pct; bVal = b.indicators.price_change_pct; break;
        case "volume": aVal = a.volume; bVal = b.volume; break;
        case "market_cap": aVal = a.market_cap ?? 0; bVal = b.market_cap ?? 0; break;
        case "rsi_14": aVal = a.indicators.rsi_14 ?? 50; bVal = b.indicators.rsi_14 ?? 50; break;
        default: aVal = 0; bVal = 0;
      }
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return result;
  }, [analyticsData, filters, sortField, sortDir]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Market Screener</h1>
          <p className="text-sm text-zinc-400 mt-1">Nigerian Exchange — Top cap stocks with technical indicators &amp; setup badges</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-zinc-400 text-sm animate-pulse">Loading market data from Supabase...</div>
          </div>
        ) : analyticsData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            {supabase ? (
              <>
                <div className="text-zinc-500 text-sm mb-2">No data available yet.</div>
                <div className="text-zinc-600 text-xs">Supabase is connected, but the tables are empty. Run the daily scraper to populate them.</div>
              </>
            ) : (
              <>
                <div className="text-amber-400 text-sm mb-2">Supabase is not configured for this deployment.</div>
                <div className="text-zinc-600 text-xs max-w-md">
                  NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY were missing at build
                  time, so the app has no database connection. Add them as environment variables
                  and redeploy.
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2 space-y-4">
              <FilterBar filters={filters} onFilterChange={setFilters} sectors={sectors} badges={allBadges} />
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span>{filtered.length} stocks</span>
                <span>·</span>
                <span>
                  Sorted by{" "}
                  <select value={sortField} onChange={(e) => setSortField(e.target.value as SortField)}
                    className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-100 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/50 [&>option]:bg-zinc-900 [&>option]:text-zinc-100">
                    <option value="market_cap">Market Cap</option>
                    <option value="close_price">Price</option>
                    <option value="price_change_pct">Change%</option>
                    <option value="volume">Volume</option>
                    <option value="rsi_14">RSI</option>
                  </select>
                  <button onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")} className="ml-1 text-zinc-300 hover:text-white">
                    {sortDir === "asc" ? "↑" : "↓"}
                  </button>
                </span>
              </div>
              <ScreenerTable data={filtered} historyByTicker={historyForCharts} />
            </div>
            <div className="lg:col-span-1">
              <QueryPanel />
            </div>
          </div>
        )}
      </main>
      <footer className="border-t border-zinc-800 py-6 text-center text-xs text-zinc-600">
        <p>NGX Pulse — Data updated as of market close. For informational purposes only.</p>
        <p className="mt-1">Intellectual property of Dabioluwa&reg;</p>
      </footer>
    </div>
  );
}
