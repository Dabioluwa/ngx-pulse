import { StockAnalytics } from "@/lib/types";
import { BarChart3, TrendingUp, Activity, DollarSign } from "lucide-react";

function MetricCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-center gap-2 text-zinc-500 text-xs mb-2">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function SummaryPanel({ stock }: { stock: StockAnalytics }) {
  const { indicators } = stock;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <MetricCard icon={DollarSign} label="Market Cap"
          value={stock.market_cap != null
            ? stock.market_cap >= 1_000_000_000_000
              ? `₦${(stock.market_cap / 1_000_000_000_000).toFixed(1)}T`
              : `₦${(stock.market_cap / 1_000_000_000).toFixed(1)}B`
            : "—"}
        />
        <MetricCard icon={BarChart3} label="Volume" value={`${(stock.volume / 1_000_000).toFixed(1)}M`} />
        <MetricCard icon={Activity} label="RSI (14)"
          value={indicators.rsi_14 !== null ? indicators.rsi_14.toFixed(1) : "—"}
          sub={indicators.rsi_14 !== null ? (indicators.rsi_14 > 70 ? "Overbought" : indicators.rsi_14 < 30 ? "Oversold" : "Neutral") : undefined}
        />
        <MetricCard icon={TrendingUp} label="52W Range"
          value={`${indicators.position_in_52w_range.toFixed(0)}%`}
          sub={stock.high_52w != null && stock.low_52w != null ? `₦${stock.low_52w.toLocaleString()} – ₦${stock.high_52w.toLocaleString()}` : undefined}
        />
      </div>
      {stock.pe_ratio !== null && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-xs text-zinc-500 mb-1">P/E Ratio</div>
          <div className="text-lg font-bold text-white">{stock.pe_ratio.toFixed(1)}x</div>
        </div>
      )}
      {stock.dividend_yield !== null && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-xs text-zinc-500 mb-1">Dividend Yield</div>
          <div className="text-lg font-bold text-emerald-400">{stock.dividend_yield.toFixed(1)}%</div>
        </div>
      )}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="text-xs text-zinc-500 mb-3">Analysis</div>
        <ul className="space-y-2">
          {stock.summary.map((line, i) => (
            <li key={i} className="text-sm text-zinc-300 leading-relaxed">{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
