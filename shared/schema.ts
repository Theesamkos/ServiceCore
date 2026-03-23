import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Employees table
export const employees = sqliteTable("employees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeNumber: text("employee_number").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  role: text("role").notNull().default("driver"),
  department: text("department"),
  hourlyRate: text("hourly_rate").notNull().default("0.00"),
  overtimeRate: text("overtime_rate").notNull().default("0.00"),
  status: text("status").notNull().default("active"),
  hireDate: text("hire_date").notNull(),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// Time entries table
export const timeEntries = sqliteTable("time_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  date: text("date").notNull(),
  clockIn: text("clock_in"),
  clockOut: text("clock_out"),
  breakMinutes: integer("break_minutes").notNull().default(0),
  regularHours: text("regular_hours").notNull().default("0.00"),
  overtimeHours: text("overtime_hours").notNull().default("0.00"),
  totalHours: text("total_hours").notNull().default("0.00"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// Payroll runs table
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

// Payroll line items
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

// Types
export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type InsertTimeEntry = typeof timeEntries.$inferInsert;
export type PayrollRun = typeof payrollRuns.$inferSelect;
export type InsertPayrollRun = typeof payrollRuns.$inferInsert;
export type PayrollLineItem = typeof payrollLineItems.$inferSelect;

// Zod schemas
export const insertEmployeeSchema = createInsertSchema(employees);
export const insertTimeEntrySchema = createInsertSchema(timeEntries);
export const insertPayrollRunSchema = createInsertSchema(payrollRuns);
