/**
 * NGX Pulse — Deterministic Stock Query Engine
 *
 * Parses free-text questions about NGX stocks, extracts the ticker and intent,
 * queries Supabase for exact numbers, and assembles a pre-written response.
 *
 * NO LLM. NO HALLUCINATIONS. Pure string matching + database lookups.
 */

import { supabase } from "./supabase";

// ─── Step 1: Text Normalization ──────────────────────────────────

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[?!.,;:'"()\[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");
}

// ─── Step 2: Entity Extraction (Spotting the Stock) ─────────────

const KNOWN_TICKERS = [
  // Banking & financial services
  "GTCO", "ZENITHBANK", "UBA", "ACCESSCORP", "FIDELITYBK",
  "STANBIC", "FCMB", "WEMABANK", "UNITYBNK", "ETI",
  // Telecoms
  "MTNN", "AIRTELAFRI",
  // Cement, industrial & consumer goods
  "DANGCEM", "BUACEMENT", "WAPCO", "JBERGER", "CAP", "UNILEVER",
  // Beverages
  "NB", "INTBREW", "GUINNESS",
  // Food & agriculture
  "NESTLE", "HONYFLOUR", "CADBURY", "DANGSUGAR",
  // Oil & gas
  "SEPLAT", "OANDO", "TOTAL", "ETERNA", "OKOMUOIL", "ARADEL",
  // Conglomerates, exchanges & insurance
  "TRANSCORP", "NGXGROUP", "PRESCO", "MANSARD", "AIICO", "CORNERST", "WAPIC",
  // Healthcare
  "FIDSON", "NEIMETH",
];

const ALIASES: Record<string, string> = {
  gtco: "GTCO",
  zenith: "ZENITHBANK",
  zenithbank: "ZENITHBANK",
  "zenith bank": "ZENITHBANK",
  mtn: "MTNN",
  mtnn: "MTNN",
  "mtn nigeria": "MTNN",
  dangote: "DANGCEM",
  dangotecem: "DANGCEM",
  "dangote cement": "DANGCEM",
  airtel: "AIRTELAFRI",
  bua: "BUACEMENT",
  buacement: "BUACEMENT",
  buacem: "BUACEMENT",
  "bua cement": "BUACEMENT",
  oando: "OANDO",
  access: "ACCESSCORP",
  "access bank": "ACCESSCORP",
  accesscorp: "ACCESSCORP",
  accessholdings: "ACCESSCORP",
  lafarge: "WAPCO",
  nestle: "NESTLE",
  seplat: "SEPLAT",
  nb: "NB",
  "nigerian breweries": "NB",
  fidelity: "FIDELITYBK",
  fidelitybank: "FIDELITYBK",
  uba: "UBA",
  "united bank": "UBA",
  flourmill: "HONYFLOUR",
  flourmills: "HONYFLOUR",
  "flour mills": "HONYFLOUR",
  honeywell: "HONYFLOUR",
  "honeywell flour": "HONYFLOUR",
  // Additional coverage
  stanbic: "STANBIC",
  "stanbic ibtc": "STANBIC",
  fcmb: "FCMB",
  wema: "WEMABANK",
  "wema bank": "WEMABANK",
  unity: "UNITYBNK",
  "unity bank": "UNITYBNK",
  eti: "ETI",
  ecobank: "ETI",
  julius: "JBERGER",
  "julius berger": "JBERGER",
  cap: "CAP",
  "chemical and allied": "CAP",
  unilever: "UNILEVER",
  international: "INTBREW",
  "international breweries": "INTBREW",
  guinness: "GUINNESS",
  cadbury: "CADBURY",
  "dangote sugar": "DANGSUGAR",
  dangsugar: "DANGSUGAR",
  total: "TOTAL",
  "totalenergies": "TOTAL",
  "total energies": "TOTAL",
  eterna: "ETERNA",
  okomu: "OKOMUOIL",
  "okomu oil": "OKOMUOIL",
  aradel: "ARADEL",
  transcorp: "TRANSCORP",
  "nigerian exchange": "NGXGROUP",
  "ngx group": "NGXGROUP",
  presco: "PRESCO",
  mansard: "MANSARD",
  "axa mansard": "MANSARD",
  aiico: "AIICO",
  cornerstone: "CORNERST",
  fidson: "FIDSON",
  neimeth: "NEIMETH",
};

