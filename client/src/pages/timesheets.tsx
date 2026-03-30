import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { ClockWidget } from "@/components/time-tracking/clock-widget";
import { TimeEntryForm } from "@/components/time-tracking/time-entry-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { GPSBadge } from "@/components/ui/gps-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, X, Plus, ChevronLeft, ChevronRight, Loader2, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import type { TimeEntry } from "@shared/schema";

type EnrichedEntry = TimeEntry & { employeeName: string; employeeRole: string; clockInType?: string };

interface TEResp {
  data: EnrichedEntry[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const TABS = ["all", "active", "pending", "approved", "rejected"] as const;
type Tab = typeof TABS[number];

function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(s?: string | null) {
  if (!s) return "—";
  return format(new Date(s + "T12:00:00"), "MMM d, yyyy");
}
function rowBg(status: string) {
  if (status === "active") return "bg-blue-50 hover:bg-blue-100";
  if (status === "rejected") return "bg-red-50 hover:bg-red-100";
  return "hover:bg-gray-50";
}

export default function TimesheetsPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectIds, setRejectIds] = useState<number[]>([]);

  const params = new URLSearchParams();
  if (activeTab !== "all") params.set("status", activeTab);
  if (employeeFilter !== "all") params.set("employeeId", employeeFilter);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  params.set("page", String(page));
  params.set("limit", "25");

  const { data, isLoading } = useQuery<TEResp>({
    queryKey: ["/api/time-entries", activeTab, employeeFilter, dateFrom, dateTo, page],
    queryFn: () => apiRequest(`/api/time-entries?${params}`),
  });

  const { data: empsData } = useQuery<{ data: { id: number; firstName: string; lastName: string }[] }>({
    queryKey: ["/api/employees", "active-list"],
    queryFn: () => apiRequest("/api/employees?status=active&limit=100"),
  });

