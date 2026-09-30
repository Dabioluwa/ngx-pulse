"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { FilterState } from "@/lib/types";

interface FilterBarProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  sectors: string[];
  badges: string[];
}

export default function FilterBar({ filters, onFilterChange, sectors, badges }: FilterBarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
      <div className="relative flex-1 w-full sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          placeholder="Search tickers..."
          value={filters.search}
          onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
          className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
        />
      </div>
      <div className="flex gap-2 items-center">
        <SlidersHorizontal className="w-4 h-4 text-zinc-500" />
        <select
          value={filters.sector}
          onChange={(e) => onFilterChange({ ...filters, sector: e.target.value })}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 [&>option]:bg-zinc-900 [&>option]:text-white"
        >
          <option value="">All Sectors</option>
          {sectors.map((s) => (<option key={s} value={s}>{s}</option>))}
        </select>
        <select
          value={filters.badge}
          onChange={(e) => onFilterChange({ ...filters, badge: e.target.value })}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 [&>option]:bg-zinc-900 [&>option]:text-white"
        >
          <option value="">All Setups</option>
          {badges.map((b) => (<option key={b} value={b}>{b}</option>))}
        </select>
      </div>
    </div>
  );
}
