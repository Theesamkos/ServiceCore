import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Clock, LogIn, LogOut, Coffee, Play, Wifi, WifiOff,
  Loader2, Navigation, Shield, ShieldCheck, ShieldAlert,
  CheckCircle2, AlertTriangle,
} from "lucide-react";
import type { Employee, TimeEntry } from "@shared/schema";
import { DriverTrackingMap } from "./driver-map";

type WidgetEntry = TimeEntry & { breakStart?: string | null; clockInType?: string };
interface EmployeesResp { data: Employee[] }
interface TimeEntriesResp { data: WidgetEntry[] }
interface ClockInResp { data: WidgetEntry; geofenceMatch: { matched: boolean; geofenceName?: string; distance?: number } }

function pad(n: number) { return String(n).padStart(2, "0"); }
function elapsed(from: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 1000));
  return `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`;
}

type GpsState = "idle" | "acquiring" | "acquired" | "denied" | "error";
interface GpsCoords { lat: number; lng: number; accuracy: number }

function GpsStatusBadge({ state, coords }: { state: GpsState; coords: GpsCoords | null }) {
  if (state === "idle") return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full font-medium">
      <Navigation className="w-3 h-3" />GPS standby
    </span>
  );
  if (state === "acquiring") return (
    <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full font-medium">
      <Loader2 className="w-3 h-3 animate-spin" />Acquiring GPS…
    </span>
  );
  if (state === "acquired" && coords) return (
    <span className="inline-flex items-center gap-1.5 text-xs text-green-700 bg-green-50 px-2.5 py-1 rounded-full font-medium">
      <Navigation className="w-3 h-3" />GPS Ready · ±{Math.round(coords.accuracy)}m
    </span>
  );
  if (state === "denied") return (
    <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full font-medium">
      <WifiOff className="w-3 h-3" />GPS denied — manual clock-in
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full font-medium">
      <WifiOff className="w-3 h-3" />No GPS
    </span>
  );
}