  const entries = data?.data ?? [];
  const pagination = data?.pagination;
  const pendingCount = entries.filter(e => e.status === "pending").length;

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/time-entries/${id}/approve`, {
      method: "PATCH", body: JSON.stringify({ userId: 1 }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/time-entries"] }); toast({ title: "Entry approved" }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiRequest(`/api/time-entries/${id}/reject`, { method: "PATCH", body: JSON.stringify({ userId: 1, reason }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/time-entries"] });
      setRejectDialogOpen(false); setRejectReason("");
      toast({ title: "Entry rejected" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const bulkApproveMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest<{ data: { approved: number } }>("/api/time-entries/bulk-approve", {
      method: "POST", body: JSON.stringify({ ids, userId: 1 }),
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["/api/time-entries"] });
      setSelected(new Set());
      toast({ title: `Approved ${res.data.approved} entries` });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const bulkRejectMutation = useMutation({
    mutationFn: ({ ids, reason }: { ids: number[]; reason: string }) =>
      apiRequest<{ data: { rejected: number } }>("/api/time-entries/bulk-reject", {
        method: "POST", body: JSON.stringify({ ids, userId: 1, reason }),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["/api/time-entries"] });
      setSelected(new Set()); setRejectDialogOpen(false); setRejectReason("");
      toast({ title: `Rejected ${res.data.rejected} entries` });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function toggleSelect(id: number) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    if (selected.size === entries.length) setSelected(new Set());
    else setSelected(new Set(entries.map(e => e.id)));
  }
  function openReject(ids: number[]) { setRejectIds(ids); setRejectReason(""); setRejectDialogOpen(true); }
  function submitReject() {
    if (rejectReason.length < 10) { toast({ title: "Reason must be at least 10 characters", variant: "destructive" }); return; }
    if (rejectIds.length === 1) rejectMutation.mutate({ id: rejectIds[0], reason: rejectReason });
    else bulkRejectMutation.mutate({ ids: rejectIds, reason: rejectReason });
  }

  const showing = pagination
    ? `${(pagination.page - 1) * pagination.limit + 1}–${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total}`
    : "";

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Timesheets</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track and approve employee hours</p>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Button
              variant="outline"
              className="gap-2 border-green-300 text-green-700 hover:bg-green-50"
              onClick={() => {
                const pendingIds = entries.filter(e => e.status === "pending").map(e => e.id);
                if (pendingIds.length > 0) bulkApproveMutation.mutate(pendingIds);
              }}
              disabled={bulkApproveMutation.isPending}
            >
              {bulkApproveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Approve All ({pendingCount})
            </Button>
          )}
          <Button onClick={() => setFormOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Manual Entry
          </Button>
        </div>
      </div>

      {/* Clock widget */}
      <ClockWidget />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setPage(1); setSelected(new Set()); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "pending" && pendingCount > 0 ? `Pending (${pendingCount})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={employeeFilter} onValueChange={v => { setEmployeeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Employees" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {(empsData?.data ?? []).map(e => (
              <SelectItem key={e.id} value={String(e.id)}>
                {e.firstName} {e.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="w-36" />
          <span className="text-gray-400 text-sm">to</span>
          <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="w-36" />
        </div>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm font-medium text-blue-700">{selected.size} selected</span>
          <Button size="sm" variant="outline" className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50 h-7"
            onClick={() => bulkApproveMutation.mutate([...selected])} disabled={bulkApproveMutation.isPending}>
            <Check className="w-3.5 h-3.5" /> Bulk Approve
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50 h-7"
            onClick={() => openReject([...selected])}>
            <X className="w-3.5 h-3.5" /> Bulk Reject
          </Button>
          <button className="ml-auto text-xs text-blue-500 hover:text-blue-700" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center"><p className="text-sm text-gray-500">No time entries found</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" checked={selected.size === entries.length && entries.length > 0}
                      onChange={toggleAll} className="rounded border-gray-300" />
                  </th>
                  {["Employee", "Date", "Clock In", "Clock Out", "Break", "Hours", "Status", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map(entry => (
                  <tr key={entry.id} className={`transition-colors ${rowBg(entry.status)}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(entry.id)} onChange={() => toggleSelect(entry.id)}
                        className="rounded border-gray-300" />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{entry.employeeName}</p>
                      <p className="text-xs text-gray-500 capitalize">{entry.employeeRole}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtDate(entry.date)}</td>
                    <td className="px-4 py-3">
                      <p className="text-gray-900">{fmtTime(entry.clockIn)}</p>
                      <GPSBadge clockInType={entry.clockInType ?? "manual"} />
                    </td>
                    <td className="px-4 py-3">
                      {entry.status === "active"
                        ? <StatusBadge status="active" />
                        : <span className="text-gray-900">{fmtTime(entry.clockOut)}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{entry.breakMinutes ?? 0}m</td>
                    <td className="px-4 py-3">
                      <span className={`font-mono font-medium ${parseFloat(entry.totalHours ?? "0") > 8 ? "text-amber-700" : "text-gray-900"}`}>
                        {parseFloat(entry.totalHours ?? "0").toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={entry.status} /></td>
                    <td className="px-4 py-3">
                      {entry.status === "pending" && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => approveMutation.mutate(entry.id)} disabled={approveMutation.isPending}
                            title="Approve" className="p-1.5 rounded hover:bg-green-100 text-green-600 transition-colors">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => openReject([entry.id])} title="Reject"
                            className="p-1.5 rounded hover:bg-red-100 text-red-500 transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Showing {showing} entries</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-gray-700 font-medium">Page {page} of {pagination.totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page === pagination.totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <TimeEntryForm open={formOpen} onClose={() => setFormOpen(false)} />

      {/* Reject dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={v => !v && setRejectDialogOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject {rejectIds.length > 1 ? `${rejectIds.length} entries` : "Time Entry"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Rejection Reason <span className="text-red-500">*</span></Label>
            <Textarea placeholder="Enter reason (min 10 characters)..." value={rejectReason}
              onChange={e => setRejectReason(e.target.value)} rows={3} />
            {rejectReason.length > 0 && rejectReason.length < 10 && (
              <p className="text-xs text-red-500">Must be at least 10 characters</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={submitReject}
              disabled={rejectMutation.isPending || bulkRejectMutation.isPending || rejectReason.length < 10}>
              {(rejectMutation.isPending || bulkRejectMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
