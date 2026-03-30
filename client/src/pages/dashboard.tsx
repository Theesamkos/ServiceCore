import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Users, Clock, DollarSign, AlertTriangle, FileCheck, MapPin,
  Activity, Bell, CheckCircle, XCircle, TrendingUp, Briefcase,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

interface DashboardStats {
  activeDrivers: number;
  totalDrivers: number;
  driversOnBreak: number;
  todayTotalHours: string;
  todayLaborCost: string;
  todayCompletedStops: number;
  todayTotalStops: number;
  weeklyTotalHours: string;
  weeklyOvertimeHours: string;
  weeklyLaborCost: string;
  pendingApprovals: number;
  unresolvedAlerts: number;
  criticalAlerts: number;
  recentActivity: {
    type: "clock_in" | "clock_out" | "approval" | "rejection" | "alert";
    description: string;
    timestamp: string;
    employeeName?: string;
  }[];
  activeRoutes: {
    id: number;
    name: string;
    driverName: string;
    progress: number;
    completedStops: number;
    totalStops: number;
    laborCost: string;
    revenue: string;
  }[];
  overtimeExposure: {
    employeeId: number;
    name: string;
    currentWeeklyHours: string;
    projectedWeeklyHours: string;
    status: "safe" | "approaching" | "exceeded";
  }[];
}

interface AlertItem {
  id: number;
  type: string;
  title: string;
  message: string;
  severity: string;
  resolved: number;
  createdAt: string;
}