export function ClockWidget() {
  const qc = useQueryClient();
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [gpsState, setGpsState] = useState<GpsState>("idle");
  const [gpsCoords, setGpsCoords] = useState<GpsCoords | null>(null);
  const [lastGeofenceResult, setLastGeofenceResult] = useState<ClockInResp["geofenceMatch"] | null>(null);
  const [clockDisplay, setClockDisplay] = useState("");
  const [elapsedDisplay, setElapsedDisplay] = useState("00:00:00");


  // Live clock
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setClockDisplay(fmt());
    const t = setInterval(() => setClockDisplay(fmt()), 1000);
    return () => clearInterval(t);
  }, []);

  // Employees list
  const { data: empsData } = useQuery<EmployeesResp>({
    queryKey: ["/api/employees", "active"],
    queryFn: () => apiRequest("/api/employees?status=active&limit=100"),
  });
  const employees = empsData?.data ?? [];

  // Active entry for selected employee
  const { data: activeData, refetch: refetchActive } = useQuery<TimeEntriesResp>({
    queryKey: ["/api/time-entries/active", selectedEmpId],
    queryFn: () => apiRequest(`/api/time-entries?employeeId=${selectedEmpId}&status=active&limit=1`),
    enabled: !!selectedEmpId,
    refetchInterval: 30_000,
  });
  const activeEntry: WidgetEntry | undefined = activeData?.data?.[0];
  const onBreak = !!activeEntry?.breakStart;
  const selEmployee = employees.find(e => String(e.id) === selectedEmpId);

  // Update elapsed timer
  useEffect(() => {
    if (!activeEntry?.clockIn) return;
    const t = setInterval(() => setElapsedDisplay(elapsed(activeEntry.clockIn!)), 1000);
    setElapsedDisplay(elapsed(activeEntry.clockIn));
    return () => clearInterval(t);
  }, [activeEntry?.clockIn]);

  // Acquire GPS
  const acquireGps = useCallback(() => {
    if (!navigator.geolocation) { setGpsState("error"); return; }
    setGpsState("acquiring");
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGpsState("acquired");
      },
      err => {
        setGpsState(err.code === 1 ? "denied" : "error");
        setGpsCoords(null);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  // Auto-acquire GPS immediately on mount
  useEffect(() => { acquireGps(); }, [acquireGps]);



  // Clock in
  const clockInMutation = useMutation({
    mutationFn: (): Promise<ClockInResp> => apiRequest("/api/time-entries/clock-in", {
      method: "POST",
      body: JSON.stringify({
        employeeId: parseInt(selectedEmpId),
        gpsLat: gpsCoords?.lat ?? null,
        gpsLng: gpsCoords?.lng ?? null,
      }),
    }),
    onSuccess: (res) => {
      setLastGeofenceResult(res.geofenceMatch);
      qc.invalidateQueries({ queryKey: ["/api/time-entries"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      refetchActive();
      const { matched, geofenceName } = res.geofenceMatch;
      toast({
        title: matched ? `🛡️ Clocked in — Geofence verified` : `📍 Clocked in — GPS recorded`,
        description: matched
          ? `${selEmployee?.firstName} ${selEmployee?.lastName} verified at ${geofenceName}`
          : `${selEmployee?.firstName} ${selEmployee?.lastName} is now on the clock`,
      });
    },
    onError: (err: Error) => toast({ title: "Clock-in failed", description: err.message, variant: "destructive" }),
  });

  // Clock out
  const clockOutMutation = useMutation({
    mutationFn: (): Promise<{ data: WidgetEntry }> => apiRequest(`/api/time-entries/${activeEntry!.id}/clock-out`, {
      method: "PATCH",
      body: JSON.stringify({ gpsLat: gpsCoords?.lat ?? null, gpsLng: gpsCoords?.lng ?? null }),
    }),
    onSuccess: (res) => {
      setLastGeofenceResult(null);
      qc.invalidateQueries({ queryKey: ["/api/time-entries"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      refetchActive();
      toast({ title: "✅ Clocked out", description: `${selEmployee?.firstName} ${selEmployee?.lastName} — ${parseFloat(res.data.totalHours ?? "0").toFixed(2)} hrs recorded` });
    },
    onError: (err: Error) => toast({ title: "Clock-out failed", description: err.message, variant: "destructive" }),
  });

  // Break start
  const startBreakMutation = useMutation({
    mutationFn: () => apiRequest(`/api/time-entries/${activeEntry!.id}/start-break`, { method: "PATCH", body: "{}" }),
    onSuccess: () => { refetchActive(); toast({ title: "☕ Break started" }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Break end
  const endBreakMutation = useMutation({
    mutationFn: () => apiRequest(`/api/time-entries/${activeEntry!.id}/end-break`, { method: "PATCH", body: "{}" }),
    onSuccess: () => { refetchActive(); toast({ title: "▶️ Break ended — back on clock" }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 space-y-3">
      {!activeEntry ? (
        /* ── Not clocked in ─────────────────────────────────────────────── */
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-gray-400">
              <Clock className="w-5 h-5" />
              <span className="text-lg font-mono text-gray-700 tabular-nums">{clockDisplay}</span>
            </div>
            <div className="flex-1 min-w-48">
              <Select value={selectedEmpId} onValueChange={setSelectedEmpId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select employee to clock in…" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.firstName} {e.lastName}
                      <span className="ml-1.5 text-gray-400 text-xs capitalize">— {e.role}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => clockInMutation.mutate()}
              disabled={!selectedEmpId || clockInMutation.isPending || gpsState === "acquiring"}
              className="gap-2 bg-blue-600 hover:bg-blue-700 h-9"
            >
              {clockInMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              Clock In
            </Button>
          </div>

          {/* GPS status row */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <GpsStatusBadge state={gpsState} coords={gpsCoords} />
              {(gpsState === "denied" || gpsState === "error") && (
                <button onClick={acquireGps} className="text-xs text-blue-600 underline hover:text-blue-800">
                  Retry GPS
                </button>
              )}
            </div>

          </div>

          {/* Live tracking map — always visible */}
          <div className="pt-1">
            <DriverTrackingMap
              driverCoords={gpsCoords}
              employeeName={selEmployee ? `${selEmployee.firstName} ${selEmployee.lastName}` : undefined}
              isClocked={false}
            />
          </div>

          {/* Geofence result after clock-in */}
          {lastGeofenceResult && (
            lastGeofenceResult.matched ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm">
                <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
                <div>
                  <span className="font-semibold text-green-800">Geofence verified</span>
                  <span className="text-green-600 ml-1">— {lastGeofenceResult.geofenceName}</span>
                  {lastGeofenceResult.distance !== undefined && (
                    <span className="text-green-500 text-xs ml-1">({lastGeofenceResult.distance}m away)</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                <div>
                  <span className="font-semibold text-amber-800">Outside geofence</span>
                  {lastGeofenceResult.distance !== undefined && (
                    <span className="text-amber-600 ml-1 text-xs">— {(lastGeofenceResult.distance / 1000).toFixed(1)}km from nearest site</span>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      ) : onBreak ? (
        /* ── On break ───────────────────────────────────────────────────── */
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {selEmployee?.firstName} {selEmployee?.lastName}
                <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">On Break</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5 font-mono">
                Break: {activeEntry.breakStart ? elapsed(activeEntry.breakStart) : "—"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => endBreakMutation.mutate()}
              disabled={endBreakMutation.isPending}
              className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50">
              <Play className="w-3.5 h-3.5" />End Break
            </Button>
            <Button size="sm" onClick={() => clockOutMutation.mutate()}
              disabled={clockOutMutation.isPending}
              className="gap-1.5 bg-red-600 hover:bg-red-700 text-white">
              <LogOut className="w-3.5 h-3.5" />Clock Out
            </Button>
          </div>
        </div>
      ) : (
        /* ── Clocked in ─────────────────────────────────────────────────── */
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {selEmployee?.firstName} {selEmployee?.lastName}
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    since {activeEntry.clockIn ? new Date(activeEntry.clockIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </span>
                </p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="font-mono text-blue-700 text-sm font-semibold tabular-nums">{elapsedDisplay}</span>
                  {activeEntry.clockInLat ? (
                    <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                      <Wifi className="w-3 h-3" />
                      {activeEntry.clockInType === "geofence" ? "Geofence ✓" : "GPS"}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <WifiOff className="w-3 h-3" />Manual
                    </span>
                  )}
                  {activeEntry.geofenceVerified === 1 && (
                    <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                      <Shield className="w-3 h-3" />Verified
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">

              <Button variant="outline" size="sm" onClick={() => startBreakMutation.mutate()}
                disabled={startBreakMutation.isPending}
                className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50">
                <Coffee className="w-3.5 h-3.5" />Break
              </Button>
              <Button size="sm" onClick={() => clockOutMutation.mutate()}
                disabled={clockOutMutation.isPending}
                className="gap-1.5 bg-red-600 hover:bg-red-700 text-white">
                {clockOutMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                Clock Out
              </Button>
            </div>
          </div>

          {/* Geofence status banner */}
          {activeEntry.geofenceVerified === 1 ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              Clocked in within verified geofence zone
            </div>
          ) : activeEntry.clockInLat ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              GPS recorded — outside geofence boundary
            </div>
          ) : null}

          {/* Live tracking map — always visible */}
          <div className="pt-1">
            <DriverTrackingMap
              driverCoords={gpsCoords}
              employeeName={selEmployee ? `${selEmployee.firstName} ${selEmployee.lastName}` : undefined}
              targetGeofenceId={activeEntry.geofenceId ?? undefined}
              isClocked={true}
            />
          </div>
        </div>
      )}
    </div>
  );
}
