import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";

const CHART_COLORS = {
  primary: "#3B82F6",
  secondary: "#60A5FA",
  accent: "#F59E0B",
  success: "#16A34A",
  danger: "#DC2626",
  neutral: "#6B7280",
  previousPeriod: "#D1D5DB",
};

function ChartCard({ title, children, loading }: { title: string; children: React.ReactNode; loading?: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      {loading ? (
        <div className="h-56 flex items-center justify-center">
          <div className="h-4 w-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="h-56">{children}</div>
      )}
    </div>
  );
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(v);

export default function AnalyticsPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 84); // ~12 weeks
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [laborGroupBy, setLaborGroupBy] = useState<"department" | "role" | "employee">("department");

  const qs = `dateFrom=${dateFrom}&dateTo=${dateTo}`;

  const { data: otTrends, isLoading: otLoading } = useQuery({
    queryKey: ["/api/analytics/overtime-trends", dateFrom, dateTo],
    queryFn: () => fetch(`/api/analytics/overtime-trends?${qs}`).then(r => r.json()).then(r => r.data ?? []),
  });

  const { data: laborCosts, isLoading: laborLoading } = useQuery({
    queryKey: ["/api/analytics/labor-costs", dateFrom, dateTo, laborGroupBy],
    queryFn: () =>
      fetch(`/api/analytics/labor-costs?${qs}&groupBy=${laborGroupBy}`)
        .then(r => r.json())
        .then(r => r.data ?? []),
  });

  const { data: routeProfit, isLoading: routeLoading } = useQuery({
    queryKey: ["/api/analytics/route-profitability", dateFrom, dateTo],
    queryFn: () => fetch(`/api/analytics/route-profitability?${qs}`).then(r => r.json()).then(r => r.data ?? []),
  });

  const { data: driverEff, isLoading: driverLoading } = useQuery({
    queryKey: ["/api/analytics/driver-efficiency", dateFrom, dateTo],
    queryFn: () => fetch(`/api/analytics/driver-efficiency?${qs}`).then(r => r.json()).then(r => r.data ?? []),
  });

  const { data: periodComp, isLoading: periodLoading } = useQuery({
    queryKey: ["/api/analytics/period-comparison", dateFrom, dateTo],
    queryFn: () => fetch(`/api/analytics/period-comparison?${qs}`).then(r => r.json()).then(r => r.data),
  });

  const { data: dailyLabor, isLoading: dailyLoading } = useQuery({
    queryKey: ["/api/analytics/labor-costs", dateFrom, dateTo, "day"],
    queryFn: () =>
      fetch(`/api/analytics/labor-costs?${qs}&groupBy=day`)
        .then(r => r.json())
        .then(r => r.data ?? []),
  });

  // Flatten radar data per driver
  const radarDrivers: string[] = driverEff ? [...new Set((driverEff as any[]).map((d: any) => d.name))] : [];
  const radarKeys = ["hoursScore", "completionScore", "efficiencyScore", "utilizationScore", "otScore"];
  const radarLabels = ["Hours", "Completion", "Efficiency", "Utilization", "OT Rate"];
  const radarData = radarKeys.map((key, i) => ({
    subject: radarLabels[i],
    ...Object.fromEntries((driverEff as any[] ?? []).map((d: any) => [d.name, d[key]])),
  }));

  const driverColors = [CHART_COLORS.primary, CHART_COLORS.accent, CHART_COLORS.success, CHART_COLORS.danger, CHART_COLORS.neutral];

  // Period comparison bar data
  const periodBarData = periodComp ? [
    { metric: "Reg Hours", current: parseFloat(periodComp.current?.regularHours ?? 0), previous: parseFloat(periodComp.previous?.regularHours ?? 0) },
    { metric: "OT Hours", current: parseFloat(periodComp.current?.overtimeHours ?? 0), previous: parseFloat(periodComp.previous?.overtimeHours ?? 0) },
    { metric: "Labor $k", current: parseFloat(periodComp.current?.totalLaborCost ?? 0) / 1000, previous: parseFloat(periodComp.previous?.totalLaborCost ?? 0) / 1000 },
    { metric: "Employees", current: parseFloat(periodComp.current?.activeEmployees ?? 0), previous: parseFloat(periodComp.previous?.activeEmployees ?? 0) },
  ] : [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Workforce & operations insights</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 1. OT Trends (Line) */}
        <ChartCard title="Overtime Trends (Weekly)" loading={otLoading}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={otTrends ?? []} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v?.slice(5) ?? v} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number, name: string) => [`${v.toFixed(1)}h`, name]} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="regularHours" name="Regular" stroke={CHART_COLORS.primary} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="overtimeHours" name="Overtime" stroke={CHART_COLORS.accent} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="doubleTimeHours" name="Double Time" stroke={CHART_COLORS.danger} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 2. Labor Cost by Group (Stacked Bar) */}
        <ChartCard
          title={
            <span className="flex items-center gap-3">
              Labor Cost
              <span className="ml-2 flex rounded border border-gray-200 overflow-hidden text-xs">
                {(["department", "role", "employee"] as const).map(g => (
                  <button
                    key={g}
                    onClick={() => setLaborGroupBy(g)}
                    className={`px-2 py-0.5 capitalize transition-colors ${laborGroupBy === g ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                  >
                    {g}
                  </button>
                ))}
              </span>
            </span> as unknown as string
          }
          loading={laborLoading}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={laborCosts ?? []} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [fmtCurrency(v), "Labor Cost"]} />
              <Bar dataKey="laborCost" name="Labor Cost" fill={CHART_COLORS.primary} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 3. Route Profitability (Horizontal Bar) */}
        <ChartCard title="Route Profitability (Top 15)" loading={routeLoading}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={routeProfit ?? []}
              layout="vertical"
              margin={{ top: 4, right: 16, bottom: 4, left: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={56} />
              <Tooltip formatter={(v: number, name: string) => [fmtCurrency(v), name]} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="revenue" name="Revenue" fill={CHART_COLORS.primary} stackId="a" />
              <Bar dataKey="laborCost" name="Labor Cost" fill={CHART_COLORS.accent} stackId="b" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 4. Driver Efficiency (Radar) */}
        <ChartCard title="Driver Efficiency (Radar)" loading={driverLoading}>
          {radarDrivers.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">No driver data in range</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
                <PolarGrid stroke="#E5E7EB" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                {radarDrivers.slice(0, 5).map((name, i) => (
                  <Radar
                    key={name}
                    name={name}
                    dataKey={name}
                    stroke={driverColors[i % driverColors.length]}
                    fill={driverColors[i % driverColors.length]}
                    fillOpacity={0.12}
                  />
                ))}
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v.toFixed(0)}/100`]} />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* 5. Period Comparison (Grouped Bar) */}
        <ChartCard title="Period Comparison (Current vs Previous)" loading={periodLoading}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={periodBarData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="current" name="Current Period" fill={CHART_COLORS.primary} radius={[3, 3, 0, 0]} />
              <Bar dataKey="previous" name="Previous Period" fill={CHART_COLORS.previousPeriod} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 6. Daily Labor Cost (Area) */}
        <ChartCard title="Daily Labor Cost" loading={dailyLoading}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyLabor ?? []} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <defs>
                <linearGradient id="laborGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v?.slice(5) ?? v} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [fmtCurrency(v), "Labor Cost"]} />
              <Area type="monotone" dataKey="laborCost" name="Labor Cost" stroke={CHART_COLORS.primary} fill="url(#laborGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
