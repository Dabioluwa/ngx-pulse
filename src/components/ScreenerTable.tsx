"use client";

import Link from "next/link";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { StockAnalytics } from "@/lib/types";
import StatusBadge from "./StatusBadge";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

function formatMarketCap(val: number | null): string {
  if (!val) return "—";
  if (val >= 1_000_000_000_000) return `₦${(val / 1_000_000_000_000).toFixed(1)}T`;
  if (val >= 1_000_000_000) return `₦${(val / 1_000_000_000).toFixed(1)}B`;
  return `₦${(val / 1_000_000).toFixed(1)}M`;
}

function MiniChart({ data }: { data: { date: string; price: number }[] }) {
  if (data.length === 0) return null;
  const isUp = data[data.length - 1].price >= data[0].price;
  return (
    <ResponsiveContainer width={80} height={28}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="price" stroke={isUp ? "#10b981" : "#ef4444"} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface ScreenerTableProps {
  data: StockAnalytics[];
  historyByTicker?: Map<string, { date: string; price: number }[]>;
}

export default function ScreenerTable({ data, historyByTicker }: ScreenerTableProps) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400 text-left text-xs">
              <th className="px-3 py-2 font-medium">Ticker</th>
              <th className="px-3 py-2 font-medium text-right">Price</th>
              <th className="px-3 py-2 font-medium text-right">Chg%</th>
              <th className="px-3 py-2 font-medium hidden sm:table-cell">30D</th>
              <th className="px-3 py-2 font-medium text-right hidden md:table-cell">Vol</th>
              <th className="px-3 py-2 font-medium text-right hidden lg:table-cell">Mkt Cap</th>
              <th className="px-3 py-2 font-medium text-right hidden lg:table-cell">RSI</th>
              <th className="px-3 py-2 font-medium">Setup</th>
            </tr>
          </thead>
          <tbody>
            {data.map((stock) => {
              const isUp = stock.indicators.price_change_pct >= 0;
              const chartData = historyByTicker?.get(stock.ticker)?.slice(-30) ?? [];
              return (
                <tr key={stock.ticker} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-3 py-2">
                    <Link href={`/stock/${stock.ticker}`} className="flex flex-col">
                      <span className="font-semibold text-white hover:text-emerald-400 transition-colors text-sm">{stock.ticker}</span>
                      <span className="text-[11px] text-zinc-500 truncate max-w-[110px]">{stock.company_name}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-white text-sm">₦{stock.close_price.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`inline-flex items-center gap-0.5 font-medium text-sm ${isUp ? "text-emerald-400" : "text-red-400"}`}>
                      {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {Math.abs(stock.indicators.price_change_pct).toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-3 py-2 hidden sm:table-cell"><MiniChart data={chartData} /></td>
                  <td className="px-3 py-2 text-right text-zinc-300 hidden md:table-cell text-sm">{(stock.volume / 1_000_000).toFixed(1)}M</td>
                  <td className="px-3 py-2 text-right text-zinc-300 hidden lg:table-cell text-sm">{formatMarketCap(stock.market_cap)}</td>
                  <td className="px-3 py-2 text-right font-mono hidden lg:table-cell text-sm">
                    {stock.indicators.rsi_14 !== null ? (
                      <span className={stock.indicators.rsi_14 > 70 ? "text-red-400" : stock.indicators.rsi_14 < 35 ? "text-emerald-400" : "text-zinc-300"}>
                        {stock.indicators.rsi_14.toFixed(1)}
                      </span>
                    ) : <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {stock.badges.map((b) => <StatusBadge key={b.label} badge={b} />)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.length === 0 && (
        <div className="px-4 py-12 text-center text-zinc-500">No stocks match the current filters.</div>
      )}
    </div>
  );
}
