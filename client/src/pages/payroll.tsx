import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle, ChevronDown, ChevronUp, Download,
  Loader2, Plus, Check, X,
} from "lucide-react";
import { format } from "date-fns";
import type { PayrollPeriod, PayrollEntry } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

type EnrichedEntry = PayrollEntry & { employeeName: string; department: string };

interface PeriodDetail extends PayrollPeriod {
  entries: EnrichedEntry[];
  unapprovedCount: number;
}

interface PeriodsResp { data: PayrollPeriod[] }
interface PeriodDetailResp { data: PeriodDetail }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPeriod(p: PayrollPeriod) {
  return `${format(new Date(p.periodStart + "T12:00:00"), "MMM d")} – ${format(new Date(p.periodEnd + "T12:00:00"), "MMM d, yyyy")}`;
}
function fmtCurrency(v: string | number) {
  return `$${parseFloat(String(v)).toFixed(2)}`;
}
function fmtHours(v: string | number) {
  return parseFloat(String(v)).toFixed(2);
}

const STATUS_ORDER = ["open", "calculated", "approved", "exported", "closed"];
function statusGte(status: string, threshold: string) {
  return STATUS_ORDER.indexOf(status) >= STATUS_ORDER.indexOf(threshold);
}

function todayStr() { return new Date().toISOString().split("T")[0]; }

// ─── Export dropdown ──────────────────────────────────────────────────────────

