import { DailyPrice, TechnicalIndicators, SetupBadge, StockAnalytics } from "./types";

export function computeSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(prices.length - period);
  return Math.round((slice.reduce((a, b) => a + b, 0) / period) * 100) / 100;
}

export function computeRSI(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}

export function computeIndicators(
  stock: DailyPrice,
  priceHistory: number[]
): TechnicalIndicators {
  const sma20 = computeSMA(priceHistory, 20);
  const sma50 = computeSMA(priceHistory, 50);
  const rsi14 = computeRSI(priceHistory, 14);

  const priceChangePct =
    stock.prev_close && stock.prev_close > 0
      ? ((stock.close_price - stock.prev_close) / stock.prev_close) * 100
      : 0;

  const priceVsSma20 = sma20 !== null ? ((stock.close_price - sma20) / sma20) * 100 : null;
  const priceVsSma50 = sma50 !== null ? ((stock.close_price - sma50) / sma50) * 100 : null;

  const range52w = (stock.high_52w ?? 0) - (stock.low_52w ?? 0);
  const positionInRange =
    range52w > 0 ? ((stock.close_price - (stock.low_52w ?? 0)) / range52w) * 100 : 50;

  return {
    ticker: stock.ticker,
    sma_20: sma20,
    sma_50: sma50,
    rsi_14: rsi14,
    price_change_pct: Math.round(priceChangePct * 100) / 100,
    price_vs_sma20: priceVsSma20 !== null ? Math.round(priceVsSma20 * 100) / 100 : null,
    price_vs_sma50: priceVsSma50 !== null ? Math.round(priceVsSma50 * 100) / 100 : null,
    position_in_52w_range: Math.round(positionInRange * 100) / 100,
  };
}

export function evaluateBadges(
  stock: DailyPrice,
  indicators: TechnicalIndicators
): SetupBadge[] {
  const badges: SetupBadge[] = [];

  // Rule 1: Bullish Reversal — RSI < 35 AND price > 20-day SMA
  // Price has pulled back into oversold territory but is now recovering
  // above its short-term trend line.
  if (
    indicators.rsi_14 !== null &&
    indicators.rsi_14 < 35 &&
    indicators.sma_20 !== null &&
    stock.close_price > indicators.sma_20
  ) {
    badges.push({ label: "Bullish Reversal", variant: "bullish" });
  }

  // Rule 2: Overbought Risk — RSI > 70
  // Stock is extended beyond normal momentum; pullback risk elevated.
  if (indicators.rsi_14 !== null && indicators.rsi_14 > 70) {
    badges.push({ label: "Overbought Risk", variant: "bearish" });
  }

  // Rule 3: Consolidating — price within 2% of 20-day SMA AND RSI 40–60
  // Stock is coiling in a tight range around its short-term average.
  if (
    indicators.rsi_14 !== null &&
    indicators.rsi_14 >= 40 &&
    indicators.rsi_14 <= 60 &&
    indicators.price_vs_sma20 !== null &&
    Math.abs(indicators.price_vs_sma20) < 2
  ) {
    badges.push({ label: "Consolidating", variant: "neutral" });
  }

  // Supplementary: Value Play — low P/E + high dividend yield
  if (
    stock.pe_ratio !== null &&
    stock.pe_ratio < 10 &&
    stock.dividend_yield !== null &&
    stock.dividend_yield > 4
  ) {
    badges.push({ label: "Value Play", variant: "bullish" });
  }

  // Supplementary: Uptrend — price above both SMAs
  if (
    indicators.price_vs_sma20 !== null &&
    indicators.price_vs_sma50 !== null &&
    indicators.price_vs_sma20 > 0 &&
    indicators.price_vs_sma50 > 0
  ) {
    badges.push({ label: "Uptrend", variant: "bullish" });
  }

  // Supplementary: Downtrend — price below both SMAs
  if (
    indicators.price_vs_sma20 !== null &&
    indicators.price_vs_sma50 !== null &&
    indicators.price_vs_sma20 < 0 &&
    indicators.price_vs_sma50 < 0
  ) {
    badges.push({ label: "Downtrend", variant: "bearish" });
  }

  if (badges.length === 0) {
    badges.push({ label: "Neutral", variant: "neutral" });
  }

  return badges;
}

export function generateSummary(
  stock: DailyPrice,
  indicators: TechnicalIndicators
): string[] {
  const lines: string[] = [];

  const pctStr =
    indicators.price_change_pct >= 0
      ? `+${indicators.price_change_pct.toFixed(2)}%`
      : `${indicators.price_change_pct.toFixed(2)}%`;
  lines.push(
    `${stock.ticker} closed at ₦${stock.close_price.toLocaleString()} (${pctStr} day change).`
  );

  if (indicators.sma_20 !== null && indicators.price_vs_sma20 !== null) {
    const pos = stock.close_price > indicators.sma_20 ? "above" : "below";
    lines.push(
      `Price is ${pos} the 20-day SMA of ₦${indicators.sma_20.toLocaleString()} (by ${Math.abs(indicators.price_vs_sma20).toFixed(1)}%).`
    );
  }

  if (indicators.sma_50 !== null && indicators.price_vs_sma50 !== null) {
    const pos = stock.close_price > indicators.sma_50 ? "above" : "below";
    lines.push(
      `Price is ${pos} the 50-day SMA of ₦${indicators.sma_50.toLocaleString()} (by ${Math.abs(indicators.price_vs_sma50).toFixed(1)}%).`
    );
  }

  if (indicators.rsi_14 !== null) {
    if (indicators.rsi_14 > 70) {
      lines.push(`RSI is ${indicators.rsi_14.toFixed(1)} — overbought territory, caution advised.`);
    } else if (indicators.rsi_14 < 35) {
      lines.push(`RSI is ${indicators.rsi_14.toFixed(1)} — oversold territory, potential buying opportunity.`);
    } else {
      lines.push(`RSI is ${indicators.rsi_14.toFixed(1)} — neutral momentum.`);
    }
  }

  if (stock.high_52w !== null && stock.low_52w !== null) {
    lines.push(
      `Trading at ${indicators.position_in_52w_range.toFixed(0)}% of its 52-week range (₦${stock.low_52w.toLocaleString()} – ₦${stock.high_52w.toLocaleString()}).`
    );
  }

  if (stock.pe_ratio !== null) {
    lines.push(`P/E ratio is ${stock.pe_ratio.toFixed(1)}x.`);
  }
  if (stock.dividend_yield !== null) {
    lines.push(`Dividend yield is ${stock.dividend_yield.toFixed(1)}%.`);
  }
  if (stock.volume > 20_000_000) {
    lines.push(`High volume of ${(stock.volume / 1_000_000).toFixed(1)}M shares traded.`);
  }

  return lines;
}

export function buildAnalytics(
  stock: DailyPrice,
  priceHistory: number[]
): StockAnalytics {
  const indicators = computeIndicators(stock, priceHistory);
  const badges = evaluateBadges(stock, indicators);
  const summary = generateSummary(stock, indicators);

  return {
    ticker: stock.ticker,
    company_name: stock.company_name,
    sector: stock.sector,
    close_price: stock.close_price,
    prev_close: stock.prev_close,
    volume: stock.volume,
    market_cap: stock.market_cap,
    high_52w: stock.high_52w,
    low_52w: stock.low_52w,
    dividend_yield: stock.dividend_yield,
    pe_ratio: stock.pe_ratio,
    trade_date: stock.trade_date,
    indicators,
    badges,
    summary,
  };
}
