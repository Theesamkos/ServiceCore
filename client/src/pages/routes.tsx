import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RouteForm } from "@/components/routes/route-form";
import { RouteDetail } from "@/components/routes/route-detail";
import { Plus, Loader2 } from "lucide-react";
import { format } from "date-fns";
import type { Route, Employee } from "@shared/schema";

type EnrichedRoute = Route & {
  driverName: string | null;
  laborCost: string;
  revenue: string;
  margin: string | null;
};

interface RoutesResp {
  data: EnrichedRoute[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const ZONES = ["North", "South", "East", "West", "Downtown", "Highway"];
const STATUSES = ["scheduled", "in_progress", "completed", "cancelled"];

function fmtCurrency(v: string | number) {
  return `$${parseFloat(String(v)).toFixed(2)}`;
}

function marginColor(margin: string | null): string {
  if (!margin) return "text-gray-500";
  const n = parseFloat(margin);
  if (n > 50) return "text-green-600 font-medium";
  if (n >= 30) return "text-gray-700";
  if (n >= 0) return "text-amber-600";
  return "text-red-600 font-bold";
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function fmtDate(s: string) {
  return format(new Date(s + "T12:00:00"), "MMM d, yyyy");
}

export default function RoutesPage() {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [zoneFilter, setZoneFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [detailRouteId, setDetailRouteId] = useState<number | null>(null);

  const params = new URLSearchParams({ date: selectedDate });
  if (zoneFilter !== "all") params.set("zone", zoneFilter);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (driverFilter !== "all") params.set("assignedDriverId", driverFilter);
  params.set("limit", "50");

  const { data: routesData, isLoading } = useQuery<RoutesResp>({
    queryKey: ["/api/routes", selectedDate, zoneFilter, statusFilter, driverFilter],
    queryFn: () => apiRequest(`/api/routes?${params}`),
  });

  const { data: driversData } = useQuery<{ data: Employee[] }>({
    queryKey: ["/api/employees", "drivers-active"],
    queryFn: () => apiRequest("/api/employees?role=driver&status=active&limit=100"),
  });

  const routes = routesData?.data ?? [];
  const drivers = driversData?.data ?? [];

  // Summary stats
  const totalRoutes = routes.length;
  const inProgress = routes.filter(r => r.status === "in_progress").length;
  const completed = routes.filter(r => r.status === "completed").length;
  const marginsWithValues = routes.filter(r => r.margin !== null).map(r => parseFloat(r.margin!));
  const avgMargin = marginsWithValues.length > 0
    ? (marginsWithValues.reduce((s, m) => s + m, 0) / marginsWithValues.length).toFixed(1)
    : null;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Routes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage daily service routes and stops</p>
        </div>
        <Button onClick={() => setFormOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Route
        </Button>
      </div>

      {/* Date + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="w-40"
        />
        <Select value={zoneFilter} onValueChange={setZoneFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Zones" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Zones</SelectItem>
            {ZONES.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map(s => (
              <SelectItem key={s} value={s}>{s.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={driverFilter} onValueChange={setDriverFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Drivers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Drivers</SelectItem>
            {drivers.map(d => (
              <SelectItem key={d.id} value={String(d.id)}>{d.firstName} {d.lastName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Routes", value: String(totalRoutes) },
          { label: "In Progress", value: String(inProgress) },
          { label: "Completed", value: String(completed) },
          { label: "Avg Margin", value: avgMargin !== null ? `${avgMargin}%` : "—" },
        ].map(stat => (
          <div key={stat.label} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{stat.label}</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : routes.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-sm text-gray-500">No routes scheduled for {fmtDate(selectedDate)}</p>
            <Button onClick={() => setFormOpen(true)} variant="outline" size="sm" className="gap-1.5">
              <Plus className="w-4 h-4" /> Add Route
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {["Route Name", "Zone", "Driver", "Stops", "Est. Hours", "Status", "Labor Cost", "Revenue", "Margin %", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {routes.map(route => {
                  const stopsProgress = route.totalStops > 0
                    ? `${route.completedStops}/${route.totalStops}`
                    : "—";
                  const stopsPct = route.totalStops > 0
                    ? (route.completedStops / route.totalStops) * 100
                    : 0;

                  return (
                    <tr key={route.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">{route.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        {route.zone ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-blue-200 text-blue-700">
                            {route.zone}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {route.driverName
                          ? <span className="text-gray-900">{route.driverName}</span>
                          : <span className="italic text-gray-400 text-xs">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-700">{stopsProgress}</span>
                          {route.totalStops > 0 && (
                            <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${stopsPct}%` }} />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {parseFloat(route.estimatedHours).toFixed(1)}h
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={route.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-700">{fmtCurrency(route.laborCost)}</td>
                      <td className="px-4 py-3 text-gray-700">{fmtCurrency(route.revenue)}</td>
                      <td className="px-4 py-3">
                        <span className={marginColor(route.margin)}>
                          {route.margin !== null ? `${route.margin}%` : "N/A"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-3 text-xs"
                          onClick={() => setDetailRouteId(route.id)}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RouteForm open={formOpen} onClose={() => setFormOpen(false)} />

      {detailRouteId !== null && (
        <RouteDetail
          routeId={detailRouteId}
          open={detailRouteId !== null}
          onClose={() => setDetailRouteId(null)}
        />
      )}
    </div>
  );
}
