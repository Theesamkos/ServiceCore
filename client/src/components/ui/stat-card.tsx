import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: number | string;
  format?: "number" | "currency" | "hours" | "percentage";
  icon?: React.ReactNode;
  trend?: { direction: "up" | "down" | "stable"; value: string; label?: string };
  loading?: boolean;
  className?: string;
}

function formatValue(value: number | string, format?: StatCardProps["format"]): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return String(value);
  switch (format) {
    case "currency":
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
    case "hours":
      return `${n.toFixed(1)}h`;
    case "percentage":
      return `${n.toFixed(1)}%`;
    default:
      return n.toLocaleString();
  }
}

export function StatCard({ title, value, format, icon, trend, loading, className }: StatCardProps) {
  return (
    <div className={cn("bg-white rounded-lg border border-gray-200 p-5", className)}>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        {icon && <div className="text-gray-400">{icon}</div>}
      </div>
      {loading ? (
        <div className="mt-2 h-8 w-24 bg-gray-100 rounded animate-pulse" />
      ) : (
        <p className="mt-2 text-2xl font-semibold text-gray-900 tabular-nums">
          {formatValue(value, format)}
        </p>
      )}
      {trend && !loading && (
        <div className="mt-2 flex items-center gap-1">
          {trend.direction === "up" && <TrendingUp className="w-3.5 h-3.5 text-green-600" />}
          {trend.direction === "down" && <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
          {trend.direction === "stable" && <Minus className="w-3.5 h-3.5 text-gray-400" />}
          <span className={cn(
            "text-xs font-medium",
            trend.direction === "up" && "text-green-600",
            trend.direction === "down" && "text-red-500",
            trend.direction === "stable" && "text-gray-400",
          )}>
            {trend.value}
          </span>
          {trend.label && <span className="text-xs text-gray-400">{trend.label}</span>}
        </div>
      )}
    </div>
  );
}
