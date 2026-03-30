import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import {
  DollarSign, TrendingUp, AlertTriangle, Briefcase, Package,
  ChevronDown, ChevronUp, Edit2, Check, X, BarChart2, Filter,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────
interface CostingSummary {
  totalJobs: number;
  totalRevenue: string;
  totalLaborCost: string;
  totalMaterialCost: string;
  totalTrueCost: string;
  totalGrossProfit: string;
  avgMargin: string;
  overallMargin: string;
  unprofitableJobs: number;
  breakdown: BreakdownItem[];
}

interface BreakdownItem {
  name: string;
  revenue: string;
  laborCost: string;
  materialCost?: string;
  grossProfit: string;
  margin: string;
  jobCount: number;
}

interface JobRow {
  id: number;
  jobNumber: string;
  customerName: string;
  serviceType: string;
  status: string;
  scheduledDate: string;
  revenue: string;
  laborCost: string;
  materialCost: string;
  grossProfit: string;
  margin: string | null;
  routeName: string | null;
  driverName: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: string | number | undefined) =>
  v !== undefined && v !== null
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(parseFloat(String(v)))
    : "—";

function marginColor(m: string | null) {
  if (!m) return "text-gray-400";
  const n = parseFloat(m);
  if (n < 0) return "text-red-600 font-semibold";
  if (n < 20) return "text-amber-600";
  if (n >= 40) return "text-green-600 font-semibold";
  return "text-gray-700";
}

function marginBg(m: string | null) {
  if (!m) return "bg-gray-100 text-gray-500";
  const n = parseFloat(m);
  if (n < 0) return "bg-red-100 text-red-700";
  if (n < 20) return "bg-amber-100 text-amber-700";
  if (n >= 40) return "bg-green-100 text-green-700";
  return "bg-blue-50 text-blue-700";
}

const SERVICE_LABELS: Record<string, string> = {
  portable_toilet: "Portable Toilet",
  septic: "Septic",
  roll_off: "Roll-Off",
  other: "Other",
};

// ─── Inline material cost editor ─────────────────────────────────────────────
function MaterialCostEditor({ job, onSaved }: { job: JobRow; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(parseFloat(job.materialCost ?? "0").toFixed(2));
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => apiRequest(`/api/jobs/${job.id}`, {
      method: "PATCH",
      body: JSON.stringify({ materialCost: parseFloat(value) }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/jobs"] });
      qc.invalidateQueries({ queryKey: ["/api/jobs/costing-summary"] });
      setEditing(false);
      onSaved();
      toast({ title: "✅ Material cost updated", description: `${job.jobNumber} — ${fmt(value)}` });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  if (!editing) return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1 text-right text-gray-600 hover:text-blue-600 transition-colors"
    >
      {fmt(job.materialCost)}
      <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 text-blue-400" />
    </button>
  );

  return (
    <div className="flex items-center gap-1 justify-end">
      <span className="text-gray-400 text-xs">$</span>
      <Input
        type="number"
        value={value}
        onChange={e => setValue(e.target.value)}
        className="w-24 h-7 text-xs text-right"
        autoFocus
        onKeyDown={e => { if (e.key === "Enter") mutation.mutate(); if (e.key === "Escape") setEditing(false); }}
      />
      <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
        className="p-1 text-green-600 hover:bg-green-50 rounded">
        <Check className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => setEditing(false)}
        className="p-1 text-gray-400 hover:bg-gray-100 rounded">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── P&L Breakdown Chart ──────────────────────────────────────────────────────
function PLChart({ breakdown }: { breakdown: BreakdownItem[] }) {
  const data = breakdown.slice(0, 8).map(b => ({
    name: b.name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    Revenue: parseFloat(b.revenue),
    Labor: parseFloat(b.laborCost),
    Material: parseFloat(b.materialCost ?? "0"),
    Profit: parseFloat(b.grossProfit),
  }));

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart2 className="w-4 h-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-gray-900">P&L by Service Type</h3>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            formatter={(v: number) => fmt(v)}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Revenue" fill="#3b82f6" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Labor" fill="#f59e0b" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Material" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Profit" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.Profit >= 0 ? "#22c55e" : "#ef4444"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Cost Breakdown Mini Bar ──────────────────────────────────────────────────
function CostBar({ revenue, labor, material }: { revenue: string; labor: string; material: string }) {
  const rev = parseFloat(revenue) || 1;
  const labPct = Math.min(100, (parseFloat(labor) / rev) * 100);
  const matPct = Math.min(100 - labPct, (parseFloat(material) / rev) * 100);
  const profPct = Math.max(0, 100 - labPct - matPct);
  return (
    <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-gray-100 mt-1">
      <div style={{ width: `${labPct}%` }} className="bg-amber-400" title={`Labor ${labPct.toFixed(0)}%`} />
      <div style={{ width: `${matPct}%` }} className="bg-purple-400" title={`Material ${matPct.toFixed(0)}%`} />
      <div style={{ width: `${profPct}%` }} className="bg-green-400" title={`Profit ${profPct.toFixed(0)}%`} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function JobCostingPage() {
  const qc = useQueryClient();
  const [profitFilter, setProfitFilter] = useState<"all" | "profitable" | "unprofitable">("all");
  const [serviceFilter, setServiceFilter] = useState("");
  const [groupBy, setGroupBy] = useState<"serviceType" | "customer" | "route">("serviceType");
  const [showChart, setShowChart] = useState(true);
  const [sortField, setSortField] = useState<"margin" | "revenue" | "grossProfit">("margin");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  // Summary + breakdown
  const { data: summary, isLoading: summaryLoading } = useQuery<CostingSummary>({
    queryKey: ["/api/jobs/costing-summary", dateFrom, dateTo, groupBy],
    queryFn: () =>
      fetch(`/api/jobs/costing-summary?dateFrom=${dateFrom}&dateTo=${dateTo}&groupBy=${groupBy}`)
        .then(r => r.json()).then(r => r.data),
  });

  // Jobs list
  const params = new URLSearchParams({ dateFrom, dateTo, limit: "200" });
  if (profitFilter === "unprofitable") params.set("profitability", "unprofitable");
  if (profitFilter === "profitable") params.set("profitability", "profitable");
  if (serviceFilter) params.set("serviceType", serviceFilter);

  const { data: jobsData, isLoading: jobsLoading } = useQuery<{ data: JobRow[] }>({
    queryKey: ["/api/jobs", dateFrom, dateTo, profitFilter, serviceFilter],
    queryFn: () => fetch(`/api/jobs?${params}`).then(r => r.json()),
  });

  const jobs = useMemo(() => {
    const list = jobsData?.data ?? [];
    return [...list].sort((a, b) => {
      const av = parseFloat(a[sortField] ?? "0");
      const bv = parseFloat(b[sortField] ?? "0");
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [jobsData, sortField, sortDir]);

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  }

  function SortIcon({ field }: { field: typeof sortField }) {
    if (sortField !== field) return <ChevronDown className="w-3 h-3 text-gray-300" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 text-blue-500" />
      : <ChevronDown className="w-3 h-3 text-blue-500" />;
  }

  const totalMat = parseFloat(summary?.totalMaterialCost ?? "0");
  const totalLab = parseFloat(summary?.totalLaborCost ?? "0");
  const totalRev = parseFloat(summary?.totalRevenue ?? "0");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Job Costing</h1>
          <p className="text-sm text-gray-500 mt-0.5">Real-time P&amp;L — revenue, labor, materials &amp; margins</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Summary KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard title="Total Revenue" value={totalRev} format="currency"
          icon={<DollarSign className="w-4 h-4" />} loading={summaryLoading} />
        <StatCard title="Labor Cost" value={totalLab} format="currency"
          icon={<TrendingUp className="w-4 h-4" />} loading={summaryLoading} />
        <StatCard title="Material Cost" value={totalMat} format="currency"
          icon={<Package className="w-4 h-4" />} loading={summaryLoading} />
        <StatCard title="Gross Profit" value={parseFloat(summary?.totalGrossProfit ?? "0")} format="currency"
          icon={<TrendingUp className="w-4 h-4" />} loading={summaryLoading} />
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col justify-between">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Avg Margin</p>
          {summaryLoading ? (
            <div className="h-7 w-16 bg-gray-100 animate-pulse rounded mt-1" />
          ) : (
            <>
              <p className={`text-2xl font-bold tabular-nums ${marginColor(summary?.avgMargin ?? null)}`}>
                {summary?.avgMargin ? `${parseFloat(summary.avgMargin).toFixed(1)}%` : "—"}
              </p>
              <div className="flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3 h-3 text-red-400" />
                <span className="text-xs text-red-500">{summary?.unprofitableJobs ?? 0} unprofitable</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Cost composition bar */}
      {!summaryLoading && totalRev > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Cost Composition</p>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />Labor {totalRev > 0 ? ((totalLab / totalRev) * 100).toFixed(1) : 0}%</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-purple-400 inline-block" />Material {totalRev > 0 ? ((totalMat / totalRev) * 100).toFixed(1) : 0}%</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-400 inline-block" />Profit {summary?.avgMargin ? parseFloat(summary.avgMargin).toFixed(1) : 0}%</span>
            </div>
          </div>
          <div className="h-3 w-full rounded-full overflow-hidden flex bg-gray-100">
            <div style={{ width: `${totalRev > 0 ? (totalLab / totalRev) * 100 : 0}%` }} className="bg-amber-400 transition-all" />
            <div style={{ width: `${totalRev > 0 ? (totalMat / totalRev) * 100 : 0}%` }} className="bg-purple-400 transition-all" />
            <div style={{ width: `${totalRev > 0 ? Math.max(0, parseFloat(summary?.avgMargin ?? "0")) : 0}%` }} className="bg-green-400 transition-all" />
          </div>
        </div>
      )}

      {/* Chart + Breakdown toggle */}
      <div className="flex items-center gap-3">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {(["serviceType", "customer", "route"] as const).map(g => (
            <button key={g} onClick={() => setGroupBy(g)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${groupBy === g ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              By {g === "serviceType" ? "Service" : g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={() => setShowChart(v => !v)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors">
          <BarChart2 className="w-3.5 h-3.5" />
          {showChart ? "Hide" : "Show"} Chart
        </button>
      </div>

      {/* P&L Chart */}
      {showChart && summary?.breakdown && summary.breakdown.length > 0 && (
        <PLChart breakdown={summary.breakdown} />
      )}

      {/* Breakdown table */}
      {summary?.breakdown && summary.breakdown.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Breakdown by {groupBy === "serviceType" ? "Service Type" : groupBy === "customer" ? "Customer" : "Route"}</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Jobs</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Revenue</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Labor</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Material</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Gross Profit</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Margin</th>
              </tr>
            </thead>
            <tbody>
              {summary.breakdown.map((b, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900 capitalize">{b.name.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2.5 text-center text-gray-500">{b.jobCount}</td>
                  <td className="px-4 py-2.5 text-right text-gray-900">{fmt(b.revenue)}</td>
                  <td className="px-4 py-2.5 text-right text-amber-700">{fmt(b.laborCost)}</td>
                  <td className="px-4 py-2.5 text-right text-purple-700">{fmt(b.materialCost ?? "0")}</td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    <span className={parseFloat(b.grossProfit) < 0 ? "text-red-600" : "text-gray-900"}>{fmt(b.grossProfit)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${marginBg(b.margin)}`}>
                      {parseFloat(b.margin).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Filters for jobs table */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {(["all", "profitable", "unprofitable"] as const).map(f => (
            <button key={f} onClick={() => setProfitFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${profitFilter === f ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <select value={serviceFilter} onChange={e => setServiceFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">All Service Types</option>
            {Object.entries(SERVICE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <p className="text-xs text-gray-400 ml-auto">
          Click <Edit2 className="w-3 h-3 inline" /> on any material cost to edit inline
        </p>
      </div>

      {/* Jobs table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {jobsLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading jobs…</div>
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center">
            <Briefcase className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No jobs found for the selected filters</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Job</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Service</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Route / Driver</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer select-none"
                  onClick={() => toggleSort("revenue")}>
                  <span className="flex items-center justify-end gap-1">Revenue <SortIcon field="revenue" /></span>
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Labor</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  <span className="flex items-center justify-end gap-1">
                    <Package className="w-3 h-3 text-purple-400" />Material
                  </span>
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer select-none"
                  onClick={() => toggleSort("grossProfit")}>
                  <span className="flex items-center justify-end gap-1">Gross Profit <SortIcon field="grossProfit" /></span>
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer select-none"
                  onClick={() => toggleSort("margin")}>
                  <span className="flex items-center justify-end gap-1">Margin <SortIcon field="margin" /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => {
                const isUnprofitable = job.margin !== null && parseFloat(job.margin) < 0;
                return (
                  <tr key={job.id} className={`border-b border-gray-50 last:border-0 ${isUnprofitable ? "bg-red-50/60" : "hover:bg-gray-50"}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{job.jobNumber}</p>
                      <p className="text-xs text-gray-400">{job.scheduledDate}</p>
                      <CostBar revenue={job.revenue} labor={job.laborCost} material={job.materialCost} />
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs">{job.customerName || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 capitalize">
                        {SERVICE_LABELS[job.serviceType] ?? job.serviceType?.replace(/_/g, " ") ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {job.routeName && <p>{job.routeName}</p>}
                      {job.driverName && <p className="text-gray-400">{job.driverName}</p>}
                      {!job.routeName && !job.driverName && "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium">{fmt(job.revenue)}</td>
                    <td className="px-4 py-3 text-right text-amber-700">{fmt(job.laborCost)}</td>
                    <td className="px-4 py-3 text-right">
                      <MaterialCostEditor job={job} onSaved={() => {
                        qc.invalidateQueries({ queryKey: ["/api/jobs"] });
                        qc.invalidateQueries({ queryKey: ["/api/jobs/costing-summary"] });
                      }} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      <span className={parseFloat(job.grossProfit) < 0 ? "text-red-600" : "text-gray-900"}>
                        {fmt(job.grossProfit)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${marginBg(job.margin)}`}>
                        {job.margin !== null ? `${parseFloat(job.margin).toFixed(1)}%` : "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
