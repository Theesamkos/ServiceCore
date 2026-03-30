import { storage } from "./storage";
import type { OvertimeRule } from "@shared/schema";

export interface PayrollResult {
  employeeId: number;
  regularHours: string;
  overtimeHours: string;
  doubleTimeHours: string;
  totalHours: string;
  hourlyRate: string;
  overtimeRate: string;
  doubleTimeRate: string;
  regularPay: string;
  overtimePay: string;
  doubleTimePay: string;
  grossPay: string;
}

/** Returns the Monday (YYYY-MM-DD) of the ISO week containing dateStr */
function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  return monday.toISOString().split("T")[0];
}

/**
 * Calculate payroll for a single employee over a date range.
 *
 * Algorithm:
 *  1. Group approved time-entry hours by calendar date.
 *  2. Apply DAILY OT rules (California: >8 h = 1.5×, >12 h = 2×).
 *  3. Apply WEEKLY OT rules (Federal: >40 h/week = 1.5×), avoiding
 *     double-counting hours already classified as daily OT.
 *  4. Compute pay = regular×rate + OT×OTrate + DT×DTrate.
 */
export async function calculatePayrollForEmployee(
  employeeId: number,
  periodStart: string,
  periodEnd: string,
  overtimeRules: OvertimeRule[]
): Promise<PayrollResult> {
  const employee = await storage.getEmployeeById(employeeId);
  if (!employee) throw new Error(`Employee ${employeeId} not found`);

  const { data: entries } = await storage.getTimeEntries({
    employeeId,
    status: "approved",
    dateFrom: periodStart,
    dateTo: periodEnd,
    limit: 500,
  });

  // Rate snapshots at time of calculation
  const hourlyRate = parseFloat(employee.hourlyRate ?? "0");
  const storedOtRate = parseFloat(employee.overtimeRate ?? "0");
  const overtimeRate = storedOtRate > 0 ? storedOtRate : hourlyRate * 1.5;

  // Use the first active OT rule; fall back to California/Federal defaults
  const rule = overtimeRules.find(r => r.status === "active") ?? null;
  const dailyThreshold = rule ? parseFloat(rule.dailyThresholdHours ?? "8") : 8;
  const weeklyThreshold = rule ? parseFloat(rule.weeklyThresholdHours ?? "40") : 40;
  const dtThreshold = rule?.doubleTimeThresholdHours ? parseFloat(rule.doubleTimeThresholdHours) : null;
  const dtMultiplier = rule?.doubleTimeMultiplier ? parseFloat(rule.doubleTimeMultiplier) : 2.0;
  const doubleTimeRate = hourlyRate * dtMultiplier;

  // ── Step 1: Aggregate total hours per calendar day ─────────────────────────
  const dailyHours = new Map<string, number>();
  for (const entry of entries) {
    const h = parseFloat(entry.totalHours ?? "0");
    dailyHours.set(entry.date, (dailyHours.get(entry.date) ?? 0) + h);
  }

  // ── Step 2: Apply daily OT rules ──────────────────────────────────────────
  type DayBreak = { regular: number; overtime: number; doubleTime: number; total: number };
  const daily = new Map<string, DayBreak>();

  for (const [date, totalH] of dailyHours) {
    let regular = 0, overtime = 0, doubleTime = 0;

    if (dtThreshold !== null && totalH > dtThreshold) {
      // California: >12 h/day → 8 reg + (12-8) OT + remainder DT
      regular = dailyThreshold;
      overtime = dtThreshold - dailyThreshold;
      doubleTime = totalH - dtThreshold;
    } else if (totalH > dailyThreshold) {
      // >8 h/day → 8 reg + remainder OT
      regular = dailyThreshold;
      overtime = totalH - dailyThreshold;
    } else {
      regular = totalH;
    }

    daily.set(date, { regular, overtime, doubleTime, total: totalH });
  }

  // ── Step 3: Apply weekly OT rules (no double-counting) ───────────────────
  const weeks = new Map<string, string[]>();
  for (const date of daily.keys()) {
    const wk = getWeekStart(date);
    const arr = weeks.get(wk) ?? [];
    arr.push(date);
    weeks.set(wk, arr);
  }

  let additionalWeeklyOT = 0;
  for (const [, dates] of weeks) {
    const weekTotal = dates.reduce((s, d) => s + daily.get(d)!.total, 0);
    if (weekTotal > weeklyThreshold) {
      const dailyOTInWeek = dates.reduce((s, d) => {
        const b = daily.get(d)!;
        return s + b.overtime + b.doubleTime;
      }, 0);
      // Only count additional hours beyond what daily rules already captured
      const candidate = weekTotal - weeklyThreshold;
      additionalWeeklyOT += Math.max(0, candidate - dailyOTInWeek);
    }
  }

  // ── Step 4: Sum across all days ───────────────────────────────────────────
  let totalRegular = 0, totalOT = 0, totalDT = 0;
  for (const b of daily.values()) {
    totalRegular += b.regular;
    totalOT += b.overtime;
    totalDT += b.doubleTime;
  }

  // Move weekly-only OT from regular → overtime bucket
  totalRegular = Math.max(0, totalRegular - additionalWeeklyOT);
  totalOT += additionalWeeklyOT;

  const totalHours = totalRegular + totalOT + totalDT;
  const regularPay = totalRegular * hourlyRate;
  const overtimePay = totalOT * overtimeRate;
  const doubleTimePay = totalDT * doubleTimeRate;
  const grossPay = regularPay + overtimePay + doubleTimePay;

  return {
    employeeId,
    regularHours: totalRegular.toFixed(2),
    overtimeHours: totalOT.toFixed(2),
    doubleTimeHours: totalDT.toFixed(2),
    totalHours: totalHours.toFixed(2),
    hourlyRate: hourlyRate.toFixed(2),
    overtimeRate: overtimeRate.toFixed(2),
    doubleTimeRate: doubleTimeRate.toFixed(2),
    regularPay: regularPay.toFixed(2),
    overtimePay: overtimePay.toFixed(2),
    doubleTimePay: doubleTimePay.toFixed(2),
    grossPay: grossPay.toFixed(2),
  };
}

