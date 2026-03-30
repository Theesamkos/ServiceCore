import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Employee } from "@shared/schema";
import { apiRequest } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface EmployeeFormProps {
  open: boolean;
  onClose: () => void;
  employee?: Employee;
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  hourlyRate: string;
  overtimeRate: string;
  cdlClass: string;
  cdlExpiry: string;
  hireDate: string;
  status: string;
}

const EMPTY: FormState = {
  firstName: "", lastName: "", email: "", phone: "",
  role: "driver", department: "operations",
  hourlyRate: "", overtimeRate: "",
  cdlClass: "none", cdlExpiry: "",
  hireDate: "", status: "active",
};

function toForm(emp: Employee): FormState {
  return {
    firstName: emp.firstName,
    lastName: emp.lastName,
    email: emp.email ?? "",
    phone: emp.phone ?? "",
    role: emp.role,
    department: emp.department ?? "operations",
    hourlyRate: emp.hourlyRate,
    overtimeRate: emp.overtimeRate,
    cdlClass: emp.cdlClass ?? "none",
    cdlExpiry: emp.cdlExpiry ?? "",
    hireDate: emp.hireDate,
    status: emp.status,
  };
}

export function EmployeeForm({ open, onClose, employee }: EmployeeFormProps) {
  const isEdit = !!employee;
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    setForm(employee ? toForm(employee) : EMPTY);
    setErrors({});
  }, [employee, open]);

  function set(field: keyof FormState, value: string) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      // Auto-calc OT rate when hourly rate changes (only if OT hasn't been manually changed)
      if (field === "hourlyRate") {
        const rate = parseFloat(value);
        if (!isNaN(rate)) {
          next.overtimeRate = (rate * 1.5).toFixed(2);
        }
      }
      return next;
    });
    setErrors(prev => ({ ...prev, [field]: undefined }));
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.firstName.trim()) errs.firstName = "Required";
    if (!form.lastName.trim()) errs.lastName = "Required";
    if (!form.role) errs.role = "Required";
    if (!form.department) errs.department = "Required";
    if (!form.hourlyRate || parseFloat(form.hourlyRate) < 7.25) errs.hourlyRate = "Min $7.25";
    if (!form.hireDate) errs.hireDate = "Required";
    if (form.cdlClass !== "none" && !form.cdlExpiry) errs.cdlExpiry = "Required for CDL";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  const mutation = useMutation({
    mutationFn: async (data: FormState) => {
      const payload = {
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: data.email.trim() || null,
        phone: data.phone.trim() || null,
        role: data.role,
        department: data.department,
        hourlyRate: parseFloat(data.hourlyRate).toFixed(2),
        overtimeRate: parseFloat(data.overtimeRate).toFixed(2),
        hasCdl: data.cdlClass !== "none" ? 1 : 0,
        cdlClass: data.cdlClass !== "none" ? data.cdlClass : null,
        cdlExpiry: data.cdlClass !== "none" ? data.cdlExpiry : null,
        hireDate: data.hireDate,
        status: data.status,
        employmentType: "full_time",
        payType: "hourly",
        ...(isEdit ? {} : { employeeNumber: `EMP-${Date.now().toString().slice(-6)}` }),
      };
      if (isEdit) {
        return apiRequest(`/api/employees/${employee!.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      return apiRequest("/api/employees", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: isEdit ? "Employee updated" : "Employee added", variant: "default" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate(form);
  }

  const showCdlExpiry = form.cdlClass !== "none";

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Employee" : "Add Employee"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="firstName">First Name <span className="text-red-500">*</span></Label>
              <Input
                id="firstName"
                value={form.firstName}
                onChange={e => set("firstName", e.target.value)}
                placeholder="John"
              />
              {errors.firstName && <p className="text-xs text-red-500">{errors.firstName}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="lastName">Last Name <span className="text-red-500">*</span></Label>
              <Input
                id="lastName"
                value={form.lastName}
                onChange={e => set("lastName", e.target.value)}
                placeholder="Smith"
              />
              {errors.lastName && <p className="text-xs text-red-500">{errors.lastName}</p>}
            </div>
          </div>

          {/* Contact row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={e => set("email", e.target.value)}
                placeholder="john@servicecore.com"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={e => set("phone", e.target.value)}
                placeholder="5125551234"
              />
            </div>
          </div>

          {/* Role / Department */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Role <span className="text-red-500">*</span></Label>
              <Select value={form.role} onValueChange={v => set("role", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="driver">Driver</SelectItem>
                  <SelectItem value="technician">Technician</SelectItem>
                  <SelectItem value="mechanic">Mechanic</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
              {errors.role && <p className="text-xs text-red-500">{errors.role}</p>}
            </div>
            <div className="space-y-1">
              <Label>Department <span className="text-red-500">*</span></Label>
              <Select value={form.department} onValueChange={v => set("department", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="operations">Operations</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              {errors.department && <p className="text-xs text-red-500">{errors.department}</p>}
            </div>
          </div>

          {/* Pay rates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="hourlyRate">Hourly Rate ($) <span className="text-red-500">*</span></Label>
              <Input
                id="hourlyRate"
                type="number"
                min="7.25"
                max="200"
                step="0.01"
                value={form.hourlyRate}
                onChange={e => set("hourlyRate", e.target.value)}
                placeholder="25.00"
              />
              {errors.hourlyRate && <p className="text-xs text-red-500">{errors.hourlyRate}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="overtimeRate">OT Rate ($)</Label>
              <Input
                id="overtimeRate"
                type="number"
                min="7.25"
                max="300"
                step="0.01"
                value={form.overtimeRate}
                onChange={e => set("overtimeRate", e.target.value)}
                placeholder="37.50"
              />
            </div>
          </div>

          {/* CDL */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>CDL Status</Label>
              <Select value={form.cdlClass} onValueChange={v => set("cdlClass", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="A">Class A</SelectItem>
                  <SelectItem value="B">Class B</SelectItem>
                  <SelectItem value="permit">Permit</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {showCdlExpiry && (
              <div className="space-y-1">
                <Label htmlFor="cdlExpiry">CDL Expiry Date <span className="text-red-500">*</span></Label>
                <Input
                  id="cdlExpiry"
                  type="date"
                  value={form.cdlExpiry}
                  onChange={e => set("cdlExpiry", e.target.value)}
                />
                {errors.cdlExpiry && <p className="text-xs text-red-500">{errors.cdlExpiry}</p>}
              </div>
            )}
          </div>

          {/* Hire date + Status (edit only) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="hireDate">Hire Date <span className="text-red-500">*</span></Label>
              <Input
                id="hireDate"
                type="date"
                value={form.hireDate}
                onChange={e => set("hireDate", e.target.value)}
              />
              {errors.hireDate && <p className="text-xs text-red-500">{errors.hireDate}</p>}
            </div>
            {isEdit && (
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="on_leave">On Leave</SelectItem>
                    <SelectItem value="terminated">Terminated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {mutation.isError && (
            <p className="text-sm text-red-600">{(mutation.error as Error).message}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? "Save Changes" : "Add Employee"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
