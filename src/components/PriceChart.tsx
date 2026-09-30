"use client";

import { useState } from "react";
import { AreaChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TechnicalIndicators } from "@/lib/types";

interface PriceChartProps {
  ticker: string;
  indicators: TechnicalIndicators;
  priceHistory?: { date: string; price: number }[];
}

export default function PriceChart({ ticker, indicators, priceHistory = [] }: PriceChartProps) {
  const [showSMA20, setShowSMA20] = useState(true);
  const [showSMA50, setShowSMA50] = useState(false);

  const rawData = priceHistory;
  const data = rawData.map((point, i) => {
    const s20 = rawData.slice(Math.max(0, i - 19), i + 1);
    const s50 = rawData.slice(Math.max(0, i - 49), i + 1);
    const sma20 = s20.length >= 20 ? Math.round((s20.reduce((a, b) => a + b.price, 0) / 20) * 100) / 100 : null;
    const sma50 = s50.length >= 50 ? Math.round((s50.reduce((a, b) => a + b.price, 0) / 50) * 100) / 100 : null;
    return { ...point, sma20, sma50 };
  });

  const isUp = data.length >= 2 ? data[data.length - 1].price >= data[0].price : true;

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="text-sm font-medium text-zinc-400 mb-4">Price History</h3>
        <div className="flex items-center justify-center h-[320px] text-zinc-500 text-sm">
          No price history available yet. Run the daily scraper to populate data.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-zinc-400">Price History</h3>
        <div className="flex gap-3 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showSMA20} onChange={() => setShowSMA20(!showSMA20)}
              className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/50" />
            <span className="text-zinc-400">SMA 20</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showSMA50} onChange={() => setShowSMA50(!showSMA50)}
              className="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500/50" />
            <span className="text-zinc-400">SMA 50</span>
          </label>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity={0.3} />
              <stop offset="95%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#71717a" }} tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11, fill: "#71717a" }} domain={["auto", "auto"]} tickFormatter={(v: number) => `₦${v}`} />
          <Tooltip
            contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px", fontSize: "12px" }}
            formatter={(value, name) => [`₦${Number(value).toLocaleString()}`, name === "price" ? "Close" : String(name)]}
            labelFormatter={(label) => String(label)}
          />
          <Area type="monotone" dataKey="price" stroke={isUp ? "#10b981" : "#ef4444"} fill="url(#colorPrice)" strokeWidth={2} />
          {showSMA20 && <Line type="monotone" dataKey="sma20" stroke="#3b82f6" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />}
          {showSMA50 && <Line type="monotone" dataKey="sma50" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="6 3" connectNulls />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
