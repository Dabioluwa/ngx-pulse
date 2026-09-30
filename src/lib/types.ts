export interface DailyPrice {
  id: string;
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
  created_at: string;
  updated_at: string;
}

export interface TechnicalIndicators {
  ticker: string;
  sma_20: number | null;
  sma_50: number | null;
  rsi_14: number | null;
  price_change_pct: number;
  price_vs_sma20: number | null;
  price_vs_sma50: number | null;
  position_in_52w_range: number;
}

export interface SetupBadge {
  label: string;
  variant: "bullish" | "bearish" | "warning" | "neutral";
}

export interface StockAnalytics {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  close_price: number;
  prev_close: number | null;
  volume: number;
  market_cap: number | null;
  high_52w: number | null;
  low_52w: number | null;
  dividend_yield: number | null;
  pe_ratio: number | null;
  trade_date: string;
  indicators: TechnicalIndicators;
  badges: SetupBadge[];
  summary: string[];
}

export type SortField =
  | "ticker"
  | "close_price"
  | "price_change_pct"
  | "volume"
  | "market_cap"
  | "rsi_14";

export type SortDirection = "asc" | "desc";

export interface FilterState {
  search: string;
  sector: string;
  badge: string;
}