function extractTicker(tokens: string[]): string | null {
  // Direct ticker match
  for (const token of tokens) {
    const upper = token.toUpperCase();
    if (KNOWN_TICKERS.includes(upper)) return upper;
  }

  // Alias match (check 2-word combos first, then single)
  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = `${tokens[i]} ${tokens[i + 1]}`;
    if (ALIASES[bigram]) return ALIASES[bigram];
  }
  for (const token of tokens) {
    if (ALIASES[token]) return ALIASES[token];
  }

  return null;
}

// ─── Step 3: Intent Classification ───────────────────────────────

export type QueryIntent =
  | "CHECK_TECHNICAL_SETUP"
  | "CHECK_RSI"
  | "CHECK_PRICE"
  | "CHECK_SMA"
  | "CHECK_BADGE"
  | "LIST_ALL"
  | "HELP"
  | "UNKNOWN";

const INTENT_RULES: [QueryIntent, string[]][] = [
  ["CHECK_TECHNICAL_SETUP", ["bullish", "bearish", "buy", "setup", "reversal", "trend", "signal", "trade", "green", "red", "good", "bad", "should i"]],
  ["CHECK_RSI", ["rsi", "overbought", "oversold", "momentum", "strength", "weak"]],
  ["CHECK_SMA", ["sma", "moving average", "average", "ma20", "ma50", "above average", "below average"]],
  ["CHECK_BADGE", ["badge", "status", "label", "flag", "marker"]],
  ["CHECK_PRICE", ["price", "cost", "value", "quote", "how much", "closing", "close", "opened", "open", "high", "low", "volume"]],
  ["LIST_ALL", ["all", "list", "show me", "every", "full list", "everything", "screener"]],
  ["HELP", ["help", "what can you", "how do i", "commands", "options"]],
];

function classifyIntent(tokens: string[]): QueryIntent {
  const joined = tokens.join(" ");
  for (const [intent, keywords] of INTENT_RULES) {
    for (const kw of keywords) {
      if (joined.includes(kw)) return intent;
    }
  }
  return "UNKNOWN";
}

// ─── Step 4: Database Lookup ─────────────────────────────────────

interface StockRow {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  close_price: number;
  open_price: number | null;
  high_price: number | null;
  low_price: number | null;
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
  calculated_at: string;
}

