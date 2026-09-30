import { SetupBadge } from "@/lib/types";
import clsx from "clsx";

const variantStyles: Record<string, string> = {
  bullish: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  bearish: "bg-red-500/15 text-red-400 border-red-500/30",
  warning: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  neutral: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

export default function StatusBadge({ badge }: { badge: SetupBadge }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        variantStyles[badge.variant]
      )}
    >
      {badge.label}
    </span>
  );
}
