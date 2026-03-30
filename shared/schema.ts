import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── 1. EMPLOYEES ─────────────────────────────────────────────────────────────
export const employees = sqliteTable("employees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeNumber: text("employee_number").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  // Employment
  role: text("role").notNull().default("driver"),
  department: text("department"),
  employmentType: text("employment_type").notNull().default("full_time"),
  payType: text("pay_type").notNull().default("hourly"),
  hourlyRate: text("hourly_rate").notNull().default("0.00"),
  overtimeRate: text("overtime_rate").notNull().default("0.00"),
  // CDL tracking
  hasCdl: integer("has_cdl").notNull().default(0),
  cdlClass: text("cdl_class"),
  cdlExpiry: text("cdl_expiry"),
  // Status & dates
  status: text("status").notNull().default("active"),
  hireDate: text("hire_date").notNull(),
  terminatedAt: text("terminated_at"),
  // Emergency contact
  emergencyContact: text("emergency_contact"),
  emergencyPhone: text("emergency_phone"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ─── 2. GEOFENCES ─────────────────────────────────────────────────────────────
export const geofences = sqliteTable("geofences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type").notNull().default("depot"), // depot | customer | job_site
  centerLat: text("center_lat").notNull(),
  centerLng: text("center_lng").notNull(),
  radiusMeters: integer("radius_meters").notNull().default(200),
  address: text("address"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ─── 3. OVERTIME RULES ────────────────────────────────────────────────────────
export const overtimeRules = sqliteTable("overtime_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  dailyThresholdHours: text("daily_threshold_hours").notNull().default("8.00"),
  weeklyThresholdHours: text("weekly_threshold_hours").notNull().default("40.00"),
  rateMultiplier: text("rate_multiplier").notNull().default("1.5"),
  doubleTimeThresholdHours: text("double_time_threshold_hours"),
  doubleTimeMultiplier: text("double_time_multiplier"),
  state: text("state"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ─── 4. ROUTES ────────────────────────────────────────────────────────────────
export const routes = sqliteTable("routes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  date: text("date").notNull(),
  zone: text("zone"),
  assignedDriverId: integer("assigned_driver_id").references(() => employees.id),
  estimatedStartTime: text("estimated_start_time"),
  estimatedEndTime: text("estimated_end_time"),
  estimatedHours: text("estimated_hours").notNull().default("0.00"),
  actualStartTime: text("actual_start_time"),
  actualEndTime: text("actual_end_time"),
  actualHours: text("actual_hours").notNull().default("0.00"),
  totalStops: integer("total_stops").notNull().default(0),
  completedStops: integer("completed_stops").notNull().default(0),
  status: text("status").notNull().default("scheduled"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ─── 5. ROUTE STOPS ───────────────────────────────────────────────────────────
export const routeStops = sqliteTable("route_stops", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  routeId: integer("route_id").notNull().references(() => routes.id),
  sequence: integer("sequence").notNull(),
  customerName: text("customer_name").notNull(),
  address: text("address").notNull(),
  lat: text("lat"),
  lng: text("lng"),
  serviceType: text("service_type").notNull().default("service"),
  estimatedMinutes: integer("estimated_minutes").notNull().default(30),
  scheduledTime: text("scheduled_time"),
  arrivedAt: text("arrived_at"),
  completedAt: text("completed_at"),
  durationMinutes: integer("duration_minutes"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ─── 6. JOBS ──────────────────────────────────────────────────────────────────
export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobNumber: text("job_number").notNull().unique(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  address: text("address").notNull(),
  serviceType: text("service_type").notNull().default("service"),
  routeId: integer("route_id").references(() => routes.id),
  routeStopId: integer("route_stop_id").references(() => routeStops.id),
  scheduledDate: text("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time"),
  completedAt: text("completed_at"),
  revenue: text("revenue").notNull().default("0.00"),
  laborCost: text("labor_cost").notNull().default("0.00"),
  materialCost: text("material_cost").notNull().default("0.00"),
  grossProfit: text("gross_profit").notNull().default("0.00"),
  status: text("status").notNull().default("scheduled"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ─── 7. TIME ENTRIES ──────────────────────────────────────────────────────────
export const timeEntries = sqliteTable("time_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  date: text("date").notNull(),
  clockIn: text("clock_in"),
  clockOut: text("clock_out"),
  breakMinutes: integer("break_minutes").notNull().default(0),
  regularHours: text("regular_hours").notNull().default("0.00"),
  overtimeHours: text("overtime_hours").notNull().default("0.00"),
  doubleTimeHours: text("double_time_hours").notNull().default("0.00"),
  totalHours: text("total_hours").notNull().default("0.00"),
  // GPS verification
  clockInLat: text("clock_in_lat"),
  clockInLng: text("clock_in_lng"),
  clockOutLat: text("clock_out_lat"),
  clockOutLng: text("clock_out_lng"),
  geofenceVerified: integer("geofence_verified").notNull().default(0),
  geofenceId: integer("geofence_id").references(() => geofences.id),
  // Route / job association
  routeId: integer("route_id").references(() => routes.id),
  jobId: integer("job_id").references(() => jobs.id),
  // Approval workflow
  status: text("status").notNull().default("pending"),
  approvedBy: integer("approved_by"),
  approvedAt: text("approved_at"),
  rejectedReason: text("rejected_reason"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ─── 8. PAYROLL PERIODS ───────────────────────────────────────────────────────
export const payrollPeriods = sqliteTable("payroll_periods", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  status: text("status").notNull().default("draft"),
  // Totals
  totalRegularHours: text("total_regular_hours").notNull().default("0.00"),
  totalOvertimeHours: text("total_overtime_hours").notNull().default("0.00"),
  totalDoubleTimeHours: text("total_double_time_hours").notNull().default("0.00"),
  totalGrossPay: text("total_gross_pay").notNull().default("0.00"),
  totalEmployees: integer("total_employees").notNull().default(0),
  // Processing metadata
  processedAt: text("processed_at"),
  processedBy: integer("processed_by"),
  exportedAt: text("exported_at"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ─── 9. PAYROLL ENTRIES ───────────────────────────────────────────────────────
export const payrollEntries = sqliteTable("payroll_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  payrollPeriodId: integer("payroll_period_id").notNull().references(() => payrollPeriods.id),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  // Hours
  regularHours: text("regular_hours").notNull().default("0.00"),
  overtimeHours: text("overtime_hours").notNull().default("0.00"),
  doubleTimeHours: text("double_time_hours").notNull().default("0.00"),
  // Rates snapshot (captured at processing time)
  hourlyRate: text("hourly_rate").notNull().default("0.00"),
  overtimeRate: text("overtime_rate").notNull().default("0.00"),
  doubleTimeRate: text("double_time_rate").notNull().default("0.00"),
  // Pay breakdown
  regularPay: text("regular_pay").notNull().default("0.00"),
  overtimePay: text("overtime_pay").notNull().default("0.00"),
  doubleTimePay: text("double_time_pay").notNull().default("0.00"),
  grossPay: text("gross_pay").notNull().default("0.00"),
  status: text("status").notNull().default("calculated"),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ─── 10. ALERTS ───────────────────────────────────────────────────────────────
export const alerts = sqliteTable("alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(), // missing_clock_out | overtime_threshold | cdl_expiry | schedule_conflict
  title: text("title").notNull(),
  message: text("message").notNull(),
  severity: text("severity").notNull().default("info"), // info | warning | critical
  // Related entities
  employeeId: integer("employee_id").references(() => employees.id),
  timeEntryId: integer("time_entry_id").references(() => timeEntries.id),
  routeId: integer("route_id").references(() => routes.id),
  // Resolution
  resolved: integer("resolved").notNull().default(0),
  resolvedBy: integer("resolved_by"),
  resolvedAt: text("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  createdAt: text("created_at").notNull().default(""),
});

// ─── 11. AUDIT LOG ────────────────────────────────────────────────────────────
export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  action: text("action").notNull(), // create | update | delete | approve | reject | export
  tableName: text("table_name").notNull(),
  recordId: integer("record_id").notNull(),
  previousValues: text("previous_values"), // JSON string
  newValues: text("new_values"),           // JSON string
  userId: integer("user_id"),
  userDisplayName: text("user_display_name"),
  ipAddress: text("ip_address"),
  createdAt: text("created_at").notNull().default(""),
});

// ─── LEGACY TABLES (kept for compatibility) ───────────────────────────────────
export const payrollRuns = sqliteTable("payroll_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  status: text("status").notNull().default("draft"),
  totalGrossPay: text("total_gross_pay").notNull().default("0.00"),
  totalEmployees: integer("total_employees").notNull().default(0),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const payrollLineItems = sqliteTable("payroll_line_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  payrollRunId: integer("payroll_run_id").notNull().references(() => payrollRuns.id),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  regularHours: text("regular_hours").notNull().default("0.00"),
  overtimeHours: text("overtime_hours").notNull().default("0.00"),
  regularPay: text("regular_pay").notNull().default("0.00"),
  overtimePay: text("overtime_pay").notNull().default("0.00"),
  grossPay: text("gross_pay").notNull().default("0.00"),
  status: text("status").notNull().default("calculated"),
  createdAt: text("created_at").notNull().default(""),
});

// ─── INSERT SCHEMAS ───────────────────────────────────────────────────────────
export const insertEmployeeSchema = createInsertSchema(employees).omit({ id: true, createdAt: true, updatedAt: true });
export const insertGeofenceSchema = createInsertSchema(geofences).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOvertimeRuleSchema = createInsertSchema(overtimeRules).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRouteSchema = createInsertSchema(routes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRouteStopSchema = createInsertSchema(routeStops).omit({ id: true, createdAt: true, updatedAt: true });
export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTimeEntrySchema = createInsertSchema(timeEntries).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPayrollPeriodSchema = createInsertSchema(payrollPeriods).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPayrollEntrySchema = createInsertSchema(payrollEntries).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAlertSchema = createInsertSchema(alerts).omit({ id: true, createdAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLog).omit({ id: true, createdAt: true });
export const insertPayrollRunSchema = createInsertSchema(payrollRuns).omit({ id: true, createdAt: true, updatedAt: true });

// ─── TYPES ────────────────────────────────────────────────────────────────────
export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;

export type Geofence = typeof geofences.$inferSelect;
export type InsertGeofence = z.infer<typeof insertGeofenceSchema>;

export type OvertimeRule = typeof overtimeRules.$inferSelect;
export type InsertOvertimeRule = z.infer<typeof insertOvertimeRuleSchema>;

export type Route = typeof routes.$inferSelect;
export type InsertRoute = z.infer<typeof insertRouteSchema>;

export type RouteStop = typeof routeStops.$inferSelect;
export type InsertRouteStop = z.infer<typeof insertRouteStopSchema>;

export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;

export type TimeEntry = typeof timeEntries.$inferSelect;
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;

export type PayrollPeriod = typeof payrollPeriods.$inferSelect;
export type InsertPayrollPeriod = z.infer<typeof insertPayrollPeriodSchema>;

export type PayrollEntry = typeof payrollEntries.$inferSelect;
export type InsertPayrollEntry = z.infer<typeof insertPayrollEntrySchema>;

export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = z.infer<typeof insertAlertSchema>;

export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

export type PayrollRun = typeof payrollRuns.$inferSelect;
export type InsertPayrollRun = z.infer<typeof insertPayrollRunSchema>;
export type PayrollLineItem = typeof payrollLineItems.$inferSelect;