async function fetchLatest(ticker: string): Promise<{
  price: StockRow | null;
  metrics: MetricsRow | null;
}> {
  if (!supabase) return { price: null, metrics: null };

  const [priceRes, metricsRes] = await Promise.all([
    supabase
      .from("daily_prices")
      .select("*")
      .eq("ticker", ticker)
      .order("trade_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("technical_metrics")
      .select("*")
      .eq("ticker", ticker)
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    price: priceRes.data as StockRow | null,
    metrics: metricsRes.data as MetricsRow | null,
  };
}

async function fetchAllLatest(): Promise<StockRow[]> {
  if (!supabase) return [];

  const { data } = await supabase
    .from("daily_prices")
    .select("ticker, close_price, volume, trade_date")
    .order("trade_date", { ascending: false })
    .limit(50);

  return (data as StockRow[]) ?? [];
}

// ─── Step 5: Response Assembly ───────────────────────────────────

function fmt(n: number | null | undefined, prefix = "₦"): string {
  if (n == null) return "N/A";
  return `${prefix}${n.toLocaleString()}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "N/A";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function respondPrice(ticker: string, p: StockRow | null): string {
  if (!p) return `${ticker}: No price data found.`;

  const change = p.open_price
    ? ((p.close_price - p.open_price) / p.open_price) * 100
    : null;

  return [
    `**${ticker}** — ${p.trade_date}`,
    `Close: ${fmt(p.close_price)}`,
    p.open_price ? `Open: ${fmt(p.open_price)}` : null,
    p.high_price ? `High: ${fmt(p.high_price)}  Low: ${fmt(p.low_price)}` : null,
    `Volume: ${(p.volume / 1_000_000).toFixed(1)}M shares`,
    p.market_cap ? `Market Cap: ${fmt(p.market_cap / 1_000_000_000, "₦")}B` : null,
    change !== null ? `Day Change: ${fmtPct(change)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function respondRSI(ticker: string, p: StockRow | null, m: MetricsRow | null): string {
  if (!m?.rsi_14) return `${ticker}: RSI data not available yet.`;

  const rsi = m.rsi_14;
  let assessment: string;
  if (rsi > 70) assessment = "⚠️ Overbought — extended beyond normal momentum. Pullback risk elevated.";
  else if (rsi < 35) assessment = "🟢 Oversold — potential buying opportunity. Watch for reversal confirmation.";
  else assessment = "⚪ Neutral — momentum is balanced.";

  return [
    `**${ticker}** — RSI(14) Analysis`,
    `RSI: ${rsi.toFixed(1)}`,
    assessment,
    p ? `Current Price: ${fmt(p.close_price)}` : null,
    m.sma_20 ? `20-day SMA: ${fmt(m.sma_20)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function respondSMA(ticker: string, p: StockRow | null, m: MetricsRow | null): string {
  if (!m) return `${ticker}: SMA data not available yet.`;

  const lines: string[] = [`**${ticker}** — Moving Average Analysis`];

  if (p) lines.push(`Current Price: ${fmt(p.close_price)}`);

  if (m.sma_20) {
    const vs20 = p ? ((p.close_price - m.sma_20) / m.sma_20) * 100 : null;
    lines.push(`SMA-20: ${fmt(m.sma_20)}${vs20 !== null ? ` (${vs20 >= 0 ? "above" : "below"} by ${Math.abs(vs20).toFixed(1)}%)` : ""}`);
  }
  if (m.sma_50) {
    const vs50 = p ? ((p.close_price - m.sma_50) / m.sma_50) * 100 : null;
    lines.push(`SMA-50: ${fmt(m.sma_50)}${vs50 !== null ? ` (${vs50 >= 0 ? "above" : "below"} by ${Math.abs(vs50).toFixed(1)}%)` : ""}`);
  }

  if (m.sma_20 && m.sma_50) {
    if (m.sma_20 > m.sma_50) lines.push("SMA-20 is above SMA-50 — short-term trend is bullish.");
    else lines.push("SMA-20 is below SMA-50 — short-term trend is bearish.");
  }

  return lines.join("\n");
}

function respondSetup(ticker: string, p: StockRow | null, m: MetricsRow | null): string {
  if (!m) return `${ticker}: Technical metrics not available yet.`;

  const badge = m.setup_badge ?? "NEUTRAL";
  const badgeLabels: Record<string, string> = {
    BULLISH_REVERSAL: "🟢 Bullish Reversal",
    OVERBOUGHT_RISK: "🔴 Overbought Risk",
    CONSOLIDATING: "🟡 Consolidating",
    VALUE_PLAY: "🟢 Value Play",
    UPTREND: "🟢 Uptrend",
    DOWNTREND: "🔴 Downtrend",
    NEUTRAL: "⚪ Neutral",
  };

  const lines: string[] = [
    `**${ticker}** — Technical Setup`,
    `Badge: ${badgeLabels[badge] ?? badge}`,
  ];

  if (p) lines.push(`Price: ${fmt(p.close_price)}`);
  if (m.rsi_14 != null) lines.push(`RSI(14): ${m.rsi_14.toFixed(1)}`);
  if (m.sma_20 != null) lines.push(`SMA-20: ${fmt(m.sma_20)}`);
  if (m.sma_50 != null) lines.push(`SMA-50: ${fmt(m.sma_50)}`);

  // Deterministic explanation
  if (badge === "BULLISH_REVERSAL") {
    lines.push("");
    lines.push("RSI is below 35 (oversold) but price has recovered above the 20-day SMA — classic reversal setup.");
  } else if (badge === "OVERBOUGHT_RISK") {
    lines.push("");
    lines.push("RSI above 70 signals extended momentum. Consider taking profits or waiting for a pullback.");
  } else if (badge === "CONSOLIDATING") {
    lines.push("");
    lines.push("Price is coiling within 2% of the 20-day SMA with neutral RSI — waiting for a breakout direction.");
  } else if (badge === "UPTREND") {
    lines.push("");
    lines.push("Price is above both the 20-day and 50-day moving averages — bullish structure intact.");
  } else if (badge === "DOWNTREND") {
    lines.push("");
    lines.push("Price is below both moving averages — bearish structure. Avoid catching falling knives.");
  }

  return lines.join("\n");
}

function respondList(stocks: StockRow[]): string {
  if (stocks.length === 0) return "No stock data available. The daily pipeline may not have run yet.";

  const lines = ["**NGX Pulse — Latest Prices**", ""];
  for (const s of stocks) {
    lines.push(`• **${s.ticker}**: ${fmt(s.close_price)}  (${(s.volume / 1_000_000).toFixed(1)}M vol)`);
  }
  return lines.join("\n");
}

function respondHelp(): string {
  return [
    "**NGX Pulse — Query Examples**",
    "",
    "You can ask about any NGX stock using natural language:",
    "",
    '• "What is the price of GTCO?"',
    '• "Is Zenith Bank bullish?"',
    '• "Show me the RSI for MTNN"',
    '• "DANGCEM setup badge"',
    '• "How is SEPLAT trending?"',
    '• "List all stocks"',
    '• "What\'s the SMA for Access?"',
    "",
    "Supported tickers: " + KNOWN_TICKERS.join(", "),
  ].join("\n");
}

// ─── Public API ──────────────────────────────────────────────────

export async function processQuery(rawInput: string): Promise<string> {
  // Step 1: Normalize
  const tokens = normalize(rawInput);

  // Step 2: Extract ticker
  const ticker = extractTicker(tokens);

  // Step 3: Classify intent
  const intent = classifyIntent(tokens);

  // Step 4 + 5: Execute & assemble response
  switch (intent) {
    case "HELP":
      return respondHelp();

    case "LIST_ALL": {
      const all = await fetchAllLatest();
      return respondList(all);
    }

    case "CHECK_RSI": {
      if (!ticker) return "Which stock? Please include a ticker (e.g., GTCO, MTNN, ZENITHBANK).";
      const { price, metrics } = await fetchLatest(ticker);
      return respondRSI(ticker, price, metrics);
    }

    case "CHECK_SMA": {
      if (!ticker) return "Which stock? Please include a ticker (e.g., GTCO, MTNN, ZENITHBANK).";
      const { price, metrics } = await fetchLatest(ticker);
      return respondSMA(ticker, price, metrics);
    }

    case "CHECK_TECHNICAL_SETUP":
    case "CHECK_BADGE": {
      if (!ticker) return "Which stock? Please include a ticker (e.g., GTCO, MTNN, ZENITHBANK).";
      const { price, metrics } = await fetchLatest(ticker);
      return respondSetup(ticker, price, metrics);
    }

    case "CHECK_PRICE": {
      if (!ticker) return "Which stock? Please include a ticker (e.g., GTCO, MTNN, ZENITHBANK).";
      const { price } = await fetchLatest(ticker);
      return respondPrice(ticker, price);
    }

    case "UNKNOWN":
    default: {
      if (ticker) {
        // We found a ticker but unclear intent — default to setup badge
        const { price, metrics } = await fetchLatest(ticker);
        return respondSetup(ticker, price, metrics);
      }
      return [
        "I didn't catch a stock ticker or intent from your message.",
        "",
        'Try something like: "Is GTCO bullish?" or "Price of MTNN"',
        'Type "help" for a full list of examples.',
      ].join("\n");
    }
  }
}
