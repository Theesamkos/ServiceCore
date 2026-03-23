import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import * as schema from "@shared/schema";
import { mkdirSync } from "fs";

// Ensure data directory exists
mkdirSync("./data", { recursive: true });

const sqlite = new Database("./data/servicecore.db");
const db = drizzle(sqlite, { schema });

// Initialize tables
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
    hourly_rate TEXT NOT NULL DEFAULT '0.00',
    overtime_rate TEXT NOT NULL DEFAULT '0.00',
    status TEXT NOT NULL DEFAULT 'active',
    hire_date TEXT NOT NULL,
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
    total_hours TEXT NOT NULL DEFAULT '0.00',
    status TEXT NOT NULL DEFAULT 'pending',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

// Seed demo data if empty
const empCount = sqlite.prepare("SELECT COUNT(*) as count FROM employees").get() as { count: number };
if (empCount.count === 0) {
  sqlite.exec(`
    INSERT INTO employees (employee_number, first_name, last_name, email, phone, role, department, hourly_rate, overtime_rate, status, hire_date) VALUES
    ('EMP-001', 'Marcus', 'Johnson', 'marcus.johnson@servicecore.com', '555-0101', 'driver', 'Residential', '22.50', '33.75', 'active', '2022-03-15'),
    ('EMP-002', 'Sarah', 'Williams', 'sarah.williams@servicecore.com', '555-0102', 'technician', 'Commercial', '26.00', '39.00', 'active', '2021-08-20'),
    ('EMP-003', 'James', 'Brown', 'james.brown@servicecore.com', '555-0103', 'driver', 'Residential', '21.00', '31.50', 'active', '2023-01-10'),
    ('EMP-004', 'Linda', 'Garcia', 'linda.garcia@servicecore.com', '555-0104', 'dispatcher', 'Operations', '28.50', '42.75', 'active', '2020-06-01'),
    ('EMP-005', 'Robert', 'Martinez', 'robert.martinez@servicecore.com', '555-0105', 'technician', 'Commercial', '24.00', '36.00', 'on_leave', '2022-11-30'),
    ('EMP-006', 'Jennifer', 'Davis', 'jennifer.davis@servicecore.com', '555-0106', 'driver', 'Residential', '21.50', '32.25', 'active', '2023-05-15');
  `);
}

export const storage = {
  // Employees
  async getEmployees() {
    return db.select().from(schema.employees).orderBy(schema.employees.lastName);
  },
  async getEmployee(id: number) {
    const result = await db.select().from(schema.employees).where(eq(schema.employees.id, id));
    return result[0] ?? null;
  },
  async createEmployee(data: schema.InsertEmployee) {
    const result = await db.insert(schema.employees).values({
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).returning();
    return result[0];
  },
  async updateEmployee(id: number, data: Partial<schema.InsertEmployee>) {
    const result = await db.update(schema.employees)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(schema.employees.id, id))
      .returning();
    return result[0];
  },

  // Time entries
  async getTimeEntries(filters?: { employeeId?: number; dateFrom?: string; dateTo?: string }) {
    let query = db.select().from(schema.timeEntries);
    return query.orderBy(desc(schema.timeEntries.date));
  },
  async createTimeEntry(data: schema.InsertTimeEntry) {
    const result = await db.insert(schema.timeEntries).values({
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).returning();
    return result[0];
  },
  async updateTimeEntry(id: number, data: Partial<schema.InsertTimeEntry>) {
    const result = await db.update(schema.timeEntries)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(schema.timeEntries.id, id))
      .returning();
    return result[0];
  },

  // Payroll
  async getPayrollRuns() {
    return db.select().from(schema.payrollRuns).orderBy(desc(schema.payrollRuns.periodStart));
  },
  async getPayrollRun(id: number) {
    const result = await db.select().from(schema.payrollRuns).where(eq(schema.payrollRuns.id, id));
    return result[0] ?? null;
  },
  async createPayrollRun(data: schema.InsertPayrollRun) {
    const result = await db.insert(schema.payrollRuns).values({
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).returning();
    return result[0];
  },
};
