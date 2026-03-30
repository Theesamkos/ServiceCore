import { cn } from "@/lib/utils";

const STATUS_CLASSES: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  completed: "bg-green-100 text-green-800",
  approved: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  warning: "bg-amber-100 text-amber-800",
  rejected: "bg-red-100 text-red-800",
  critical: "bg-red-100 text-red-800",
  terminated: "bg-red-100 text-red-700",
  in_progress: "bg-blue-100 text-blue-800",
  open: "bg-blue-100 text-blue-800",
  info: "bg-blue-100 text-blue-800",
  scheduled: "bg-gray-100 text-gray-600",
  inactive: "bg-gray-100 text-gray-600",
  closed: "bg-gray-100 text-gray-600",
  on_leave: "bg-gray-100 text-gray-600",
  calculated: "bg-purple-100 text-purple-800",
  exported: "bg-indigo-100 text-indigo-800",
  draft: "bg-gray-100 text-gray-600",
};

function toTitleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const classes = STATUS_CLASSES[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        classes,
        className,
      )}
    >
      {toTitleCase(status)}
    </span>
  );
}
