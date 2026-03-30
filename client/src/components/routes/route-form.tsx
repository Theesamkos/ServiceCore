import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { Route, Employee } from "@shared/schema";

const ZONES = ["North", "South", "East", "West", "Downtown", "Highway"];

interface RouteFormProps {
  open: boolean;
  onClose: () => void;
  route?: Route;
}

const todayStr = () => new Date().toISOString().split("T")[0];

interface FormState {
  name: string;
  zone: string;
  assignedDriverId: string;
  date: string;
  estimatedHours: string;
}

const EMPTY: FormState = {
  name: "", zone: "", assignedDriverId: "", date: todayStr(), estimatedHours: "8",
};

export function RouteForm({ open, onClose, route }: RouteFormProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    if (open) {
      if (route) {
        setForm({
          name: route.name,
          zone: route.zone ?? "",
          assignedDriverId: route.assignedDriverId ? String(route.assignedDriverId) : "",
          date: route.date,
          estimatedHours: route.estimatedHours,
        });
      } else {
        setForm(EMPTY);
      }
      setErrors({});
    }
  }, [open, route]);

  const { data: driversData } = useQuery<{ data: Employee[] }>({
    queryKey: ["/api/employees", "drivers-active"],
    queryFn: () => apiRequest("/api/employees?role=driver&status=active&limit=100"),
    enabled: open,
  });
  const drivers = driversData?.data ?? [];

  function set(field: keyof FormState, value: string) {
    setForm(p => ({ ...p, [field]: value }));
    setErrors(p => ({ ...p, [field]: undefined }));
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) errs.name = "Required";
    if (!form.date) errs.date = "Required";
    const hrs = parseFloat(form.estimatedHours);
    if (!form.estimatedHours || isNaN(hrs) || hrs < 0.5 || hrs > 16) {
      errs.estimatedHours = "Must be between 0.5 and 16";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        zone: form.zone || undefined,
        assignedDriverId: form.assignedDriverId || undefined,
        date: form.date,
        estimatedHours: form.estimatedHours,
      };
      if (route) {
        return apiRequest(`/api/routes/${route.id}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      return apiRequest("/api/routes", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/routes"] });
      toast({ title: route ? "Route updated" : "Route created successfully" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{route ? "Edit Route" : "Add Route"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Route Name <span className="text-red-500">*</span></Label>
            <Input
              id="name"
              placeholder="e.g., Route A - North Industrial"
              value={form.name}
              onChange={e => set("name", e.target.value)}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Zone / Area</Label>
              <Select value={form.zone} onValueChange={v => set("zone", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select zone..." />
                </SelectTrigger>
                <SelectContent>
                  {ZONES.map(z => (
                    <SelectItem key={z} value={z}>{z}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Assigned Driver</Label>
              <Select value={form.assignedDriverId} onValueChange={v => set("assignedDriverId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {drivers.map(d => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.firstName} {d.lastName} — ${parseFloat(d.hourlyRate).toFixed(2)}/hr
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="date">Date <span className="text-red-500">*</span></Label>
              <Input id="date" type="date" value={form.date} onChange={e => set("date", e.target.value)} />
              {errors.date && <p className="text-xs text-red-500">{errors.date}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="hours">Estimated Hours <span className="text-red-500">*</span></Label>
              <Input
                id="hours"
                type="number"
                min="0.5"
                max="16"
                step="0.5"
                value={form.estimatedHours}
                onChange={e => set("estimatedHours", e.target.value)}
              />
              {errors.estimatedHours && <p className="text-xs text-red-500">{errors.estimatedHours}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              {route ? "Save Changes" : "Create Route"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