function ExportMenu({ periodId, label = "Export" }: { periodId: number; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function triggerDownload(type: "csv" | "iif") {
    setOpen(false);
    const a = document.createElement("a");
    a.href = `/api/payroll/periods/${periodId}/export/${type}`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div ref={ref} className="relative">
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(v => !v)}>
        <Download className="w-3.5 h-3.5" />
        {label}
        <ChevronDown className="w-3 h-3 ml-0.5" />
      </Button>
      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
          <button
            onClick={() => triggerDownload("csv")}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Export CSV
          </button>
          <button
            onClick={() => triggerDownload("iif")}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Export QuickBooks IIF
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PayrollPage() {
  const qc = useQueryClient();

  // Period selection
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [periodsExpanded, setPeriodsExpanded] = useState(true);

  // New period dialog
  const [newPeriodOpen, setNewPeriodOpen] = useState(false);
  const [newStart, setNewStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [newEnd, setNewEnd] = useState(todayStr);
  const [newNotes, setNewNotes] = useState("");
  const [newPeriodErrors, setNewPeriodErrors] = useState<{ start?: string; end?: string }>({});

  // Approve dialog
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveText, setApproveText] = useState("");

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: periodsData, isLoading: periodsLoading } = useQuery<PeriodsResp>({
    queryKey: ["/api/payroll/periods"],
    queryFn: () => apiRequest("/api/payroll/periods?sortOrder=desc"),
  });
  const periods = periodsData?.data ?? [];

  const { data: detailData, isLoading: detailLoading } = useQuery<PeriodDetailResp>({
    queryKey: ["/api/payroll/periods", selectedId],
    queryFn: () => apiRequest(`/api/payroll/periods/${selectedId}`),
    enabled: !!selectedId,
  });
  const period = detailData?.data ?? null;

  // Auto-select most recent period on first load
  const didAutoSelect = useRef(false);
  useEffect(() => {
    if (!didAutoSelect.current && periods.length > 0 && selectedId === null) {
      didAutoSelect.current = true;
      setSelectedId(periods[0].id);
    }
  }, [periods, selectedId]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: () => apiRequest<{ data: PayrollPeriod }>("/api/payroll/periods", {
      method: "POST",
      body: JSON.stringify({ periodStart: newStart, periodEnd: newEnd, notes: newNotes || undefined }),
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["/api/payroll/periods"] });
      setNewPeriodOpen(false);
      setNewNotes("");
      setSelectedId(res.data.id);
      toast({ title: "Pay period created" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const calculateMutation = useMutation({
    mutationFn: () => apiRequest(`/api/payroll/periods/${selectedId}/calculate`, {
      method: "POST",
      body: JSON.stringify({ userId: 1 }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/payroll/periods"] });
      qc.invalidateQueries({ queryKey: ["/api/payroll/periods", selectedId] });
      toast({ title: "Payroll calculated" });
    },
    onError: (err: Error) => toast({ title: "Calculation failed", description: err.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: () => apiRequest(`/api/payroll/periods/${selectedId}/approve`, {
      method: "POST",
      body: JSON.stringify({ userId: 1, confirmation: "APPROVE" }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/payroll/periods"] });
      qc.invalidateQueries({ queryKey: ["/api/payroll/periods", selectedId] });
      setApproveOpen(false);
      setApproveText("");
      toast({ title: "Payroll approved" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const closeMutation = useMutation({
    mutationFn: () => apiRequest(`/api/payroll/periods/${selectedId}/close`, {
      method: "POST",
      body: "{}",
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/payroll/periods"] });
      qc.invalidateQueries({ queryKey: ["/api/payroll/periods", selectedId] });
      toast({ title: "Period closed" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // ── New period validation ──────────────────────────────────────────────────
  function validateNewPeriod(): boolean {
    const errs: { start?: string; end?: string } = {};
    if (!newStart) errs.start = "Required";
    if (!newEnd) errs.end = "Required";
    if (newStart && newEnd && newEnd <= newStart) errs.end = "Must be after start date";
    if (newStart && newEnd) {
      const days = (new Date(newEnd).getTime() - new Date(newStart).getTime()) / 86400000;
      if (days > 31) errs.end = "Cannot exceed 31 days";
    }
    setNewPeriodErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Entries totals ─────────────────────────────────────────────────────────
  const entries = period?.entries ?? [];
  const totals = {
    regularHours: entries.reduce((s, e) => s + parseFloat(e.regularHours), 0),
    overtimeHours: entries.reduce((s, e) => s + parseFloat(e.overtimeHours), 0),
    doubleTimeHours: entries.reduce((s, e) => s + parseFloat(e.doubleTimeHours), 0),
    regularPay: entries.reduce((s, e) => s + parseFloat(e.regularPay), 0),
    overtimePay: entries.reduce((s, e) => s + parseFloat(e.overtimePay), 0),
    doubleTimePay: entries.reduce((s, e) => s + parseFloat(e.doubleTimePay), 0),
    grossPay: entries.reduce((s, e) => s + parseFloat(e.grossPay), 0),
  };

  const sortedEntries = [...entries].sort((a, b) => {
    const aLast = a.employeeName.split(" ").at(-1) ?? "";
    const bLast = b.employeeName.split(" ").at(-1) ?? "";
    return aLast.localeCompare(bLast);
  });

  // ── Action bar ─────────────────────────────────────────────────────────────
  function ActionBar() {
    if (!period) return null;
    const s = period.status;
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {(s === "open" || s === "draft") && (
          <Button onClick={() => calculateMutation.mutate()} disabled={calculateMutation.isPending} className="gap-2">
            {calculateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Calculate Payroll
          </Button>
        )}
        {s === "calculated" && (
          <>
            <Button variant="outline" size="sm" onClick={() => calculateMutation.mutate()} disabled={calculateMutation.isPending} className="gap-1.5">
              {calculateMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Recalculate
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-green-600 hover:bg-green-700"
              onClick={() => { setApproveText(""); setApproveOpen(true); }}
            >
              <Check className="w-3.5 h-3.5" />
              Approve Payroll
            </Button>
            <ExportMenu periodId={period.id} />
          </>
        )}
        {s === "approved" && <ExportMenu periodId={period.id} />}
        {s === "exported" && (
          <>
            <ExportMenu periodId={period.id} label="Re-Export" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => closeMutation.mutate()}
              disabled={closeMutation.isPending}
              className="gap-1.5"
            >
              {closeMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Close Period
            </Button>
          </>
        )}
        {s === "closed" && (
          <span className="text-sm text-gray-500 italic">This period is closed and read-only.</span>
        )}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Payroll Processing</h1>
          <p className="text-sm text-gray-500 mt-0.5">Calculate, review, and export payroll</p>
        </div>
        <Button onClick={() => setNewPeriodOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Pay Period
        </Button>
      </div>

      {/* Selected period detail */}
      {selectedId && (
        <div className="space-y-4">
          {detailLoading || !period ? (
            <div className="bg-white border border-gray-200 rounded-lg p-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              {/* Period title + action bar */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Pay Period</p>
                    <h2 className="text-lg font-semibold text-gray-900">{fmtPeriod(period)}</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={period.status} />
                    <ActionBar />
                  </div>
                </div>
              </div>

              {/* Warning banner */}
              {period.unapprovedCount > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <p className="text-sm font-medium">
                    {period.unapprovedCount} time {period.unapprovedCount === 1 ? "entry" : "entries"} pending approval — not included in payroll
                  </p>
                </div>
              )}

              {/* Summary cards */}
              {statusGte(period.status, "calculated") && (
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: "Employees", value: String(period.totalEmployees) },
                    { label: "Regular Hours", value: fmtHours(period.totalRegularHours) },
                    { label: "Overtime Hours", value: fmtHours(period.totalOvertimeHours) },
                    { label: "Gross Pay", value: fmtCurrency(period.totalGrossPay) },
                  ].map(stat => (
                    <div key={stat.label} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <p className="text-xs text-gray-500 uppercase tracking-wide">{stat.label}</p>
                      <p className="text-2xl font-semibold text-gray-900 mt-1">{stat.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Entries table */}
              {entries.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          {["Employee", "Dept", "Regular Hrs", "OT Hrs", "DT Hrs", "Rate", "Gross Pay"].map(h => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {sortedEntries.map(e => (
                          <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-gray-900">{e.employeeName}</td>
                            <td className="px-4 py-3 text-gray-500 capitalize">{e.department || "—"}</td>
                            <td className="px-4 py-3 text-gray-700 font-mono text-xs">{fmtHours(e.regularHours)}</td>
                            <td className="px-4 py-3 font-mono text-xs">
                              <span className={parseFloat(e.overtimeHours) > 0 ? "text-amber-700 font-semibold" : "text-gray-400"}>
                                {fmtHours(e.overtimeHours)}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs">
                              <span className={parseFloat(e.doubleTimeHours) > 0 ? "text-red-600 font-semibold" : "text-gray-400"}>
                                {fmtHours(e.doubleTimeHours)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-600">${parseFloat(e.hourlyRate).toFixed(2)}/hr</td>
                            <td className="px-4 py-3 font-semibold text-gray-900">{fmtCurrency(e.grossPay)}</td>
                          </tr>
                        ))}
                        {/* Totals row */}
                        <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                          <td className="px-4 py-3 text-gray-700" colSpan={2}>Totals</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-700">{fmtHours(totals.regularHours)}</td>
                          <td className="px-4 py-3 font-mono text-xs">
                            <span className={totals.overtimeHours > 0 ? "text-amber-700" : "text-gray-500"}>
                              {fmtHours(totals.overtimeHours)}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">
                            <span className={totals.doubleTimeHours > 0 ? "text-red-600" : "text-gray-500"}>
                              {fmtHours(totals.doubleTimeHours)}
                            </span>
                          </td>
                          <td className="px-4 py-3" />
                          <td className="px-4 py-3 text-gray-900">{fmtCurrency(totals.grossPay)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {statusGte(period.status, "calculated") && entries.length === 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
                  <p className="text-sm text-gray-500">No approved time entries found for this period.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!selectedId && !periodsLoading && periods.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-sm text-gray-500">Select a pay period from the list below.</p>
        </div>
      )}

      {/* Periods list */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          onClick={() => setPeriodsExpanded(v => !v)}
        >
          <span>All Pay Periods {periods.length > 0 && `(${periods.length})`}</span>
          {periodsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {periodsExpanded && (
          periodsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : periods.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-500">No pay periods created yet.</p>
              <Button onClick={() => setNewPeriodOpen(true)} variant="outline" size="sm" className="mt-3 gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Create First Period
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto border-t border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {["Date Range", "Status", "Employees", "Total Pay", ""].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {periods.map(p => (
                    <tr
                      key={p.id}
                      className={`transition-colors cursor-pointer ${selectedId === p.id ? "bg-blue-50" : "hover:bg-gray-50"}`}
                      onClick={() => setSelectedId(p.id)}
                    >
                      <td className="px-4 py-3">
                        <span className={`font-medium ${selectedId === p.id ? "text-blue-700" : "text-gray-900"}`}>
                          {fmtPeriod(p)}
                        </span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3 text-gray-600">{p.totalEmployees}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {statusGte(p.status, "calculated") ? fmtCurrency(p.totalGrossPay) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {selectedId !== p.id && (
                          <Button size="sm" variant="outline" className="h-7 px-3 text-xs">Select</Button>
                        )}
                        {selectedId === p.id && (
                          <span className="text-xs text-blue-600 font-medium">Selected</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* New Pay Period dialog */}
      <Dialog open={newPeriodOpen} onOpenChange={v => !v && setNewPeriodOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Pay Period</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="pstart">Start Date <span className="text-red-500">*</span></Label>
                <Input
                  id="pstart"
                  type="date"
                  value={newStart}
                  onChange={e => { setNewStart(e.target.value); setNewPeriodErrors({}); }}
                />
                {newPeriodErrors.start && <p className="text-xs text-red-500">{newPeriodErrors.start}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="pend">End Date <span className="text-red-500">*</span></Label>
                <Input
                  id="pend"
                  type="date"
                  value={newEnd}
                  onChange={e => { setNewEnd(e.target.value); setNewPeriodErrors({}); }}
                />
                {newPeriodErrors.end && <p className="text-xs text-red-500">{newPeriodErrors.end}</p>}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pnotes">Notes (optional)</Label>
              <Textarea
                id="pnotes"
                placeholder="e.g., Q1 2026 first half"
                value={newNotes}
                onChange={e => setNewNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewPeriodOpen(false)}>Cancel</Button>
            <Button
              onClick={() => { if (validateNewPeriod()) createMutation.mutate(); }}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Create Period
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve dialog — type-to-confirm */}
      <Dialog open={approveOpen} onOpenChange={v => !v && setApproveOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve Payroll</DialogTitle>
          </DialogHeader>
          {period && (
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Period</span>
                  <span className="font-medium text-gray-900">{fmtPeriod(period)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Employees</span>
                  <span className="font-medium text-gray-900">{period.totalEmployees}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Regular Hours</span>
                  <span className="font-medium text-gray-900">{fmtHours(period.totalRegularHours)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Overtime Hours</span>
                  <span className={`font-medium ${parseFloat(period.totalOvertimeHours) > 0 ? "text-amber-700" : "text-gray-900"}`}>
                    {fmtHours(period.totalOvertimeHours)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-1.5 mt-1.5">
                  <span className="font-semibold text-gray-700">Gross Pay</span>
                  <span className="font-bold text-gray-900 text-base">{fmtCurrency(period.totalGrossPay)}</span>
                </div>
              </div>
              <p className="text-sm text-gray-600">
                Once approved, this payroll cannot be modified. Type <strong>APPROVE</strong> below to confirm.
              </p>
              <div className="space-y-1">
                <Input
                  value={approveText}
                  onChange={e => setApproveText(e.target.value)}
                  placeholder="Type APPROVE to confirm"
                  className="font-mono"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => approveMutation.mutate()}
              disabled={approveText !== "APPROVE" || approveMutation.isPending}
            >
              {approveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Approve Payroll
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
