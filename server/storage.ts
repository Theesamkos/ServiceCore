import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, desc, asc, and, or, like, sql, gte, lte, SQL } from "drizzle-orm";
import * as schema from "@shared/schema";
import { mkdirSync } from "fs";

mkdirSync("./data", { recursive: true });

const sqlite = new Database("./data/servicecore.db");
const db = drizzle(sqlite, { schema });

// ─── DDL ──────────────────────────────────────────────────────────────────────
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_number TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'driver',
    department TEXT,
    employment_type TEXT NOT NULL DEFAULT 'full_time',
    pay_type TEXT NOT NULL DEFAULT 'hourly',
    hourly_rate TEXT NOT NULL DEFAULT '0.00',
    overtime_rate TEXT NOT NULL DEFAULT '0.00',
    has_cdl INTEGER NOT NULL DEFAULT 0,
    cdl_class TEXT,
    cdl_expiry TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    hire_date TEXT NOT NULL,
    terminated_at TEXT,
    emergency_contact TEXT,
    emergency_phone TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS geofences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'depot',
    center_lat TEXT NOT NULL,
    center_lng TEXT NOT NULL,
    radius_meters INTEGER NOT NULL DEFAULT 200,
    address TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS overtime_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    daily_threshold_hours TEXT NOT NULL DEFAULT '8.00',
    weekly_threshold_hours TEXT NOT NULL DEFAULT '40.00',
    rate_multiplier TEXT NOT NULL DEFAULT '1.5',
    double_time_threshold_hours TEXT,
    double_time_multiplier TEXT,
    state TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    zone TEXT,
    assigned_driver_id INTEGER REFERENCES employees(id),
    estimated_start_time TEXT,
    estimated_end_time TEXT,
    estimated_hours TEXT NOT NULL DEFAULT '0.00',
    actual_start_time TEXT,
    actual_end_time TEXT,
    actual_hours TEXT NOT NULL DEFAULT '0.00',
    total_stops INTEGER NOT NULL DEFAULT 0,
    completed_stops INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'scheduled',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS route_stops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id INTEGER NOT NULL REFERENCES routes(id),
    sequence INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    address TEXT NOT NULL,
    lat TEXT,
    lng TEXT,
    service_type TEXT NOT NULL DEFAULT 'service',
    estimated_minutes INTEGER NOT NULL DEFAULT 30,
    scheduled_time TEXT,
    arrived_at TEXT,
    completed_at TEXT,
    duration_minutes INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_number TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    address TEXT NOT NULL,
    service_type TEXT NOT NULL DEFAULT 'service',
    route_id INTEGER REFERENCES routes(id),
    route_stop_id INTEGER REFERENCES route_stops(id),
    scheduled_date TEXT NOT NULL,
    scheduled_time TEXT,
    completed_at TEXT,
    revenue TEXT NOT NULL DEFAULT '0.00',
    labor_cost TEXT NOT NULL DEFAULT '0.00',
    material_cost TEXT NOT NULL DEFAULT '0.00',
    gross_profit TEXT NOT NULL DEFAULT '0.00',
    status TEXT NOT NULL DEFAULT 'scheduled',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    date TEXT NOT NULL,
    clock_in TEXT,
    clock_out TEXT,
    break_minutes INTEGER NOT NULL DEFAULT 0,
    regular_hours TEXT NOT NULL DEFAULT '0.00',
    overtime_hours TEXT NOT NULL DEFAULT '0.00',
    double_time_hours TEXT NOT NULL DEFAULT '0.00',
    total_hours TEXT NOT NULL DEFAULT '0.00',
    clock_in_lat TEXT,
    clock_in_lng TEXT,
    clock_out_lat TEXT,
    clock_out_lng TEXT,
    geofence_verified INTEGER NOT NULL DEFAULT 0,
    geofence_id INTEGER REFERENCES geofences(id),
    route_id INTEGER REFERENCES routes(id),
    job_id INTEGER REFERENCES jobs(id),
    status TEXT NOT NULL DEFAULT 'pending',
    approved_by INTEGER,
    approved_at TEXT,
    rejected_reason TEXT,
    break_start TEXT,
    clock_in_type TEXT NOT NULL DEFAULT 'manual',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payroll_periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    total_regular_hours TEXT NOT NULL DEFAULT '0.00',
    total_overtime_hours TEXT NOT NULL DEFAULT '0.00',
    total_double_time_hours TEXT NOT NULL DEFAULT '0.00',
    total_gross_pay TEXT NOT NULL DEFAULT '0.00',
    total_employees INTEGER NOT NULL DEFAULT 0,
    processed_at TEXT,
    processed_by INTEGER,
    exported_at TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payroll_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payroll_period_id INTEGER NOT NULL REFERENCES payroll_periods(id),
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    regular_hours TEXT NOT NULL DEFAULT '0.00',
    overtime_hours TEXT NOT NULL DEFAULT '0.00',
    double_time_hours TEXT NOT NULL DEFAULT '0.00',
    hourly_rate TEXT NOT NULL DEFAULT '0.00',
    overtime_rate TEXT NOT NULL DEFAULT '0.00',
    double_time_rate TEXT NOT NULL DEFAULT '0.00',
    regular_pay TEXT NOT NULL DEFAULT '0.00',
    overtime_pay TEXT NOT NULL DEFAULT '0.00',
    double_time_pay TEXT NOT NULL DEFAULT '0.00',
    gross_pay TEXT NOT NULL DEFAULT '0.00',
    status TEXT NOT NULL DEFAULT 'calculated',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    employee_id INTEGER REFERENCES employees(id),
    time_entry_id INTEGER REFERENCES time_entries(id),
    route_id INTEGER REFERENCES routes(id),
    resolved INTEGER NOT NULL DEFAULT 0,
    resolved_by INTEGER,
    resolved_at TEXT,
    resolution_notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id INTEGER NOT NULL,
    previous_values TEXT,
    new_values TEXT,
    user_id INTEGER,
    user_display_name TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payroll_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    total_gross_pay TEXT NOT NULL DEFAULT '0.00',
    total_employees INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payroll_line_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payroll_run_id INTEGER NOT NULL REFERENCES payroll_runs(id),
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    regular_hours TEXT NOT NULL DEFAULT '0.00',
    overtime_hours TEXT NOT NULL DEFAULT '0.00',
    regular_pay TEXT NOT NULL DEFAULT '0.00',
    overtime_pay TEXT NOT NULL DEFAULT '0.00',
    gross_pay TEXT NOT NULL DEFAULT '0.00',
    status TEXT NOT NULL DEFAULT 'calculated',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migrations for existing DBs (add new columns gracefully)
