import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

/**
 * createClient() throws on a malformed URL, which fails the entire build with
 * an opaque "Invalid supabaseUrl" error. Validate first so a missing or bad
 * value degrades to a null client (and the UI shows a clear message) instead.
 */
function buildClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. " +
        "The screener will render empty. Add them as build-time env vars and redeploy."
      );
    }
    return null;
  }
  if (!/^https?:\/\/.+/i.test(supabaseUrl)) {
    console.error(
      `[supabase] NEXT_PUBLIC_SUPABASE_URL is not a valid http(s) URL (got "${supabaseUrl}"). ` +
      "Check for stray quotes or whitespace in the environment variable."
    );
    return null;
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = buildClient();

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
 * Returns [] when Supabase env vars are missing or the query fails.
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
