import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { Employee } from "@shared/schema";

interface TimeEntryFormProps {
  open: boolean;
  onClose: () => void;
}

interface FormState {
  employeeId: string;
  date: string;
  clockIn: string;
  clockOut: string;
  breakMinutes: string;
  notes: string;
}

const todayStr = () => new Date().toISOString().split("T")[0];

const EMPTY: FormState = {
  employeeId: "", date: todayStr(), clockIn: "", clockOut: "", breakMinutes: "0", notes: "",
};

function calcHours(ci: string, co: string, breakMins: string): string | null {
  if (!ci || !co) return null;
  const ciMs = new Date(`2000-01-01T${ci}`).getTime();
  const coMs = new Date(`2000-01-01T${co}`).getTime();
  if (coMs <= ciMs) return null;
  const total = (coMs - ciMs) / 60000 - (parseInt(breakMins) || 0);
  return total > 0 ? (total / 60).toFixed(2) : null;
}

export function TimeEntryForm({ open, onClose }: TimeEntryFormProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    if (open) { setForm(EMPTY); setErrors({}); }
  }, [open]);

  const { data: empsData } = useQuery<{ data: Employee[] }>({
    queryKey: ["/api/employees", "active"],
    queryFn: () => apiRequest("/api/employees?status=active&limit=100"),
  });
  const employees = empsData?.data ?? [];

  function set(field: keyof FormState, value: string) {
    setForm(p => ({ ...p, [field]: value }));
    setErrors(p => ({ ...p, [field]: undefined }));
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.employeeId) errs.employeeId = "Required";
    if (!form.date) errs.date = "Required";
    if (!form.clockIn) errs.clockIn = "Required";
    if (!form.clockOut) errs.clockOut = "Required";
    if (form.clockIn && form.clockOut) {
      const ci = new Date(`2000-01-01T${form.clockIn}`).getTime();
      const co = new Date(`2000-01-01T${form.clockOut}`).getTime();
      if (co <= ci) errs.clockOut = "Must be after clock in";
      const hours = calcHours(form.clockIn, form.clockOut, form.breakMinutes);
      if (hours && parseFloat(hours) > 24) errs.clockOut = "Cannot exceed 24 hours";
    }
    if (!form.notes.trim() || form.notes.trim().length < 5) errs.notes = "Required (min 5 characters)";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  const mutation = useMutation({
    mutationFn: () => apiRequest("/api/time-entries", {
      method: "POST",
      body: JSON.stringify({
        employeeId: parseInt(form.employeeId),
        date: form.date,
        clockIn: `${form.date}T${form.clockIn}:00.000Z`,
        clockOut: `${form.date}T${form.clockOut}:00.000Z`,
        breakMinutes: parseInt(form.breakMinutes) || 0,
        notes: form.notes.trim(),
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({ title: "Time entry created" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate();
  }

  const calculatedHours = calcHours(form.clockIn, form.clockOut, form.breakMinutes);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Manual Time Entry</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Employee <span className="text-red-500">*</span></Label>
            <Select value={form.employeeId} onValueChange={v => set("employeeId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee..." />
              </SelectTrigger>
              <SelectContent>
                {employees.map(e => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.firstName} {e.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.employeeId && <p className="text-xs text-red-500">{errors.employeeId}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="date">Date <span className="text-red-500">*</span></Label>
            <Input id="date" type="date" max={todayStr()} value={form.date} onChange={e => set("date", e.target.value)} />
            {errors.date && <p className="text-xs text-red-500">{errors.date}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="clockIn">Clock In <span className="text-red-500">*</span></Label>
              <Input id="clockIn" type="time" value={form.clockIn} onChange={e => set("clockIn", e.target.value)} />
              {errors.clockIn && <p className="text-xs text-red-500">{errors.clockIn}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="clockOut">Clock Out <span className="text-red-500">*</span></Label>
              <Input id="clockOut" type="time" value={form.clockOut} onChange={e => set("clockOut", e.target.value)} />
              {errors.clockOut && <p className="text-xs text-red-500">{errors.clockOut}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 items-end">
            <div className="space-y-1">
              <Label htmlFor="breakMinutes">Break (minutes)</Label>
              <Input id="breakMinutes" type="number" min="0" max="480" value={form.breakMinutes} onChange={e => set("breakMinutes", e.target.value)} />
            </div>
            {calculatedHours && (
              <div className="pb-0.5">
                <p className="text-sm text-gray-500">Total hours</p>
                <p className="text-lg font-semibold text-gray-900">{calculatedHours} hrs</p>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Reason for Manual Entry <span className="text-red-500">*</span></Label>
            <Textarea
              id="notes"
              placeholder="Reason for manual entry..."
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              rows={3}
            />
            {errors.notes && <p className="text-xs text-red-500">{errors.notes}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Entry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