function timeAgo(timestamp: string): string {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

function ProgressBar({ value, max = 100, className = "" }: { value: number; max?: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round(value / max * 100)) : 0;
  return (
    <div className={`h-2 bg-gray-200 rounded-full overflow-hidden ${className}`}>
      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-gray-100 rounded animate-pulse ${className}`} />;
}

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: statsData, isLoading } = useQuery<{ data: DashboardStats }>({
    queryKey: ["/api/dashboard/stats"],
    refetchInterval: 60000,
  });
  const stats = statsData?.data;

  const { data: alertsData } = useQuery<{ data: AlertItem[] }>({
    queryKey: ["/api/alerts", "unresolved"],
    queryFn: () => fetch("/api/alerts?resolved=false&limit=10").then(r => r.json()),
    refetchInterval: 60000,
  });
  const alerts = alertsData?.data ?? [];

  const resolveAlert = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/alerts/${id}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user?.id ?? 1 }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/alerts"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Alert resolved" });
    },

  });

  const fmtCurrency = (v: string | number | undefined) =>
    v !== undefined ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(parseFloat(String(v))) : "$0";

  const otHours = parseFloat(stats?.weeklyOvertimeHours ?? "0");
  const otTrend = otHours > 15
    ? { direction: "down" as const, value: "High OT" }
    : otHours > 5
    ? { direction: "down" as const, value: "Moderate OT" }
    : { direction: "up" as const, value: "On track" };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Row 1: Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-16" />
            </div>
          ))
        ) : (
          <>
            <StatCard
              title="Active Drivers"
              value={`${stats?.activeDrivers ?? 0}/${stats?.totalDrivers ?? 0}`}
              icon={<Users className="w-4 h-4" />}
            />
            <StatCard
              title="Today's Hours"
              value={parseFloat(stats?.todayTotalHours ?? "0")}
              format="hours"
              icon={<Clock className="w-4 h-4" />}
            />
            <StatCard
              title="Today's Labor"
              value={parseFloat(stats?.todayLaborCost ?? "0")}
              format="currency"
              icon={<DollarSign className="w-4 h-4" />}
            />
            <StatCard
              title="Weekly OT Hours"
              value={parseFloat(stats?.weeklyOvertimeHours ?? "0")}
              format="hours"
              icon={<AlertTriangle className={`w-4 h-4 ${otHours > 15 ? "text-red-500" : otHours > 5 ? "text-amber-500" : "text-green-500"}`} />}
              trend={otTrend}
              className={otHours > 15 ? "border-red-200" : otHours > 5 ? "border-amber-200" : ""}
            />
            <StatCard
              title="Pending Approvals"
              value={stats?.pendingApprovals ?? 0}
              icon={<FileCheck className={`w-4 h-4 ${(stats?.pendingApprovals ?? 0) > 0 ? "text-amber-500" : "text-gray-400"}`} />}
              className={(stats?.pendingApprovals ?? 0) > 0 ? "border-amber-200 bg-amber-50" : ""}
            />
            <StatCard
              title="Active Routes"
              value={`${stats?.todayCompletedStops ?? 0}/${stats?.todayTotalStops ?? 0} stops`}
              icon={<MapPin className="w-4 h-4" />}
            />
          </>
        )}
      </div>

      {/* Row 2: Active Routes + OT Exposure */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Routes */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-gray-900">Active Routes</h2>
            </div>
            {stats && (
              <span className="text-xs font-medium bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                {stats.activeRoutes.length}
              </span>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {isLoading ? (
              <div className="p-5 space-y-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : stats?.activeRoutes.length === 0 ? (
              <div className="p-8 text-center">
                <MapPin className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No active routes today</p>
              </div>
            ) : (
              stats?.activeRoutes.map(route => {
                const revenue = parseFloat(route.revenue);
                const labor = parseFloat(route.laborCost);
                const margin = revenue > 0 ? ((revenue - labor) / revenue * 100) : null;
                return (
                  <div
                    key={route.id}
                    onClick={() => navigate("/routes")}
                    className="px-5 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{route.name}</p>
                        <p className="text-xs text-gray-500">{route.driverName}</p>
                      </div>
                      <span className="text-xs text-gray-500 tabular-nums">
                        {route.completedStops}/{route.totalStops} stops
                      </span>
                    </div>
                    <ProgressBar value={route.completedStops} max={route.totalStops || 1} className="mb-1.5" />
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span>Labor: {fmtCurrency(route.laborCost)}</span>
                      <span>·</span>
                      <span>Revenue: {fmtCurrency(route.revenue)}</span>
                      {margin !== null && (
                        <>
                          <span>·</span>
                          <span className={margin >= 0 ? "text-green-600" : "text-red-600 font-medium"}>
                            {margin.toFixed(1)}% margin
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Overtime Exposure */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-900">Overtime Exposure</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {isLoading ? (
              <div className="p-5 space-y-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : !stats?.overtimeExposure.length ? (
              <div className="p-8 text-center">
                <CheckCircle className="w-8 h-8 text-green-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">All employees within normal hours</p>
              </div>
            ) : (
              stats.overtimeExposure.map(emp => {
                const currentH = parseFloat(emp.currentWeeklyHours);
                const statusConfig = {
                  safe: { dot: "bg-green-500", label: "Safe", color: "text-green-600" },
                  approaching: { dot: "bg-amber-500", label: "Approaching OT", color: "text-amber-600" },
                  exceeded: { dot: "bg-red-500", label: "OT Exceeded", color: "text-red-600 font-medium" },
                }[emp.status];
                return (
                  <div key={emp.employeeId} className="px-5 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="font-medium text-gray-900 text-sm">{emp.name}</p>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${statusConfig.dot}`} />
                        <span className={`text-xs ${statusConfig.color}`}>{statusConfig.label}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <ProgressBar value={currentH} max={40} className="flex-1" />
                      <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap">
                        {currentH.toFixed(1)}h
                        <span className="text-gray-400"> / ~{parseFloat(emp.projectedWeeklyHours).toFixed(1)}h proj</span>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Recent Activity + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
            <Activity className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {isLoading ? (
              <div className="p-5 space-y-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="w-6 h-6 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-2 w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : !stats?.recentActivity.length ? (
              <div className="p-8 text-center">
                <p className="text-sm text-gray-400">No recent activity</p>
              </div>
            ) : (
              stats.recentActivity.map((item, i) => {
                const iconMap = {
                  clock_in: <Clock className="w-4 h-4 text-blue-500" />,
                  clock_out: <Clock className="w-4 h-4 text-gray-400" />,
                  approval: <CheckCircle className="w-4 h-4 text-green-500" />,
                  rejection: <XCircle className="w-4 h-4 text-red-500" />,
                  alert: <AlertTriangle className="w-4 h-4 text-amber-500" />,
                };
                return (
                  <div key={i} className="flex items-start gap-3 px-5 py-3">
                    <div className="mt-0.5 shrink-0">{iconMap[item.type]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">{item.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{timeAgo(item.timestamp)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-gray-600" />
              <h2 className="text-sm font-semibold text-gray-900">Alerts</h2>
            </div>
            {alerts.length > 0 && (
              <span className="text-xs font-medium bg-red-50 text-red-600 px-2 py-0.5 rounded-full">
                {alerts.length} unresolved
              </span>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {alerts.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle className="w-8 h-8 text-green-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No unresolved alerts</p>
              </div>
            ) : (
              alerts.map(alert => (
                <div
                  key={alert.id}
                  className={`px-5 py-3 flex gap-3 ${
                    alert.severity === "critical"
                      ? "border-l-4 border-red-500"
                      : alert.severity === "warning"
                      ? "border-l-4 border-amber-500"
                      : ""
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {alert.severity === "critical" ? (
                      <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center">
                        <AlertTriangle className="w-3 h-3 text-red-600" />
                      </div>
                    ) : alert.severity === "warning" ? (
                      <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center">
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
                        <Bell className="w-3 h-3 text-blue-600" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{alert.title}</p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{alert.message}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{timeAgo(alert.createdAt)}</p>
                  </div>
                  <button
                    onClick={() => resolveAlert.mutate(alert.id)}
                    disabled={resolveAlert.isPending}
                    className="shrink-0 self-start text-xs border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 rounded px-2 py-1 transition-colors"
                  >
                    Resolve
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Timesheets", icon: Clock, href: "/timesheets", desc: "Approve time entries" },
          { label: "Employees", icon: Users, href: "/employees", desc: "Manage workforce" },
          { label: "Routes", icon: MapPin, href: "/routes", desc: "View active routes" },
          { label: "Payroll", icon: DollarSign, href: "/payroll", desc: "Process pay periods" },
        ].map(({ label, icon: Icon, href, desc }) => (
          <button
            key={href}
            onClick={() => navigate(href)}
            className="bg-white border border-gray-200 rounded-lg p-4 text-left hover:border-blue-200 hover:bg-blue-50 transition-colors group"
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700">{label}</span>
            </div>
            <p className="text-xs text-gray-400">{desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
