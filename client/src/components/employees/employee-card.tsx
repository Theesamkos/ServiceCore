import type { Employee } from "@shared/schema";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

const DEPT_AVATAR_COLORS: Record<string, string> = {
  operations: "bg-blue-100 text-blue-700",
  maintenance: "bg-amber-100 text-amber-700",
  admin: "bg-gray-100 text-gray-700",
};

const CDL_BADGE: Record<string, { label: string; classes: string }> = {
  A: { label: "CDL Class A", classes: "bg-blue-100 text-blue-700" },
  B: { label: "CDL Class B", classes: "bg-blue-100 text-blue-700" },
  permit: { label: "CDL Permit", classes: "bg-amber-100 text-amber-700" },
  expired: { label: "CDL Expired", classes: "bg-red-100 text-red-700" },
};

interface EmployeeCardProps {
  employee: Employee;
  onEdit: (employee: Employee) => void;
}

export function EmployeeCard({ employee, onEdit }: EmployeeCardProps) {
  const initials = `${employee.firstName[0]}${employee.lastName[0]}`.toUpperCase();
  const avatarColor = DEPT_AVATAR_COLORS[employee.department ?? ""] ?? "bg-gray-100 text-gray-700";

  // CDL expiry check
  let cdlBadge: { label: string; classes: string } | null = null;
  if (employee.hasCdl && employee.cdlClass) {
    if (employee.cdlExpiry) {
      const expiry = new Date(employee.cdlExpiry);
      const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / 86400_000);
      if (daysLeft < 0) {
        cdlBadge = CDL_BADGE["expired"];
      } else if (daysLeft < 60) {
        cdlBadge = { label: `CDL ${employee.cdlClass} – Exp. Soon`, classes: "bg-amber-100 text-amber-700" };
      } else {
        cdlBadge = CDL_BADGE[employee.cdlClass] ?? null;
      }
    } else {
      cdlBadge = CDL_BADGE[employee.cdlClass] ?? null;
    }
  }

  const hireDateFormatted = employee.hireDate
    ? format(new Date(employee.hireDate + "T12:00:00"), "MMM d, yyyy")
    : "—";

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${avatarColor}`}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {employee.firstName} {employee.lastName}
          </p>
          <p className="text-xs text-gray-500 capitalize">{employee.role}</p>
          <p className="text-xs text-gray-400">{employee.employeeNumber}</p>
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        <StatusBadge status={employee.status} />
        {cdlBadge && (
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cdlBadge.classes}`}>
            {cdlBadge.label}
          </span>
        )}
      </div>

      {/* Info rows */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Rate</span>
          <span className="text-gray-900 font-medium">${employee.hourlyRate}/hr</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Department</span>
          <span className="text-gray-900 capitalize">{employee.department ?? "—"}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Hired</span>
          <span className="text-gray-900">{hireDateFormatted}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t border-gray-100">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          onClick={() => onEdit(employee)}
        >
          Edit
        </Button>
      </div>
    </div>
  );
}
