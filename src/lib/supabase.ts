import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export interface DailyPriceRow {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  trade_date: string;
  close_price: number;
  open_price: number | null;
  high_price: number | null;
  low_price: number | null;
  prev_close: number | null;
  volume: number;
  market_cap: number | null;
  high_52w: number | null;
  low_52w: number | null;
  dividend_yield: number | null;
  pe_ratio: number | null;
  currency: string;
  source: string;
}

/**
 * Fetch the latest price snapshot for all tracked tickers.
 * Falls back to mock data when Supabase is not configured.
 */
export async function fetchLatestPrices(): Promise<DailyPriceRow[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("daily_prices")
    .select("*")
    .order("trade_date", { ascending: false })
    .limit(200);

  if (error) {
    console.error("Supabase fetch error:", error.message);
    return [];
  }
  return (data as DailyPriceRow[]) ?? [];
}

/**
 * Fetch price history for a single ticker (for charts & SMA/RSI).
 */
export async function fetchPriceHistory(
  ticker: string,
  days: number = 60
): Promise<{ date: string; price: number }[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("daily_prices")
    .select("trade_date, close_price")
    .eq("ticker", ticker)
    .order("trade_date", { ascending: true })
    .limit(days);

  if (error) {
    console.error("History fetch error:", error.message);
    return [];
  }

  return ((data as { trade_date: string; close_price: number }[]) ?? []).map(
    (r) => ({ date: r.trade_date, price: r.close_price })
  );
}
