import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, LogIn, LogOut, Coffee, Play, Wifi, WifiOff } from "lucide-react";
import type { Employee, TimeEntry } from "@shared/schema";

type WidgetEntry = TimeEntry & { breakStart?: string | null; clockInType?: string };

interface EmployeesResp { data: Employee[] }
interface TimeEntriesResp { data: WidgetEntry[] }
interface ClockInResp { data: WidgetEntry; geofenceMatch: { matched: boolean; geofenceName?: string } }

function pad(n: number) { return String(n).padStart(2, "0"); }

function elapsed(from: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 1000));
  return `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`;
}

function getGps(): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 5000 },
    );
  });
}

export function ClockWidget() {
  const qc = useQueryClient();
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [tick, setTick] = useState(0);

  // Running clock tick
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
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

  // Clock in
  const clockInMutation = useMutation({
    mutationFn: async () => {
      const gps = await getGps();
      return apiRequest<ClockInResp>("/api/time-entries/clock-in", {
        method: "POST",
        body: JSON.stringify({
          employeeId: parseInt(selectedEmpId),
          gpsLat: gps?.lat,
          gpsLng: gps?.lng,
        }),
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["/api/time-entries"] });
      refetchActive();
      const msg = res.geofenceMatch.matched
        ? `Clocked in — GPS Verified at ${res.geofenceMatch.geofenceName}`
        : "Clocked in — No GPS match";
      toast({ title: "Clocked in successfully", description: msg });
    },
    onError: (err: Error) => toast({ title: "Clock-in failed", description: err.message, variant: "destructive" }),
  });

  // Clock out
  const clockOutMutation = useMutation({
    mutationFn: async (): Promise<{ data: WidgetEntry }> => {
      const gps = await getGps();
      return apiRequest(`/api/time-entries/${activeEntry!.id}/clock-out`, {
        method: "PATCH",
        body: JSON.stringify({ gpsLat: gps?.lat, gpsLng: gps?.lng }),
      });
    },
    onSuccess: (res: { data: WidgetEntry }) => {
      qc.invalidateQueries({ queryKey: ["/api/time-entries"] });
      refetchActive();
      toast({ title: "Clocked out", description: `Total: ${parseFloat(res.data.totalHours ?? "0").toFixed(2)} hrs` });
    },
    onError: (err: Error) => toast({ title: "Clock-out failed", description: err.message, variant: "destructive" }),
  });

  // Start break
  const startBreakMutation = useMutation({
    mutationFn: () => apiRequest(`/api/time-entries/${activeEntry!.id}/start-break`, { method: "PATCH", body: "{}" }),
    onSuccess: () => { refetchActive(); toast({ title: "Break started" }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // End break
  const endBreakMutation = useMutation({
    mutationFn: () => apiRequest(`/api/time-entries/${activeEntry!.id}/end-break`, { method: "PATCH", body: "{}" }),
    onSuccess: () => { refetchActive(); toast({ title: "Break ended" }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const selEmployee = employees.find(e => String(e.id) === selectedEmpId);

  // Current clock display
  const [clockDisplay, setClockDisplay] = useState("");
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setClockDisplay(fmt());
    const t = setInterval(() => setClockDisplay(fmt()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-5">
      {!activeEntry ? (
        // ── State 1: Not clocked in ──────────────────────────────────────────
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-gray-400">
            <Clock className="w-5 h-5" />
            <span className="text-lg font-mono text-gray-700">{clockDisplay}</span>
          </div>
          <div className="flex-1 min-w-48">
            <Select value={selectedEmpId} onValueChange={setSelectedEmpId}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee to clock in..." />
              </SelectTrigger>
              <SelectContent>
                {employees.map(e => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.firstName} {e.lastName} — {e.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => clockInMutation.mutate()}
            disabled={!selectedEmpId || clockInMutation.isPending}
            className="gap-2"
          >
            <LogIn className="w-4 h-4" />
            Clock In
          </Button>
        </div>
      ) : onBreak ? (
        // ── State 3: On break ────────────────────────────────────────────────
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {selEmployee?.firstName} {selEmployee?.lastName} — On Break
              </p>
              <p className="text-xs text-gray-500">
                Break duration: <span className="font-mono">{elapsed(activeEntry.breakStart!)}</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => endBreakMutation.mutate()}
              disabled={endBreakMutation.isPending}
              className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
            >
              <Play className="w-3.5 h-3.5" />
              End Break
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => clockOutMutation.mutate()}
              disabled={clockOutMutation.isPending}
              className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              Clock Out
            </Button>
          </div>
        </div>
      ) : (
        // ── State 2: Clocked in ──────────────────────────────────────────────
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
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-blue-700 text-sm font-semibold">
                  {activeEntry.clockIn ? elapsed(activeEntry.clockIn) : "—"}
                </span>
                {activeEntry.clockInLat ? (
                  <span className="flex items-center gap-1 text-xs text-green-600"><Wifi className="w-3 h-3" /> GPS</span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-gray-400"><WifiOff className="w-3 h-3" /> No GPS</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => startBreakMutation.mutate()}
              disabled={startBreakMutation.isPending}
              className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              <Coffee className="w-3.5 h-3.5" />
              Start Break
            </Button>
            <Button
              size="sm"
              onClick={() => clockOutMutation.mutate()}
              disabled={clockOutMutation.isPending}
              className="gap-1.5 bg-red-600 hover:bg-red-700 text-white"
            >
              <LogOut className="w-3.5 h-3.5" />
              Clock Out
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
