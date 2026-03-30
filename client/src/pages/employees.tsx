import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Employee } from "@shared/schema";
import { apiRequest } from "@/lib/api";
import { EmployeeCard } from "@/components/employees/employee-card";
import { EmployeeForm } from "@/components/employees/employee-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Users } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

interface EmployeesResponse {
  data: Employee[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-gray-200 rounded-full shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 bg-gray-200 rounded w-32" />
          <div className="h-3 bg-gray-100 rounded w-20" />
        </div>
      </div>
      <div className="flex gap-1.5">
        <div className="h-5 w-14 bg-gray-200 rounded-full" />
        <div className="h-5 w-20 bg-gray-100 rounded-full" />
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex justify-between">
            <div className="h-3 bg-gray-100 rounded w-14" />
            <div className="h-3 bg-gray-200 rounded w-20" />
          </div>
        ))}
      </div>
      <div className="h-8 bg-gray-100 rounded mt-1" />
    </div>
  );
}

export default function EmployeesPage() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Employee | undefined>();

  const debouncedSearch = useDebounce(search, 300);

  const params = new URLSearchParams();
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (roleFilter !== "all") params.set("role", roleFilter);
  if (deptFilter !== "all") params.set("department", deptFilter);
  if (statusFilter !== "all") params.set("status", statusFilter);
  params.set("limit", "100");

  const { data, isLoading } = useQuery<EmployeesResponse>({
    queryKey: ["/api/employees", debouncedSearch, roleFilter, deptFilter, statusFilter],
    queryFn: () => apiRequest(`/api/employees?${params}`),
  });

  const employees = data?.data ?? [];
  const total = data?.pagination.total ?? 0;

  function openAdd() {
    setEditTarget(undefined);
    setFormOpen(true);
  }
  function openEdit(emp: Employee) {
    setEditTarget(emp);
    setFormOpen(true);
  }
  function closeForm() {
    setFormOpen(false);
    setEditTarget(undefined);
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Employees & Drivers</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isLoading ? "Loading..." : `${total} employee${total !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Employee
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48 max-w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search employees..."
            className="pl-8"
          />
        </div>

        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="driver">Driver</SelectItem>
            <SelectItem value="technician">Technician</SelectItem>
            <SelectItem value="mechanic">Mechanic</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
          </SelectContent>
        </Select>

        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            <SelectItem value="operations">Operations</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="on_leave">On Leave</SelectItem>
            <SelectItem value="terminated">Terminated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
            <Users className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-900">No employees found</p>
          <p className="text-sm text-gray-500 mt-1">
            {search || roleFilter !== "all" || deptFilter !== "all" || statusFilter !== "all"
              ? "Try adjusting your filters"
              : "Add your first employee to get started"}
          </p>
          {!search && roleFilter === "all" && deptFilter === "all" && statusFilter === "all" && (
            <Button onClick={openAdd} className="mt-4 gap-2">
              <Plus className="w-4 h-4" />
              Add Employee
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {employees.map(emp => (
            <EmployeeCard key={emp.id} employee={emp} onEdit={openEdit} />
          ))}
        </div>
      )}

      <EmployeeForm open={formOpen} onClose={closeForm} employee={editTarget} />
    </div>
  );
}
