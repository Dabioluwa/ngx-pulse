"use client";

import Link from "next/link";
import { Activity, TrendingUp } from "lucide-react";

export default function Header() {
  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <Activity className="w-6 h-6 text-emerald-500" />
          <span className="text-lg font-bold text-white tracking-tight">NGX Pulse</span>
          <span className="hidden sm:inline text-xs text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5 ml-1">BETA</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-zinc-400">
          <Link href="/" className="hover:text-white transition-colors flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4" />
            Screener
          </Link>
          <span className="text-zinc-600">|</span>
          <span className="text-xs text-zinc-600">Lagos · NGX</span>
        </nav>
      </div>
    </header>
  );
}
