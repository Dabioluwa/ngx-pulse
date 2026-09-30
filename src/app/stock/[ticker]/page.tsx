"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { buildAnalytics, computeSMA, computeRSI } from "@/lib/analytics";
import { StockAnalytics, DailyPrice } from "@/lib/types";
import Header from "@/components/Header";
import PriceChart from "@/components/PriceChart";
import SummaryPanel from "@/components/SummaryPanel";
import StatusBadge from "@/components/StatusBadge";
import { ArrowLeft, ArrowUpRight, ArrowDownRight } from "lucide-react";

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

export default function StockDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ticker = (params?.ticker as string)?.toUpperCase();

  const [analytics, setAnalytics] = useState<StockAnalytics | null>(null);
  const [priceHistory, setPriceHistory] = useState<{ date: string; price: number }[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticker) return;

    async function load() {
      if (!supabase || !ticker) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      // Fetch latest price
      const { data: priceRows } = await supabase
        .from("daily_prices")
        .select("*")
        .eq("ticker", ticker)
        .order("trade_date", { ascending: false })
        .limit(1);

      if (!priceRows || priceRows.length === 0) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const price = priceRows[0] as unknown as PriceRow;

      // Fetch latest metrics
      const { data: metricsRows } = await supabase
        .from("technical_metrics")
        .select("ticker, sma_20, sma_50, rsi_14, setup_badge")
        .eq("ticker", ticker)
        .order("calculated_at", { ascending: false })
        .limit(1);

      const metrics = (metricsRows?.[0] as unknown as MetricsRow) ?? null;

      // company_name / sector live on `stocks`, not `daily_prices`
      const { data: stockRows } = await supabase
        .from("stocks")
        .select("company_name, sector")
        .eq("ticker", ticker)
        .limit(1);
      const meta = (stockRows?.[0] as { company_name: string | null; sector: string | null } | undefined)
        ?? { company_name: null, sector: null };

      // Previous close (no prev_close column) from the row before the latest
      const { data: prevRows } = await supabase
        .from("daily_prices")
        .select("close_price")
        .eq("ticker", ticker)
        .order("trade_date", { ascending: false })
        .range(1, 1);
      const prevClose = (prevRows?.[0] as { close_price: number } | undefined)?.close_price ?? null;

      // Fetch history for chart + computation
      const { data: historyRows } = await supabase
        .from("daily_prices")
        .select("close_price, trade_date")
        .eq("ticker", ticker)
        .order("trade_date", { ascending: true })
        .limit(60);

      const history = (historyRows as { close_price: number }[] | null)
        ?.map((r) => r.close_price) ?? [];
      const chartPoints = (historyRows as { close_price: number; trade_date: string }[] | null)
        ?.map((r) => ({ date: r.trade_date, price: r.close_price })) ?? [];

      // Compute indicators
      const sma20 = metrics?.sma_20 ?? computeSMA(history, 20);
      const sma50 = metrics?.sma_50 ?? computeSMA(history, 50);
      const rsi14 = metrics?.rsi_14 ?? computeRSI(history, 14);

      const stock: DailyPrice = {
        id: ticker,
        ticker,
        company_name: meta.company_name,
        sector: meta.sector,
        trade_date: price.trade_date,
        close_price: price.close_price,
        open_price: price.open_price,
        high_price: price.high_price,
        low_price: price.low_price,
        prev_close: prevClose,
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

      const result = buildAnalytics(stock, history);

      // Override badge from DB
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
        if (mapped) result.badges = [mapped];
      }

      setAnalytics(result);
      setPriceHistory(chartPoints);
      setLoading(false);
    }

    load();
  }, [ticker]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-16 text-center">
          <div className="text-zinc-400 text-sm animate-pulse">Loading {ticker}...</div>
        </main>
      </div>
    );
  }

  if (notFound || !analytics) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Stock Not Found</h1>
          <p className="text-zinc-400 mb-6">No data for &quot;{ticker}&quot; in the database.</p>
          <button onClick={() => router.push("/")} className="text-emerald-400 hover:text-emerald-300 text-sm">
            ← Back to Screener
          </button>
        </main>
      </div>
    );
  }

  const isUp = analytics.indicators.price_change_pct >= 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Screener
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold">{analytics.ticker}</h1>
              <div className="flex gap-1.5">
                {analytics.badges.map((b) => <StatusBadge key={b.label} badge={b} />)}
              </div>
            </div>
            <p className="text-zinc-400 text-sm">{analytics.company_name} · {analytics.sector}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold font-mono">₦{analytics.close_price.toLocaleString()}</div>
            <div className={`flex items-center justify-end gap-1 text-sm font-medium ${isUp ? "text-emerald-400" : "text-red-400"}`}>
              {isUp ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              {isUp ? "+" : ""}{analytics.indicators.price_change_pct.toFixed(2)}% today
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <PriceChart ticker={ticker} indicators={analytics.indicators} priceHistory={priceHistory} />
          </div>
          <div className="lg:col-span-2">
            <SummaryPanel stock={analytics} />
          </div>
        </div>
      </main>
    </div>
  );
}
