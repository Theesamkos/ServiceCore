import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, TrendingUp, AlertTriangle, Briefcase } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";

interface CostingSummary {
  totalJobs: number;
  totalRevenue: string;
  totalLaborCost: string;
  totalMaterialCost: string;
  totalGrossProfit: string;
  avgMargin: string;
  unprofitableJobs: number;
}

interface JobRow {
  id: number;
  name: string;
  jobNumber: string;
  customerName: string;
  serviceType: string;
  status: string;
  date: string;
  revenue: string;
  laborCost: string;
  materialCost: string;
  grossProfit: string;
  margin: string | null;
  routeName: string | null;
  driverName: string | null;
}

export default function JobCostingPage() {
  const [profitFilter, setProfitFilter] = useState<"all" | "profitable" | "unprofitable">("all");
  const [serviceFilter, setServiceFilter] = useState("");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  const { data: summary, isLoading: summaryLoading } = useQuery<CostingSummary>({
    queryKey: ["/api/jobs/costing-summary", dateFrom, dateTo],
    queryFn: () =>
      fetch(`/api/jobs/costing-summary?dateFrom=${dateFrom}&dateTo=${dateTo}`)
        .then(r => r.json())
        .then(r => r.data),
  });

  const params = new URLSearchParams({ dateFrom, dateTo, limit: "200" });
  if (profitFilter === "unprofitable") params.set("unprofitable", "true");
  if (serviceFilter) params.set("serviceType", serviceFilter);

  const { data: jobsData, isLoading: jobsLoading } = useQuery<{ data: JobRow[] }>({
    queryKey: ["/api/jobs", dateFrom, dateTo, profitFilter, serviceFilter],
    queryFn: () => fetch(`/api/jobs?${params}`).then(r => r.json()),
  });

  const jobs = jobsData?.data ?? [];

  const fmtCurrency = (v: string | undefined) =>
    v ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(parseFloat(v)) : "—";

  const marginColor = (m: string | null) => {
    if (!m) return "text-gray-400";
    const n = parseFloat(m);
    if (n < 0) return "text-red-600 font-semibold";
    if (n < 20) return "text-amber-600";
    if (n >= 40) return "text-green-600";
    return "text-gray-700";
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Job Costing</h1>
          <p className="text-sm text-gray-500 mt-0.5">P&L analysis by job</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Revenue"
          value={summary?.totalRevenue ?? 0}
          format="currency"
          icon={<DollarSign className="w-4 h-4" />}
          loading={summaryLoading}
        />
        <StatCard
          title="Gross Profit"
          value={summary?.totalGrossProfit ?? 0}
          format="currency"
          icon={<TrendingUp className="w-4 h-4" />}
          loading={summaryLoading}
        />
        <StatCard
          title="Avg Margin"
          value={summary?.avgMargin ?? 0}
          format="percentage"
          loading={summaryLoading}
        />
        <StatCard
          title="Unprofitable Jobs"
          value={summary?.unprofitableJobs ?? 0}
          icon={<AlertTriangle className="w-4 h-4" />}
          loading={summaryLoading}
          className={summary && summary.unprofitableJobs > 0 ? "border-red-200 bg-red-50" : ""}
        />
      </div>

      {/* Labor / material breakdown */}
      {summary && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="grid grid-cols-3 divide-x divide-gray-100">
            <div className="px-4 first:pl-0">
              <p className="text-xs text-gray-500">Total Labor Cost</p>
              <p className="text-lg font-semibold text-gray-900 mt-0.5">{fmtCurrency(summary.totalLaborCost)}</p>
            </div>
            <div className="px-4">
              <p className="text-xs text-gray-500">Total Material Cost</p>
              <p className="text-lg font-semibold text-gray-900 mt-0.5">{fmtCurrency(summary.totalMaterialCost)}</p>
            </div>
            <div className="px-4">
              <p className="text-xs text-gray-500">Total Jobs</p>
              <p className="text-lg font-semibold text-gray-900 mt-0.5">{summary.totalJobs.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-md border border-gray-200 overflow-hidden text-sm">
          {(["all", "profitable", "unprofitable"] as const).map(f => (
            <button
              key={f}
              onClick={() => setProfitFilter(f)}
              className={`px-3 py-1.5 capitalize transition-colors ${
                profitFilter === f ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <select
          value={serviceFilter}
          onChange={e => setServiceFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Service Types</option>
          <option value="portable_toilet">Portable Toilet</option>
          <option value="septic">Septic</option>
          <option value="roll_off">Roll-Off</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Jobs table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {jobsLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
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
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Revenue</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Labor</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Material</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Gross Profit</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Margin</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => {
                const isUnprofitable = job.margin !== null && parseFloat(job.margin) < 0;
                return (
                  <tr
                    key={job.id}
                    className={`border-b border-gray-50 last:border-0 ${isUnprofitable ? "bg-red-50" : "hover:bg-gray-50"}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{job.name}</p>
                      <p className="text-xs text-gray-400">{job.jobNumber} · {job.date}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{job.customerName || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 capitalize">
                        {job.serviceType?.replace(/_/g, " ") || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {job.routeName ? <p>{job.routeName}</p> : null}
                      {job.driverName ? <p className="text-gray-400">{job.driverName}</p> : null}
                      {!job.routeName && !job.driverName && "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium">{fmtCurrency(job.revenue)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{fmtCurrency(job.laborCost)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{fmtCurrency(job.materialCost)}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      <span className={parseFloat(job.grossProfit) < 0 ? "text-red-600" : "text-gray-900"}>
                        {fmtCurrency(job.grossProfit)}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums ${marginColor(job.margin)}`}>
                      {job.margin !== null ? `${parseFloat(job.margin).toFixed(1)}%` : "—"}
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