/**
 * Calculate payroll for ALL employees with approved entries in a period.
 * Deletes any previous calculation and re-inserts fresh entries.
 */
export async function calculatePayrollForPeriod(
  periodId: number,
  userId: number
): Promise<{ entries: PayrollResult[]; warnings: string[] }> {
  const period = await storage.getPayrollPeriodById(periodId);
  if (!period) throw new Error("Period not found");

  const overtimeRules = await storage.getOvertimeRules({ status: "active" });

  // Discover employees from their approved entries in the window
  const { data: approvedEntries } = await storage.getTimeEntries({
    status: "approved",
    dateFrom: period.periodStart,
    dateTo: period.periodEnd,
    limit: 1000,
  });
  const employeeIds = [...new Set(approvedEntries.map(e => e.employeeId))];

  const results: PayrollResult[] = [];
  for (const empId of employeeIds) {
    const r = await calculatePayrollForEmployee(
      empId,
      period.periodStart,
      period.periodEnd,
      overtimeRules
    );
    results.push(r);
  }

  // Delete any prior calculation and save fresh entries
  await storage.deletePayrollEntriesByPeriod(periodId);
  for (const r of results) {
    await storage.createPayrollEntry({
      payrollPeriodId: periodId,
      employeeId: r.employeeId,
      regularHours: r.regularHours,
      overtimeHours: r.overtimeHours,
      doubleTimeHours: r.doubleTimeHours,
      hourlyRate: r.hourlyRate,
      overtimeRate: r.overtimeRate,
      doubleTimeRate: r.doubleTimeRate,
      regularPay: r.regularPay,
      overtimePay: r.overtimePay,
      doubleTimePay: r.doubleTimePay,
      grossPay: r.grossPay,
      status: "calculated",
    });
  }

  // Update period aggregate totals
  const totReg = results.reduce((s, r) => s + parseFloat(r.regularHours), 0);
  const totOT = results.reduce((s, r) => s + parseFloat(r.overtimeHours), 0);
  const totDT = results.reduce((s, r) => s + parseFloat(r.doubleTimeHours), 0);
  const totGross = results.reduce((s, r) => s + parseFloat(r.grossPay), 0);

  await storage.updatePayrollPeriod(periodId, {
    totalRegularHours: totReg.toFixed(2),
    totalOvertimeHours: totOT.toFixed(2),
    totalDoubleTimeHours: totDT.toFixed(2),
    totalGrossPay: totGross.toFixed(2),
    totalEmployees: results.length,
    status: "calculated",
    processedAt: new Date().toISOString(),
    processedBy: userId,
  });

  // Build warnings for entries excluded from this run
  const { data: allEntries } = await storage.getTimeEntries({
    dateFrom: period.periodStart,
    dateTo: period.periodEnd,
    limit: 1000,
  });
  const unapproved = allEntries.filter(e => e.status === "pending" || e.status === "active").length;
  const warnings: string[] = [];
  if (unapproved > 0) {
    warnings.push(
      `${unapproved} time ${unapproved === 1 ? "entry" : "entries"} pending approval ${unapproved === 1 ? "was" : "were"} not included in this calculation.`
    );
  }

  await storage.createAuditLog({
    action: "create",
    tableName: "payroll_periods",
    recordId: periodId,
    newValues: JSON.stringify({ action: "calculate", employees: results.length, grossPay: totGross.toFixed(2) }),
    userId,
    userDisplayName: null,
  });

  return { entries: results, warnings };
}