for (const stmt of [
  "ALTER TABLE time_entries ADD COLUMN break_start TEXT",
  "ALTER TABLE time_entries ADD COLUMN clock_in_type TEXT NOT NULL DEFAULT 'manual'",
]) {
  try { sqlite.exec(stmt); } catch { /* column already exists */ }
}

// Seed is handled by server/seed.ts on first run

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const now = () => new Date().toISOString();

// ─── STORAGE ──────────────────────────────────────────────────────────────────
export const storage = {

  // ── EMPLOYEES ──────────────────────────────────────────────────────────────
  async getEmployees(filters?: {
    status?: string;
    role?: string;
    department?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<{ data: schema.Employee[]; total: number }> {
    const conditions: SQL[] = [];
    if (filters?.status) conditions.push(eq(schema.employees.status, filters.status));
    if (filters?.role) conditions.push(eq(schema.employees.role, filters.role));
    if (filters?.department) conditions.push(eq(schema.employees.department, filters.department));
    if (filters?.search) {
      const q = `%${filters.search}%`;
      conditions.push(
        or(
          like(schema.employees.firstName, q),
          like(schema.employees.lastName, q),
          like(schema.employees.email, q),
          like(schema.employees.employeeNumber, q),
        )!
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const offset = (page - 1) * limit;
    const order = filters?.sortOrder === "desc" ? desc : asc;
    const orderCol = filters?.sortBy === "firstName" ? schema.employees.firstName
      : filters?.sortBy === "hourlyRate" ? schema.employees.hourlyRate
      : filters?.sortBy === "hireDate" ? schema.employees.hireDate
      : schema.employees.lastName;

    const [data, countResult] = await Promise.all([
      db.select().from(schema.employees).where(where).orderBy(order(orderCol)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(schema.employees).where(where),
    ]);

    return { data, total: Number(countResult[0]?.count ?? 0) };
  },

  async getEmployeeById(id: number): Promise<schema.Employee | undefined> {
    const result = await db.select().from(schema.employees).where(eq(schema.employees.id, id));
    return result[0];
  },

  async createEmployee(data: schema.InsertEmployee): Promise<schema.Employee> {
    const result = await db.insert(schema.employees).values({
      ...data,
      createdAt: now(),
      updatedAt: now(),
    }).returning();
    return result[0];
  },

  async updateEmployee(id: number, data: Partial<schema.InsertEmployee>): Promise<schema.Employee> {
    const result = await db.update(schema.employees)
      .set({ ...data, updatedAt: now() })
      .where(eq(schema.employees.id, id))
      .returning();
    return result[0];
  },

  async deleteEmployee(id: number): Promise<void> {
    await db.update(schema.employees)
      .set({ status: "terminated", terminatedAt: now(), updatedAt: now() })
      .where(eq(schema.employees.id, id));
  },

  // ── TIME ENTRIES ───────────────────────────────────────────────────────────
  async getTimeEntries(filters?: {
    employeeId?: number;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    routeId?: number;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<{ data: schema.TimeEntry[]; total: number }> {
    const conditions: SQL[] = [];
    if (filters?.employeeId) conditions.push(eq(schema.timeEntries.employeeId, filters.employeeId));
    if (filters?.status) conditions.push(eq(schema.timeEntries.status, filters.status));
    if (filters?.routeId) conditions.push(eq(schema.timeEntries.routeId, filters.routeId));
    if (filters?.dateFrom) conditions.push(gte(schema.timeEntries.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(schema.timeEntries.date, filters.dateTo));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const offset = (page - 1) * limit;

    const [data, countResult] = await Promise.all([
      db.select().from(schema.timeEntries).where(where).orderBy(desc(schema.timeEntries.date)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(schema.timeEntries).where(where),
    ]);

    return { data, total: Number(countResult[0]?.count ?? 0) };
  },

  async getTimeEntryById(id: number): Promise<schema.TimeEntry | undefined> {
    const result = await db.select().from(schema.timeEntries).where(eq(schema.timeEntries.id, id));
    return result[0];
  },

  async getActiveTimeEntry(employeeId: number): Promise<schema.TimeEntry | undefined> {
    const result = await db.select().from(schema.timeEntries)
      .where(and(
        eq(schema.timeEntries.employeeId, employeeId),
        eq(schema.timeEntries.status, "active"),
      ));
    return result[0];
  },

  async createTimeEntry(data: schema.InsertTimeEntry): Promise<schema.TimeEntry> {
    const result = await db.insert(schema.timeEntries).values({
      ...data,
      createdAt: now(),
      updatedAt: now(),
    }).returning();
    return result[0];
  },

  async updateTimeEntry(id: number, data: Partial<schema.TimeEntry>): Promise<schema.TimeEntry> {
    const result = await db.update(schema.timeEntries)
      .set({ ...data, updatedAt: now() })
      .where(eq(schema.timeEntries.id, id))
      .returning();
    return result[0];
  },

  // ── ROUTES ─────────────────────────────────────────────────────────────────
  async getRoutes(filters?: {
    date?: string;
    dateFrom?: string;
    dateTo?: string;
    assignedDriverId?: number;
    status?: string;
    zone?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<{ data: schema.Route[]; total: number }> {
    const conditions: SQL[] = [];
    if (filters?.date) conditions.push(eq(schema.routes.date, filters.date));
    if (filters?.dateFrom) conditions.push(gte(schema.routes.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(schema.routes.date, filters.dateTo));
    if (filters?.assignedDriverId) conditions.push(eq(schema.routes.assignedDriverId, filters.assignedDriverId));
    if (filters?.status) conditions.push(eq(schema.routes.status, filters.status));
    if (filters?.zone) conditions.push(eq(schema.routes.zone, filters.zone));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const offset = (page - 1) * limit;

    const [data, countResult] = await Promise.all([
      db.select().from(schema.routes).where(where).orderBy(desc(schema.routes.date)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(schema.routes).where(where),
    ]);

    return { data, total: Number(countResult[0]?.count ?? 0) };
  },

  async getRouteById(id: number): Promise<schema.Route | undefined> {
    const result = await db.select().from(schema.routes).where(eq(schema.routes.id, id));
    return result[0];
  },

  async createRoute(data: schema.InsertRoute): Promise<schema.Route> {
    const result = await db.insert(schema.routes).values({
      ...data,
      createdAt: now(),
      updatedAt: now(),
    }).returning();
    return result[0];
  },

  async updateRoute(id: number, data: Partial<schema.InsertRoute>): Promise<schema.Route> {
    const result = await db.update(schema.routes)
      .set({ ...data, updatedAt: now() })
      .where(eq(schema.routes.id, id))
      .returning();
    return result[0];
  },

  // ── ROUTE STOPS ────────────────────────────────────────────────────────────
  async getRouteStops(routeId: number): Promise<schema.RouteStop[]> {
    return db.select().from(schema.routeStops)
      .where(eq(schema.routeStops.routeId, routeId))
      .orderBy(asc(schema.routeStops.sequence));
  },

  async createRouteStop(data: schema.InsertRouteStop): Promise<schema.RouteStop> {
    const result = await db.insert(schema.routeStops).values({
      ...data,
      createdAt: now(),
      updatedAt: now(),
    }).returning();
    return result[0];
  },

  async updateRouteStop(id: number, data: Partial<schema.InsertRouteStop>): Promise<schema.RouteStop> {
    const result = await db.update(schema.routeStops)
      .set({ ...data, updatedAt: now() })
      .where(eq(schema.routeStops.id, id))
      .returning();
    return result[0];
  },

  // ── JOBS ───────────────────────────────────────────────────────────────────
  async getJobs(filters?: {
    dateFrom?: string;
    dateTo?: string;
    serviceType?: string;
    routeId?: number;
    customerName?: string;
    status?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<{ data: schema.Job[]; total: number }> {
    const conditions: SQL[] = [];
    if (filters?.dateFrom) conditions.push(gte(schema.jobs.scheduledDate, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(schema.jobs.scheduledDate, filters.dateTo));
    if (filters?.serviceType) conditions.push(eq(schema.jobs.serviceType, filters.serviceType));
    if (filters?.routeId) conditions.push(eq(schema.jobs.routeId, filters.routeId));
    if (filters?.status) conditions.push(eq(schema.jobs.status, filters.status));
    if (filters?.customerName) conditions.push(like(schema.jobs.customerName, `%${filters.customerName}%`));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const offset = (page - 1) * limit;

    const [data, countResult] = await Promise.all([
      db.select().from(schema.jobs).where(where).orderBy(desc(schema.jobs.scheduledDate)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(schema.jobs).where(where),
    ]);

    return { data, total: Number(countResult[0]?.count ?? 0) };
  },

  async getJobById(id: number): Promise<schema.Job | undefined> {
    const result = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    return result[0];
  },

  async createJob(data: schema.InsertJob): Promise<schema.Job> {
    const result = await db.insert(schema.jobs).values({
      ...data,
      createdAt: now(),
      updatedAt: now(),
    }).returning();
    return result[0];
  },

  async updateJob(id: number, data: Partial<schema.InsertJob>): Promise<schema.Job> {
    const result = await db.update(schema.jobs)
      .set({ ...data, updatedAt: now() })
      .where(eq(schema.jobs.id, id))
      .returning();
    return result[0];
  },

  // ── PAYROLL PERIODS ────────────────────────────────────────────────────────
  async getPayrollPeriods(filters?: {
    status?: string;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<schema.PayrollPeriod[]> {
    const conditions: SQL[] = [];
    if (filters?.status) conditions.push(eq(schema.payrollPeriods.status, filters.status));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const order = filters?.sortOrder === "asc" ? asc : desc;
    return db.select().from(schema.payrollPeriods).where(where).orderBy(order(schema.payrollPeriods.periodStart));
  },

  async getPayrollPeriodById(id: number): Promise<schema.PayrollPeriod | undefined> {
    const result = await db.select().from(schema.payrollPeriods).where(eq(schema.payrollPeriods.id, id));
    return result[0];
  },

  async createPayrollPeriod(data: schema.InsertPayrollPeriod): Promise<schema.PayrollPeriod> {
    const result = await db.insert(schema.payrollPeriods).values({
      ...data,
      createdAt: now(),
      updatedAt: now(),
    }).returning();
    return result[0];
  },

  async updatePayrollPeriod(id: number, data: Partial<schema.PayrollPeriod>): Promise<schema.PayrollPeriod> {
    const result = await db.update(schema.payrollPeriods)
      .set({ ...data, updatedAt: now() })
      .where(eq(schema.payrollPeriods.id, id))
      .returning();
    return result[0];
  },

  async checkPayrollPeriodOverlap(startDate: string, endDate: string, excludeId?: number): Promise<boolean> {
    const rows = sqlite.prepare(`
      SELECT id FROM payroll_periods
      WHERE id != ?
        AND period_start <= ?
        AND period_end >= ?
    `).all(excludeId ?? 0, endDate, startDate) as { id: number }[];
    return rows.length > 0;
  },

  // ── PAYROLL ENTRIES ────────────────────────────────────────────────────────
  async getPayrollEntries(periodId: number): Promise<schema.PayrollEntry[]> {
    return db.select().from(schema.payrollEntries)
      .where(eq(schema.payrollEntries.payrollPeriodId, periodId));
  },

  async createPayrollEntry(data: schema.InsertPayrollEntry): Promise<schema.PayrollEntry> {
    const result = await db.insert(schema.payrollEntries).values({
      ...data,
      createdAt: now(),
      updatedAt: now(),
    }).returning();
    return result[0];
  },

  async deletePayrollEntriesByPeriod(periodId: number): Promise<void> {
    await db.delete(schema.payrollEntries).where(eq(schema.payrollEntries.payrollPeriodId, periodId));
  },

  // ── GEOFENCES ──────────────────────────────────────────────────────────────
  async getGeofences(filters?: { status?: string }): Promise<schema.Geofence[]> {
    const conditions: SQL[] = [];
    if (filters?.status) conditions.push(eq(schema.geofences.status, filters.status));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return db.select().from(schema.geofences).where(where).orderBy(asc(schema.geofences.name));
  },

  async getGeofenceById(id: number): Promise<schema.Geofence | undefined> {
    const result = await db.select().from(schema.geofences).where(eq(schema.geofences.id, id));
    return result[0];
  },

  async createGeofence(data: schema.InsertGeofence): Promise<schema.Geofence> {
    const result = await db.insert(schema.geofences).values({
      ...data,
      createdAt: now(),
      updatedAt: now(),
    }).returning();
    return result[0];
  },

  async updateGeofence(id: number, data: Partial<schema.InsertGeofence>): Promise<schema.Geofence> {
    const result = await db.update(schema.geofences)
      .set({ ...data, updatedAt: now() })
      .where(eq(schema.geofences.id, id))
      .returning();
    return result[0];
  },

  // ── OVERTIME RULES ─────────────────────────────────────────────────────────
  async getOvertimeRules(filters?: { status?: string }): Promise<schema.OvertimeRule[]> {
    const conditions: SQL[] = [];
    if (filters?.status) conditions.push(eq(schema.overtimeRules.status, filters.status));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return db.select().from(schema.overtimeRules).where(where).orderBy(asc(schema.overtimeRules.name));
  },

  async getOvertimeRuleById(id: number): Promise<schema.OvertimeRule | undefined> {
    const result = await db.select().from(schema.overtimeRules).where(eq(schema.overtimeRules.id, id));
    return result[0];
  },

  async createOvertimeRule(data: schema.InsertOvertimeRule): Promise<schema.OvertimeRule> {
    const result = await db.insert(schema.overtimeRules).values({
      ...data,
      createdAt: now(),
      updatedAt: now(),
    }).returning();
    return result[0];
  },

  async updateOvertimeRule(id: number, data: Partial<schema.InsertOvertimeRule>): Promise<schema.OvertimeRule> {
    const result = await db.update(schema.overtimeRules)
      .set({ ...data, updatedAt: now() })
      .where(eq(schema.overtimeRules.id, id))
      .returning();
    return result[0];
  },

  // ── ALERTS ─────────────────────────────────────────────────────────────────
  async getAlerts(filters?: {
    resolved?: boolean;
    severity?: string;
    type?: string;
    limit?: number;
  }): Promise<schema.Alert[]> {
    const conditions: SQL[] = [];
    if (filters?.resolved !== undefined) conditions.push(eq(schema.alerts.resolved, filters.resolved ? 1 : 0));
    if (filters?.severity) conditions.push(eq(schema.alerts.severity, filters.severity));
    if (filters?.type) conditions.push(eq(schema.alerts.type, filters.type));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = filters?.limit ?? 100;
    return db.select().from(schema.alerts).where(where).orderBy(desc(schema.alerts.createdAt)).limit(limit);
  },

  async getAlertCount(filters?: { resolved?: boolean; severity?: string }): Promise<number> {
    const conditions: SQL[] = [];
    if (filters?.resolved !== undefined) conditions.push(eq(schema.alerts.resolved, filters.resolved ? 1 : 0));
    if (filters?.severity) conditions.push(eq(schema.alerts.severity, filters.severity));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const result = await db.select({ count: sql<number>`count(*)` }).from(schema.alerts).where(where);
    return Number(result[0]?.count ?? 0);
  },

  async createAlert(data: schema.InsertAlert): Promise<schema.Alert> {
    const result = await db.insert(schema.alerts).values({
      ...data,
      createdAt: now(),
    }).returning();
    return result[0];
  },

  async resolveAlert(id: number, userId: number, notes?: string): Promise<schema.Alert> {
    const result = await db.update(schema.alerts)
      .set({
        resolved: 1,
        resolvedBy: userId,
        resolvedAt: now(),
        resolutionNotes: notes ?? null,
      })
      .where(eq(schema.alerts.id, id))
      .returning();
    return result[0];
  },

  // ── AUDIT LOG ──────────────────────────────────────────────────────────────
  async getAuditLog(filters?: {
    tableName?: string;
    recordId?: number;
    action?: string;
    userId?: number;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    page?: number;
  }): Promise<{ data: schema.AuditLog[]; total: number }> {
    const conditions: SQL[] = [];
    if (filters?.tableName) conditions.push(eq(schema.auditLog.tableName, filters.tableName));
    if (filters?.recordId) conditions.push(eq(schema.auditLog.recordId, filters.recordId));
    if (filters?.action) conditions.push(eq(schema.auditLog.action, filters.action));
    if (filters?.userId) conditions.push(eq(schema.auditLog.userId, filters.userId));
    if (filters?.dateFrom) conditions.push(gte(schema.auditLog.createdAt, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(schema.auditLog.createdAt, filters.dateTo));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const offset = (page - 1) * limit;

    const [data, countResult] = await Promise.all([
      db.select().from(schema.auditLog).where(where).orderBy(desc(schema.auditLog.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(schema.auditLog).where(where),
    ]);

    return { data, total: Number(countResult[0]?.count ?? 0) };
  },

  async createAuditLog(data: schema.InsertAuditLog): Promise<schema.AuditLog> {
    const result = await db.insert(schema.auditLog).values({
      ...data,
      createdAt: now(),
    }).returning();
    return result[0];
  },

  // ── LEGACY PAYROLL RUNS ────────────────────────────────────────────────────
  async getPayrollRuns(): Promise<schema.PayrollRun[]> {
    return db.select().from(schema.payrollRuns).orderBy(desc(schema.payrollRuns.periodStart));
  },

  async getPayrollRun(id: number): Promise<schema.PayrollRun | null> {
    const result = await db.select().from(schema.payrollRuns).where(eq(schema.payrollRuns.id, id));
    return result[0] ?? null;
  },

  async createPayrollRun(data: schema.InsertPayrollRun): Promise<schema.PayrollRun> {
    const result = await db.insert(schema.payrollRuns).values({
      ...data,
      createdAt: now(),
      updatedAt: now(),
    }).returning();
    return result[0];
  },

  // Expose raw sqlite for complex queries in route handlers
  get db() { return db; },
  get sqlite() { return sqlite; },
};
