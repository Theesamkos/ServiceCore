import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, Plus, Shield, MapPin, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OvertimeRule {
  id: number;
  name: string;
  weeklyThresholdHours: string;
  dailyThresholdHours: string;
  rateMultiplier: string;
  doubleTimeThresholdHours: string | null;
  doubleTimeMultiplier: string | null;
  state: string | null;
  status: string;
}

interface Geofence {
  id: number;
  name: string;
  type: string;
  centerLat: string;
  centerLng: string;
  radiusMeters: number;
  address: string | null;
  status: string;
}

interface AuditEntry {
  id: number;
  action: string;
  tableName: string;
  recordId: number;
  previousValues: string | null;
  newValues: string | null;
  userId: number | null;
  userDisplayName: string | null;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTimestamp(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function parseChanges(prev: string | null, next: string | null): string {
  if (!prev && next) return "Record created";
  if (prev && !next) return "Record deleted";
  if (!prev && !next) return "—";
  try {
    const p = JSON.parse(prev!);
    const n = JSON.parse(next!);
    const diffs: string[] = [];
    const allKeys = new Set([...Object.keys(p), ...Object.keys(n)]);
    for (const k of allKeys) {
      if (JSON.stringify(p[k]) !== JSON.stringify(n[k])) {
        diffs.push(`${k}: ${String(p[k] ?? "—")} → ${String(n[k] ?? "—")}`);
      }
    }
    return diffs.slice(0, 3).join(", ") || "No changes recorded";
  } catch {
    return next?.slice(0, 60) ?? "—";
  }
}

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-700",
  update: "bg-blue-100 text-blue-700",
  delete: "bg-red-100 text-red-700",
  approve: "bg-green-100 text-green-700",
  reject: "bg-red-100 text-red-700",
  export: "bg-purple-100 text-purple-700",
  calculate: "bg-indigo-100 text-indigo-700",
};

const GEOFENCE_TYPE_COLORS: Record<string, string> = {
  depot: "bg-blue-100 text-blue-700",
  customer: "bg-green-100 text-green-700",
  job_site: "bg-amber-100 text-amber-700",
  yard: "bg-blue-100 text-blue-700",
  dump_site: "bg-amber-100 text-amber-700",
};

// ─── OT Rule Dialog ───────────────────────────────────────────────────────────

function OTRuleDialog({
  rule,
  onClose,
}: {
  rule: OvertimeRule | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: rule?.name ?? "",
    weeklyThresholdHours: rule?.weeklyThresholdHours ?? "40",
    dailyThresholdHours: rule?.dailyThresholdHours ?? "8",
    rateMultiplier: rule?.rateMultiplier ?? "1.5",
    doubleTimeThresholdHours: rule?.doubleTimeThresholdHours ?? "",
    doubleTimeMultiplier: rule?.doubleTimeMultiplier ?? "",
    state: rule?.state ?? "",
    status: rule?.status ?? "active",
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        weeklyThresholdHours: form.weeklyThresholdHours,
        dailyThresholdHours: form.dailyThresholdHours,
        rateMultiplier: form.rateMultiplier,
        doubleTimeThresholdHours: form.doubleTimeThresholdHours || null,
        doubleTimeMultiplier: form.doubleTimeMultiplier || null,
        state: form.state || null,
        status: form.status,
      };
      if (rule) {
        return fetch(`/api/overtime-rules/${rule.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(r => r.json());
      }
      return fetch("/api/overtime-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(r => r.json());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/overtime-rules"] });
      toast({ title: rule ? "Rule updated" : "Rule created" });
      onClose();
    },
  });

  const field = (label: string, key: keyof typeof form, opts?: { type?: string; helper?: string; step?: string }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={opts?.type ?? "text"}
        step={opts?.step}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {opts?.helper && <p className="text-xs text-gray-400 mt-1">{opts.helper}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">{rule ? "Edit Rule" : "Add Overtime Rule"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          {field("Rule Name", "name")}
          <div className="grid grid-cols-2 gap-3">
            {field("Weekly Threshold (hrs)", "weeklyThresholdHours", { type: "number", helper: "0 = disabled" })}
            {field("Daily Threshold (hrs)", "dailyThresholdHours", { type: "number", helper: "0 = disabled" })}
          </div>
          {field("Rate Multiplier", "rateMultiplier", { type: "number", step: "0.1", helper: "e.g. 1.5 for time-and-a-half" })}
          <div className="grid grid-cols-2 gap-3">
            {field("DT Threshold (hrs)", "doubleTimeThresholdHours", { type: "number", helper: "Optional, e.g. 12" })}
            {field("DT Multiplier", "doubleTimeMultiplier", { type: "number", step: "0.1", helper: "Optional, e.g. 2.0" })}
          </div>
          {field("State", "state", { helper: "e.g. CA, TX — leave blank for federal" })}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50">Cancel</button>
          <button
            onClick={() => save.mutate()}
            disabled={!form.name || save.isPending}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Geofence Dialog ──────────────────────────────────────────────────────────

function GeofenceDialog({ geo, onClose }: { geo: Geofence | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: geo?.name ?? "",
    type: geo?.type ?? "depot",
    centerLat: geo?.centerLat ?? "",
    centerLng: geo?.centerLng ?? "",
    radiusMeters: String(geo?.radiusMeters ?? 200),
    address: geo?.address ?? "",
    status: geo?.status ?? "active",
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        type: form.type,
        centerLat: form.centerLat,
        centerLng: form.centerLng,
        radiusMeters: parseInt(form.radiusMeters),
        address: form.address || null,
        status: form.status,
      };
      if (geo) {
        return fetch(`/api/geofences/${geo.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
      }
      return fetch("/api/geofences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/geofences"] });
      toast({ title: geo ? "Geofence updated" : "Geofence created" });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">{geo ? "Edit Geofence" : "Add Geofence"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g., Main Yard" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="depot">Depot / Yard</option>
              <option value="customer">Customer</option>
              <option value="job_site">Job Site / Dump Site</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
              <input type="number" step="0.0001" value={form.centerLat} onChange={e => setForm(f => ({ ...f, centerLat: e.target.value }))} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
              <input type="number" step="0.0001" value={form.centerLng} onChange={e => setForm(f => ({ ...f, centerLng: e.target.value }))} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Radius (meters)</label>
            <input type="number" min="50" max="5000" value={form.radiusMeters} onChange={e => setForm(f => ({ ...f, radiusMeters: e.target.value }))} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address (optional)</label>
            <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50">Cancel</button>
          <button
            onClick={() => save.mutate()}
            disabled={!form.name || !form.centerLat || !form.centerLng || save.isPending}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── OT Rules Tab ─────────────────────────────────────────────────────────────

function OTRulesTab() {
  const qc = useQueryClient();
  const [editRule, setEditRule] = useState<OvertimeRule | null | "new">(null);

  const { data, isLoading } = useQuery<{ data: OvertimeRule[] }>({
    queryKey: ["/api/overtime-rules"],
    queryFn: () => fetch("/api/overtime-rules").then(r => r.json()),
  });
  const rules = data?.data ?? [];

  const toggleStatus = useMutation({
    mutationFn: (rule: OvertimeRule) =>
      fetch(`/api/overtime-rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: rule.status === "active" ? "inactive" : "active" }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/overtime-rules"] });
      toast({ title: "Rule updated" });
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{rules.length} rule{rules.length !== 1 ? "s" : ""} configured</p>
        <button
          onClick={() => setEditRule("new")}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Add Rule
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : rules.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No overtime rules configured</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Rule Name", "Weekly Threshold", "Daily Threshold", "Multiplier", "State", "Status", "Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => (
                <tr key={rule.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{rule.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {parseFloat(rule.weeklyThresholdHours) > 0 ? `${rule.weeklyThresholdHours} hrs/week` : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {parseFloat(rule.dailyThresholdHours) > 0 ? `${rule.dailyThresholdHours} hrs/day` : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{parseFloat(rule.rateMultiplier).toFixed(1)}×</td>
                  <td className="px-4 py-3 text-gray-600">{rule.state || <span className="text-gray-400">All</span>}</td>
                  <td className="px-4 py-3"><StatusBadge status={rule.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditRule(rule)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => toggleStatus.mutate(rule)}
                        className="text-xs px-2 py-1 border border-gray-200 text-gray-500 rounded hover:bg-gray-50 transition-colors"
                      >
                        {rule.status === "active" ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editRule !== null && (
        <OTRuleDialog
          rule={editRule === "new" ? null : editRule}
          onClose={() => setEditRule(null)}
        />
      )}
    </div>
  );
}

// ─── Geofences Tab ────────────────────────────────────────────────────────────

function GeofencesTab() {
  const qc = useQueryClient();
  const [editGeo, setEditGeo] = useState<Geofence | null | "new">(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Geofence | null>(null);

  const { data, isLoading } = useQuery<{ data: Geofence[] }>({
    queryKey: ["/api/geofences"],
    queryFn: () => fetch("/api/geofences").then(r => r.json()),
  });
  const geofences = data?.data ?? [];

  const softDelete = useMutation({
    mutationFn: (id: number) => fetch(`/api/geofences/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/geofences"] });
      toast({ title: "Geofence deactivated" });
      setDeleteConfirm(null);
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{geofences.length} geofence{geofences.length !== 1 ? "s" : ""} configured</p>
        <button
          onClick={() => setEditGeo("new")}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Add Geofence
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : geofences.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No geofences configured</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Name", "Type", "Latitude", "Longitude", "Radius", "Status", "Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {geofences.map(geo => (
                <tr key={geo.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{geo.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${GEOFENCE_TYPE_COLORS[geo.type] ?? "bg-gray-100 text-gray-600"}`}>
                      {geo.type.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 tabular-nums">{parseFloat(geo.centerLat).toFixed(4)}</td>
                  <td className="px-4 py-3 text-gray-600 tabular-nums">{parseFloat(geo.centerLng).toFixed(4)}</td>
                  <td className="px-4 py-3 text-gray-600">{geo.radiusMeters}m</td>
                  <td className="px-4 py-3"><StatusBadge status={geo.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditGeo(geo)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(geo)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                        title="Deactivate"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editGeo !== null && (
        <GeofenceDialog geo={editGeo === "new" ? null : editGeo} onClose={() => setEditGeo(null)} />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-2">Deactivate Geofence</h2>
            <p className="text-sm text-gray-500 mb-5">
              Are you sure you want to deactivate <strong>{deleteConfirm.name}</strong>? Time entries will no longer be verified against it.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50">Cancel</button>
              <button
                onClick={() => softDelete.mutate(deleteConfirm.id)}
                disabled={softDelete.isPending}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Audit Log Tab ────────────────────────────────────────────────────────────

function AuditLogTab() {
  const [tableFilter, setTableFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), limit: "50" });
  if (tableFilter) params.set("tableName", tableFilter);
  if (actionFilter) params.set("action", actionFilter);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const { data, isLoading } = useQuery<{ data: AuditEntry[]; pagination: { page: number; total: number; totalPages: number } }>({
    queryKey: ["/api/audit-log", tableFilter, actionFilter, dateFrom, dateTo, page],
    queryFn: () => fetch(`/api/audit-log?${params}`).then(r => r.json()),
  });
  const entries = data?.data ?? [];
  const pagination = data?.pagination;

  const TABLES = ["employees", "time_entries", "payroll_periods", "routes", "jobs", "geofences", "overtime_rules"];
  const ACTIONS = ["create", "update", "delete", "approve", "reject", "export", "calculate"];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={tableFilter}
          onChange={e => { setTableFilter(e.target.value); setPage(1); }}
          className="text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Tables</option>
          {TABLES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setPage(1); }}
          className="text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Actions</option>
          {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <span className="text-gray-400 text-sm">to</span>
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {(tableFilter || actionFilter || dateFrom || dateTo) && (
          <button onClick={() => { setTableFilter(""); setActionFilter(""); setDateFrom(""); setDateTo(""); setPage(1); }} className="text-xs text-blue-600 hover:underline">Clear</button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No audit log entries found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Timestamp", "Action", "Table", "Record ID", "User", "Changes"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtTimestamp(e.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[e.action] ?? "bg-gray-100 text-gray-600"}`}>
                      {e.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{e.tableName}</td>
                  <td className="px-4 py-3 text-gray-600 tabular-nums">{e.recordId}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{e.userDisplayName ?? (e.userId ? `#${e.userId}` : "System")}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">
                    {parseChanges(e.previousValues, e.newValues)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {((pagination.page - 1) * 50) + 1}–{Math.min(pagination.page * 50, pagination.total)} of {pagination.total}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-40 rounded hover:bg-gray-100"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-gray-600 px-2">Page {pagination.page} of {pagination.totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages}
              className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-40 rounded hover:bg-gray-100"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Configure overtime rules, geofences, and review audit logs</p>
      </div>

      <Tabs defaultValue="overtime">
        <TabsList>
          <TabsTrigger value="overtime">
            <span className="flex items-center gap-2"><Shield className="w-4 h-4" />Overtime Rules</span>
          </TabsTrigger>
          <TabsTrigger value="geofences">
            <span className="flex items-center gap-2"><MapPin className="w-4 h-4" />Geofences</span>
          </TabsTrigger>
          <TabsTrigger value="audit">
            <span className="flex items-center gap-2"><FileText className="w-4 h-4" />Audit Log</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overtime"><OTRulesTab /></TabsContent>
        <TabsContent value="geofences"><GeofencesTab /></TabsContent>
        <TabsContent value="audit"><AuditLogTab /></TabsContent>
      </Tabs>
    </div>
  );
}
