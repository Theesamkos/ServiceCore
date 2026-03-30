import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2, Clock, Loader2, Plus, X, User,
} from "lucide-react";
import type { Route, RouteStop, Employee, TimeEntry } from "@shared/schema";

type EnrichedRoute = Route & {
  driverName: string | null;
  laborCost: string;
  revenue: string;
  margin: string | null;
  stops: RouteStop[];
  driver: Employee | null;
  timeEntries: TimeEntry[];
};

interface RouteDetailProps {
  routeId: number;
  open: boolean;
  onClose: () => void;
}

const SERVICE_TYPES = ["delivery", "service", "pickup", "pump_out", "emergency"];

const serviceTypeBadge: Record<string, string> = {
  delivery: "bg-blue-100 text-blue-800",
  service: "bg-green-100 text-green-800",
  pickup: "bg-amber-100 text-amber-800",
  pump_out: "bg-purple-100 text-purple-800",
  emergency: "bg-red-100 text-red-800",
};

function marginColor(margin: string | null): string {
  if (!margin) return "text-gray-500";
  const n = parseFloat(margin);
  if (n > 30) return "text-green-600 font-medium";
  if (n >= 0) return "text-amber-600";
  return "text-red-600 font-semibold";
}

interface AddStopForm {
  sequence: string;
  customerName: string;
  address: string;
  serviceType: string;
  estimatedMinutes: string;
  lat: string;
  lng: string;
  notes: string;
}

interface CompleteStopState {
  stopId: number | null;
  actualMinutes: string;
  notes: string;
}

