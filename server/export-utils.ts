import type { PayrollPeriod, PayrollEntry, TimeEntry } from "@shared/schema";

interface EntryWithMeta extends PayrollEntry {
  employeeName: string;
  department: string;
}

function fmt2(n: string | number): string {
  return parseFloat(String(n)).toFixed(2);
}

/**
 * Generate a CSV payroll export.
 * One row per employee sorted by last name, totals row at bottom.
 */
export function generatePayrollCSV(
  period: PayrollPeriod,
  entries: EntryWithMeta[]
): string {
  const header = [
    "Employee ID", "Employee Name", "Department",
    "Pay Period Start", "Pay Period End",
    "Regular Hours", "Overtime Hours", "Double Time Hours",
    "Hourly Rate", "OT Rate", "DT Rate",
    "Regular Pay", "Overtime Pay", "Double Time Pay", "Gross Pay",
  ].join(",");

  const sorted = [...entries].sort((a, b) => {
    const aLast = a.employeeName.split(" ").at(-1) ?? "";
    const bLast = b.employeeName.split(" ").at(-1) ?? "";
    return aLast.localeCompare(bLast);
  });

  const rows = sorted.map(e => [
    e.employeeId,
    `"${e.employeeName}"`,
    `"${e.department || ""}"`,
    period.periodStart,
    period.periodEnd,
    fmt2(e.regularHours),
    fmt2(e.overtimeHours),
    fmt2(e.doubleTimeHours),
    fmt2(e.hourlyRate),
    fmt2(e.overtimeRate),
    fmt2(e.doubleTimeRate),
    fmt2(e.regularPay),
    fmt2(e.overtimePay),
    fmt2(e.doubleTimePay),
    fmt2(e.grossPay),
  ].join(","));

  const totals = [
    "", "TOTALS", "", period.periodStart, period.periodEnd,
    fmt2(entries.reduce((s, e) => s + parseFloat(e.regularHours), 0)),
    fmt2(entries.reduce((s, e) => s + parseFloat(e.overtimeHours), 0)),
    fmt2(entries.reduce((s, e) => s + parseFloat(e.doubleTimeHours), 0)),
    "", "", "",
    fmt2(entries.reduce((s, e) => s + parseFloat(e.regularPay), 0)),
    fmt2(entries.reduce((s, e) => s + parseFloat(e.overtimePay), 0)),
    fmt2(entries.reduce((s, e) => s + parseFloat(e.doubleTimePay), 0)),
    fmt2(entries.reduce((s, e) => s + parseFloat(e.grossPay), 0)),
  ].join(",");

  return [header, ...rows, totals].join("\n");
}

function isoToMDY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function hoursToHMM(h: number): string {
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return `${hours}:${String(mins).padStart(2, "0")}`;
}

/**
 * Generate a QuickBooks IIF time-activity export.
 * One row per (employee, day), split into Regular Time and Overtime lines.
 */
export function generatePayrollIIF(
  period: PayrollPeriod,
  entries: (PayrollEntry & { employeeName: string })[],
  timeEntries: TimeEntry[]
): string {
  const nameMap = new Map(entries.map(e => [e.employeeId, e.employeeName]));

  // Only approved entries for employees in this payroll run
  const relevant = timeEntries.filter(te =>
    nameMap.has(te.employeeId) &&
    te.date >= period.periodStart &&
    te.date <= period.periodEnd &&
    te.status === "approved"
  );

  // Group by (employeeId, date)
  const grouped = new Map<string, TimeEntry[]>();
  for (const te of relevant) {
    const key = `${te.employeeId}|${te.date}`;
    const arr = grouped.get(key) ?? [];
    arr.push(te);
    grouped.set(key, arr);
  }

  const lines: string[] = [
    "!TIMEACT\tDATE\tJOB\tEMP\tITEM\tDURATION\tPROJ\tNOTE\tXFERTYPE",
  ];

  // Sort by employee name then date
  const sorted = [...grouped.entries()].sort(([ka], [kb]) => {
    const [aIdStr, aDate] = ka.split("|");
    const [bIdStr, bDate] = kb.split("|");
    const aName = nameMap.get(parseInt(aIdStr)) ?? "";
    const bName = nameMap.get(parseInt(bIdStr)) ?? "";
    return aName.localeCompare(bName) || aDate.localeCompare(bDate);
  });

  for (const [key, tes] of sorted) {
    const [empIdStr, date] = key.split("|");
    const empName = nameMap.get(parseInt(empIdStr)) ?? "Unknown";
    const mdy = isoToMDY(date);
    const regH = tes.reduce((s, t) => s + parseFloat(t.regularHours ?? "0"), 0);
    const otH = tes.reduce((s, t) => s + parseFloat(t.overtimeHours ?? "0"), 0);

    if (regH > 0) {
      lines.push(
        ["TIMEACT", mdy, "", empName, "Regular Time", hoursToHMM(regH), "", "Regular", "0"].join("\t")
      );
    }
    if (otH > 0) {
      lines.push(
        ["TIMEACT", mdy, "", empName, "Overtime", hoursToHMM(otH), "", "Overtime", "0"].join("\t")
      );
    }
  }

  return lines.join("\n");
}