export function RouteDetail({ routeId, open, onClose }: RouteDetailProps) {
  const qc = useQueryClient();
  const [showAddStop, setShowAddStop] = useState(false);
  const [addForm, setAddForm] = useState<AddStopForm>({
    sequence: "", customerName: "", address: "", serviceType: "service",
    estimatedMinutes: "30", lat: "", lng: "", notes: "",
  });
  const [addErrors, setAddErrors] = useState<Partial<AddStopForm>>({});
  const [completeState, setCompleteState] = useState<CompleteStopState>({ stopId: null, actualMinutes: "", notes: "" });

  const { data: routeData, isLoading } = useQuery<{ data: EnrichedRoute }>({
    queryKey: ["/api/routes", routeId],
    queryFn: () => apiRequest(`/api/routes/${routeId}`),
    enabled: open && !!routeId,
  });
  const route = routeData?.data;
  const stops = route?.stops ?? [];

  const addStopMutation = useMutation({
    mutationFn: () => apiRequest(`/api/routes/${routeId}/stops`, {
      method: "POST",
      body: JSON.stringify({
        sequence: parseInt(addForm.sequence) || (stops.length + 1),
        customerName: addForm.customerName,
        address: addForm.address,
        serviceType: addForm.serviceType,
        estimatedMinutes: parseInt(addForm.estimatedMinutes),
        lat: addForm.lat || undefined,
        lng: addForm.lng || undefined,
        notes: addForm.notes || undefined,
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/routes", routeId] });
      toast({ title: "Stop added" });
      setShowAddStop(false);
      setAddForm({ sequence: "", customerName: "", address: "", serviceType: "service", estimatedMinutes: "30", lat: "", lng: "", notes: "" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const completeStopMutation = useMutation({
    mutationFn: ({ stopId, actualMinutes, notes }: { stopId: number; actualMinutes: string; notes: string }) =>
      apiRequest(`/api/routes/${routeId}/stops/${stopId}/complete`, {
        method: "PATCH",
        body: JSON.stringify({
          actualMinutes: actualMinutes ? parseInt(actualMinutes) : undefined,
          notes: notes || undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/routes", routeId] });
      qc.invalidateQueries({ queryKey: ["/api/routes"] });
      toast({ title: "Stop completed" });
      setCompleteState({ stopId: null, actualMinutes: "", notes: "" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function validateAddForm(): boolean {
    const errs: Partial<AddStopForm> = {};
    if (!addForm.customerName.trim()) errs.customerName = "Required";
    if (!addForm.address.trim()) errs.address = "Required";
    const mins = parseInt(addForm.estimatedMinutes);
    if (!addForm.estimatedMinutes || isNaN(mins) || mins < 5 || mins > 240) {
      errs.estimatedMinutes = "Must be 5–240";
    }
    setAddErrors(errs);
    return Object.keys(errs).length === 0;
  }

  const pct = route && route.totalStops > 0
    ? Math.round((route.completedStops / route.totalStops) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {isLoading || !route ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{route.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    {route.zone && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-blue-300 text-blue-700">
                        {route.zone}
                      </span>
                    )}
                    <StatusBadge status={route.status} />
                  </div>
                </div>
              </div>
            </DialogHeader>

            {/* Driver info */}
            <div className="flex items-center gap-3 py-3 border-b border-gray-100">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-xs font-semibold text-blue-700">
                {route.driver
                  ? `${route.driver.firstName[0]}${route.driver.lastName[0]}`
                  : <User className="w-4 h-4 text-gray-400" />}
              </div>
              <div>
                {route.driver ? (
                  <>
                    <p className="text-sm font-medium text-gray-900">{route.driverName}</p>
                    <p className="text-xs text-gray-500">${parseFloat(route.driver.hourlyRate).toFixed(2)}/hr</p>
                  </>
                ) : (
                  <p className="text-sm italic text-gray-400">Unassigned</p>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Progress</span>
                <span className="font-medium text-gray-900">{route.completedStops}/{route.totalStops} stops — {pct}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Est. Hours", value: `${parseFloat(route.estimatedHours).toFixed(1)}h` },
                { label: "Labor Cost", value: `$${parseFloat(route.laborCost).toFixed(2)}` },
                { label: "Revenue", value: `$${parseFloat(route.revenue).toFixed(2)}` },
                {
                  label: "Margin",
                  value: route.margin !== null ? `${route.margin}%` : "N/A",
                  colorClass: marginColor(route.margin),
                },
              ].map(stat => (
                <div key={stat.label} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-500 mb-0.5">{stat.label}</p>
                  <p className={`text-base font-semibold ${stat.colorClass ?? "text-gray-900"}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Stops table */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Stops</h3>
              {stops.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No stops added yet</p>
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {["#", "Customer", "Service", "Est.", "Actual", "Status", ""].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {stops.map(stop => (
                        <tr
                          key={stop.id}
                          className={stop.status === "completed" ? "bg-gray-50" : "bg-white"}
                        >
                          <td className="px-3 py-2 text-gray-500">{stop.sequence}</td>
                          <td className="px-3 py-2">
                            <p className={`font-medium text-gray-900 ${stop.status === "skipped" ? "line-through" : ""}`}>
                              {stop.customerName}
                            </p>
                            <p className="text-xs text-gray-400 truncate max-w-[140px]">{stop.address}</p>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${serviceTypeBadge[stop.serviceType] ?? "bg-gray-100 text-gray-600"}`}>
                              {stop.serviceType.replace("_", " ")}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-600">{stop.estimatedMinutes}m</td>
                          <td className="px-3 py-2 text-gray-600">
                            {stop.durationMinutes ? `${stop.durationMinutes}m` : "—"}
                          </td>
                          <td className="px-3 py-2">
                            {stop.status === "completed" ? (
                              <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Done
                              </span>
                            ) : stop.status === "in_progress" ? (
                              <span className="flex items-center gap-1 text-xs text-blue-600">
                                <Clock className="w-3.5 h-3.5 animate-pulse" /> In Progress
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">Pending</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {stop.status === "pending" && (
                              completeState.stopId === stop.id ? (
                                <div className="flex items-center gap-1.5 min-w-[200px]">
                                  <Input
                                    type="number"
                                    placeholder="Min"
                                    value={completeState.actualMinutes}
                                    onChange={e => setCompleteState(p => ({ ...p, actualMinutes: e.target.value }))}
                                    className="h-7 w-16 text-xs px-1.5"
                                  />
                                  <Button
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => completeStopMutation.mutate({
                                      stopId: stop.id,
                                      actualMinutes: completeState.actualMinutes,
                                      notes: completeState.notes,
                                    })}
                                    disabled={completeStopMutation.isPending}
                                  >
                                    {completeStopMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                  </Button>
                                  <button
                                    className="text-gray-400 hover:text-gray-600"
                                    onClick={() => setCompleteState({ stopId: null, actualMinutes: "", notes: "" })}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                                  onClick={() => setCompleteState({ stopId: stop.id, actualMinutes: "", notes: "" })}
                                >
                                  Complete
                                </Button>
                              )
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Add Stop */}
              {!showAddStop ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-1.5"
                  onClick={() => {
                    setAddForm(p => ({ ...p, sequence: String(stops.length + 1) }));
                    setShowAddStop(true);
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Stop
                </Button>
              ) : (
                <div className="mt-3 p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3">
                  <h4 className="text-sm font-semibold text-gray-700">New Stop</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Customer Name *</Label>
                      <Input
                        placeholder="Customer name"
                        value={addForm.customerName}
                        onChange={e => setAddForm(p => ({ ...p, customerName: e.target.value }))}
                        className="h-8 text-sm"
                      />
                      {addErrors.customerName && <p className="text-xs text-red-500">{addErrors.customerName}</p>}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Address *</Label>
                      <Input
                        placeholder="Street address"
                        value={addForm.address}
                        onChange={e => setAddForm(p => ({ ...p, address: e.target.value }))}
                        className="h-8 text-sm"
                      />
                      {addErrors.address && <p className="text-xs text-red-500">{addErrors.address}</p>}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Service Type</Label>
                      <Select value={addForm.serviceType} onValueChange={v => setAddForm(p => ({ ...p, serviceType: v }))}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SERVICE_TYPES.map(t => (
                            <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Est. Minutes *</Label>
                      <Input
                        type="number"
                        min="5"
                        max="240"
                        value={addForm.estimatedMinutes}
                        onChange={e => setAddForm(p => ({ ...p, estimatedMinutes: e.target.value }))}
                        className="h-8 text-sm"
                      />
                      {addErrors.estimatedMinutes && <p className="text-xs text-red-500">{addErrors.estimatedMinutes}</p>}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">GPS Lat (optional)</Label>
                      <Input
                        type="number"
                        step="any"
                        placeholder="30.2672"
                        value={addForm.lat}
                        onChange={e => setAddForm(p => ({ ...p, lat: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">GPS Lng (optional)</Label>
                      <Input
                        type="number"
                        step="any"
                        placeholder="-97.7431"
                        value={addForm.lng}
                        onChange={e => setAddForm(p => ({ ...p, lng: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Notes (optional)</Label>
                    <Textarea
                      placeholder="Any notes for this stop..."
                      value={addForm.notes}
                      onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))}
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => { if (validateAddForm()) addStopMutation.mutate(); }}
                      disabled={addStopMutation.isPending}
                    >
                      {addStopMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                      Add Stop
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowAddStop(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
