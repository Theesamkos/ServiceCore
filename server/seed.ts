import { storage } from "./storage";
import type {
  InsertEmployee, InsertGeofence, InsertOvertimeRule,
  InsertRoute, InsertRouteStop, InsertJob,
  InsertTimeEntry, InsertPayrollPeriod, InsertPayrollEntry,
  InsertAlert, InsertAuditLog,
} from "@shared/schema";

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}
function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}
function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}
function isWeekday(dateStr: string): boolean {
  const dow = new Date(dateStr + "T12:00:00").getDay();
  return dow !== 0 && dow !== 6;
}
function isoTs(dateStr: string, timeStr: string): string {
  return `${dateStr}T${timeStr}:00.000Z`;
}
function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min: number, max: number, decimals = 2): string {
  return (Math.random() * (max - min) + min).toFixed(decimals);
}
function randPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── SEED ─────────────────────────────────────────────────────────────────────
export async function seedDatabase(): Promise<void> {

  // ── 1. EMPLOYEES ─────────────────────────────────────────────────────────
  console.log("  Seeding employees...");
  const empDefs: (Omit<InsertEmployee, "employeeNumber"> & { _hasCdl: boolean; _cdlClass?: string })[] = [
    { firstName: "John", lastName: "Smith", email: "john.smith@servicecore.com", phone: "5125551001", role: "driver", department: "operations", hourlyRate: "28.50", overtimeRate: "42.75", _hasCdl: true, cdlClass: "A", cdlExpiry: "2027-06-15", hireDate: "2023-03-01", status: "active", _cdlClass: "A" },
    { firstName: "Maria", lastName: "Johnson", email: "maria.j@servicecore.com", phone: "5125551002", role: "driver", department: "operations", hourlyRate: "25.00", overtimeRate: "37.50", _hasCdl: true, cdlClass: "B", cdlExpiry: "2026-11-30", hireDate: "2023-08-15", status: "active", _cdlClass: "B" },
    { firstName: "Mike", lastName: "Thompson", email: "mike.t@servicecore.com", phone: "5125551003", role: "driver", department: "operations", hourlyRate: "27.00", overtimeRate: "40.50", _hasCdl: true, cdlClass: "A", cdlExpiry: "2026-09-01", hireDate: "2022-06-01", status: "active", _cdlClass: "A" },
    { firstName: "Sarah", lastName: "Lee", email: "sarah.lee@servicecore.com", phone: "5125551004", role: "technician", department: "operations", hourlyRate: "24.00", overtimeRate: "36.00", _hasCdl: true, cdlClass: "B", cdlExpiry: "2027-03-15", hireDate: "2024-01-10", status: "active", _cdlClass: "B" },
    { firstName: "David", lastName: "Garcia", email: "david.g@servicecore.com", phone: "5125551005", role: "driver", department: "operations", hourlyRate: "26.50", overtimeRate: "39.75", _hasCdl: true, cdlClass: "A", cdlExpiry: "2027-08-20", hireDate: "2023-11-01", status: "active", _cdlClass: "A" },
    { firstName: "Emily", lastName: "Chen", email: "emily.c@servicecore.com", phone: "5125551006", role: "driver", department: "operations", hourlyRate: "25.50", overtimeRate: "38.25", _hasCdl: true, cdlClass: "B", cdlExpiry: "2026-12-31", hireDate: "2024-04-15", status: "active", _cdlClass: "B" },
    { firstName: "Robert", lastName: "Williams", email: "robert.w@servicecore.com", phone: "5125551007", role: "mechanic", department: "maintenance", hourlyRate: "32.00", overtimeRate: "48.00", _hasCdl: false, hireDate: "2022-01-15", status: "active" },
    { firstName: "Jennifer", lastName: "Martinez", email: "jen.m@servicecore.com", phone: "5125551008", role: "technician", department: "operations", hourlyRate: "23.50", overtimeRate: "35.25", _hasCdl: true, cdlClass: "B", cdlExpiry: "2026-06-01", hireDate: "2025-02-01", status: "active", _cdlClass: "B" },
    { firstName: "James", lastName: "Brown", email: "james.b@servicecore.com", phone: "5125551009", role: "driver", department: "operations", hourlyRate: "29.00", overtimeRate: "43.50", _hasCdl: true, cdlClass: "A", cdlExpiry: "2027-01-10", hireDate: "2021-09-01", status: "active", _cdlClass: "A" },
    { firstName: "Lisa", lastName: "Davis", email: "lisa.d@servicecore.com", phone: "5125551010", role: "admin", department: "admin", hourlyRate: "22.00", overtimeRate: "33.00", _hasCdl: false, hireDate: "2023-05-01", status: "active" },
    { firstName: "Kevin", lastName: "Wilson", email: "kevin.w@servicecore.com", phone: "5125551011", role: "driver", department: "operations", hourlyRate: "26.00", overtimeRate: "39.00", _hasCdl: true, cdlClass: "A", cdlExpiry: daysFromNow(28), hireDate: "2024-07-01", status: "active", _cdlClass: "A" },
    { firstName: "Amanda", lastName: "Taylor", email: "amanda.t@servicecore.com", phone: "5125551012", role: "manager", department: "operations", hourlyRate: "35.00", overtimeRate: "52.50", _hasCdl: false, hireDate: "2021-03-01", status: "active" },
  ];

  const createdEmps: Awaited<ReturnType<typeof storage.createEmployee>>[] = [];
  for (let i = 0; i < empDefs.length; i++) {
    const { _hasCdl, _cdlClass, ...rest } = empDefs[i];
    const emp = await storage.createEmployee({
      ...rest,
      employeeNumber: `EMP-${String(i + 1).padStart(3, "0")}`,
      hasCdl: _hasCdl ? 1 : 0,
      employmentType: "full_time",
      payType: "hourly",
    });
    createdEmps.push(emp);
  }

  const drivers = createdEmps.filter(e => ["driver", "technician"].includes(e.role));
  const opEmps = createdEmps.filter(e => e.department === "operations");

  // ── 2. GEOFENCES ─────────────────────────────────────────────────────────
  console.log("  Seeding geofences...");
  const geoDefs: InsertGeofence[] = [
    { name: "Main Yard", type: "depot", centerLat: "30.2672", centerLng: "-97.7431", radiusMeters: 200, address: "1200 Industrial Blvd, Austin, TX 78741", status: "active" },
    { name: "County Dump Site", type: "depot", centerLat: "30.3501", centerLng: "-97.6820", radiusMeters: 500, address: "4400 Disposal Rd, Austin, TX 78725", status: "active" },
    { name: "Event Center", type: "customer", centerLat: "30.2650", centerLng: "-97.7390", radiusMeters: 150, address: "500 E Cesar Chavez St, Austin, TX 78701", status: "active" },
    { name: "Construction Site North", type: "customer", centerLat: "30.4101", centerLng: "-97.7195", radiusMeters: 100, address: "12800 N Lamar Blvd, Austin, TX 78753", status: "active" },
  ];
  const createdGeos = await Promise.all(geoDefs.map(g => storage.createGeofence(g)));
  const mainYard = createdGeos[0];

  // ── 3. OVERTIME RULES ─────────────────────────────────────────────────────
  console.log("  Seeding overtime rules...");
  await Promise.all([
    storage.createOvertimeRule({ name: "Federal Standard", dailyThresholdHours: "0.00", weeklyThresholdHours: "40.00", rateMultiplier: "1.5", state: null, status: "active" }),
    storage.createOvertimeRule({ name: "California Overtime", dailyThresholdHours: "8.00", weeklyThresholdHours: "40.00", rateMultiplier: "1.5", state: "CA", status: "active" }),
    storage.createOvertimeRule({ name: "California Double Time", dailyThresholdHours: "12.00", weeklyThresholdHours: "0.00", rateMultiplier: "2.0", state: "CA", status: "active" }),
  ]);

  // ── 4 & 5. ROUTES + STOPS ─────────────────────────────────────────────────
  console.log("  Seeding routes and stops...");

  const routeTemplates = [
    { name: "Route A - North Industrial", zone: "North", estimatedHours: "7.5", stopCount: 12 },
    { name: "Route B - South Commercial", zone: "South", estimatedHours: "8.0", stopCount: 10 },
    { name: "Route C - Downtown Events", zone: "Downtown", estimatedHours: "6.5", stopCount: 8 },
    { name: "Route D - East Residential", zone: "East", estimatedHours: "9.0", stopCount: 14 },
    { name: "Route E - West Construction", zone: "West", estimatedHours: "7.0", stopCount: 11 },
    { name: "Route F - Highway Corridor", zone: "Highway", estimatedHours: "8.5", stopCount: 13 },
  ];

  const customers = [
    "ABC Construction", "Lone Star Events", "City Park Dept", "Central TX Fairgrounds",
    "Hill Country Builders", "Austin Convention Center", "Mueller Development",
    "Domain Commercial", "Barton Creek Mall", "Round Rock Sports Complex",
    "Cedar Park Community Center", "Pflugerville Waste Services", "Lakeway Resort",
    "Bee Cave Construction", "Georgetown Municipal", "Leander ISD",
    "Manor Developments", "Bastrop County Fair", "Hutto Industrial Park",
    "Taylor Cotton Gin Museum", "Kyle Sports Park", "Wimberley Creek Festival",
    "Buda Industrial Yard", "Dripping Springs Event Hall",
  ];

  const serviceTypes = ["delivery", "delivery", "service", "pickup", "pump_out", "emergency"];
  const serviceRevenue: Record<string, () => string> = {
    delivery: () => randFloat(75, 125),
    service: () => randFloat(50, 100),
    pickup: () => randFloat(60, 90),
    pump_out: () => randFloat(150, 250),
    emergency: () => randFloat(200, 350),
  };

  const createdRoutes: Awaited<ReturnType<typeof storage.createRoute>>[] = [];
  const allRouteStopIds: { routeId: number; stopId: number; serviceType: string; estimatedMinutes: number; driverRate: string; date: string; status: string }[] = [];

  let driverIndex = 0;
  for (let day = 21; day >= 0; day--) {
    const dateStr = daysAgo(day);
    if (!isWeekday(dateStr)) continue;

    const isToday = day === 0;
    const isPast = day > 0;
    // Pick 4-5 routes per day
    const dayRoutes = routeTemplates.slice(0, isToday ? 4 : rand(4, 6));

    for (let ri = 0; ri < dayRoutes.length; ri++) {
      const tmpl = dayRoutes[ri];
      const driver = drivers[driverIndex % drivers.length];
      driverIndex++;

      let status = "completed";
      let actualHours = (parseFloat(tmpl.estimatedHours) + rand(-1, 1) * 0.5).toFixed(1);
      let actualStart: string | null = isoTs(dateStr, "06:30");
      let actualEnd: string | null = isoTs(dateStr, `${6 + Math.round(parseFloat(actualHours))}:30`);

      if (isToday) {
        status = ri < 2 ? "in_progress" : "scheduled";
        actualHours = "0.00";
        actualStart = ri < 2 ? isoTs(dateStr, "06:30") : null;
        actualEnd = null;
      }

      const completedStops = status === "completed" ? tmpl.stopCount
        : status === "in_progress" ? rand(3, 6)
        : 0;

      const route = await storage.createRoute({
        name: tmpl.name,
        date: dateStr,
        zone: tmpl.zone,
        assignedDriverId: driver.id,
        estimatedStartTime: isoTs(dateStr, "06:30"),
        estimatedEndTime: isoTs(dateStr, `${6 + Math.round(parseFloat(tmpl.estimatedHours))}:30`),
        estimatedHours: tmpl.estimatedHours,
        actualStartTime: actualStart,
        actualEndTime: actualEnd,
        actualHours,
        totalStops: tmpl.stopCount,
        completedStops,
        status,
      });
      createdRoutes.push(route);

      // Route stops
      for (let seq = 1; seq <= tmpl.stopCount; seq++) {
        const customer = customers[(seq + ri * 7 + day) % customers.length];
        const svcType = serviceTypes[(seq + ri) % serviceTypes.length];
        const estMins = rand(10, 45);
        const lat = (30.2 + Math.random() * 0.3).toFixed(4);
        const lng = (-97.6 - Math.random() * 0.2).toFixed(4);

        const stopStatus = seq <= completedStops ? "completed"
          : seq === completedStops + 1 && status === "in_progress" ? "in_progress"
          : "pending";

        const arrivedAt = stopStatus !== "pending" ? isoTs(dateStr, `${7 + Math.floor((seq - 1) * parseFloat(tmpl.estimatedHours) / tmpl.stopCount)}:${String((seq * 5) % 60).padStart(2, "0")}`) : null;
        const completedAt = stopStatus === "completed" ? isoTs(dateStr, `${7 + Math.ceil(seq * parseFloat(tmpl.estimatedHours) / tmpl.stopCount)}:00`) : null;

        const stop = await storage.createRouteStop({
          routeId: route.id,
          sequence: seq,
          customerName: customer,
          address: `${rand(100, 9999)} ${randPick(["Main St", "Oak Ln", "Industrial Blvd", "Commerce Dr", "Park Ave"])}, Austin, TX`,
          lat,
          lng,
          serviceType: svcType,
          estimatedMinutes: estMins,
          scheduledTime: isoTs(dateStr, `${7 + Math.floor((seq - 1) * parseFloat(tmpl.estimatedHours) / tmpl.stopCount)}:00`),
          arrivedAt,
          completedAt,
          durationMinutes: stopStatus === "completed" ? rand(estMins - 5, estMins + 10) : null,
          status: stopStatus,
        });

        allRouteStopIds.push({
          routeId: route.id,
          stopId: stop.id,
          serviceType: svcType,
          estimatedMinutes: estMins,
          driverRate: driver.hourlyRate,
          date: dateStr,
          status: stopStatus,
        });
      }
    }
  }

  // ── 6. JOBS ──────────────────────────────────────────────────────────────
  console.log("  Seeding jobs...");
  let jobCounter = 1;
  for (const s of allRouteStopIds) {
    const revenue = serviceRevenue[s.serviceType]?.() ?? "75.00";
    const laborCost = ((s.estimatedMinutes / 60) * parseFloat(s.driverRate)).toFixed(2);
    const materialCost = randFloat(5, 30);
    const grossProfit = (parseFloat(revenue) - parseFloat(laborCost) - parseFloat(materialCost)).toFixed(2);
    const jobStatus = s.status === "completed" ? "completed"
      : s.status === "in_progress" ? "in_progress"
      : "scheduled";

    await storage.createJob({
      jobNumber: `JOB-${String(jobCounter++).padStart(5, "0")}`,
      customerName: `Customer ${jobCounter}`,
      address: `${rand(100, 9999)} Service Rd, Austin, TX`,
      serviceType: s.serviceType,
      routeId: s.routeId,
      routeStopId: s.stopId,
      scheduledDate: s.date,
      completedAt: jobStatus === "completed" ? new Date().toISOString() : null,
      revenue,
      laborCost,
      materialCost,
      grossProfit,
      status: jobStatus,
    });
  }

  // ── 7. TIME ENTRIES ──────────────────────────────────────────────────────
  console.log("  Seeding time entries...");

  // Employees who get overtime (high hours some weeks)
  const otEmpNames = ["Mike Thompson", "James Brown", "John Smith"];
  const otEmpIds = new Set(
    createdEmps
      .filter(e => otEmpNames.includes(`${e.firstName} ${e.lastName}`))
      .map(e => e.id)
  );

  for (let day = 28; day >= 0; day--) {
    const dateStr = daysAgo(day);
    if (!isWeekday(dateStr)) continue;
    const isToday = day === 0;

    for (const emp of opEmps) {
      // Skip a couple today (not yet clocked in)
      if (isToday && emp.id % 4 === 0) continue;

      const isOtEmp = otEmpIds.has(emp.id);
      // OT employees get 9-10 hour days some weeks; others get 7.5-8.5
      const baseHours = isOtEmp && day % 7 < 4 ? rand(9, 10) : rand(7, 8);
      const breakMins = 30;

      // Clock in 6:00–7:00 AM
      const ciHour = rand(6, 6);
      const ciMin = rand(0, 59);
      const clockInStr = `${String(ciHour).padStart(2, "0")}:${String(ciMin).padStart(2, "0")}`;

      // Clock out = clockIn + baseHours + break
      const totalMinutes = baseHours * 60 + breakMins + ciHour * 60 + ciMin;
      const coHour = Math.floor(totalMinutes / 60);
      const coMin = totalMinutes % 60;
      const clockOutStr = `${String(coHour).padStart(2, "0")}:${String(coMin).padStart(2, "0")}`;

      const workMinutes = baseHours * 60;
      const totalHours = (workMinutes / 60).toFixed(2);
      const regularHours = Math.min(baseHours, 8).toFixed(2);
      const overtimeHours = Math.max(0, baseHours - 8).toFixed(2);

      // GPS near main yard
      const lat = (30.2672 + (Math.random() - 0.5) * 0.003).toFixed(6);
      const lng = (-97.7431 + (Math.random() - 0.5) * 0.003).toFixed(6);

      let status: string;
      if (isToday) {
        status = "active";
      } else if (day <= 3) {
        status = "pending";
      } else {
        const r = Math.random();
        status = r < 0.75 ? "approved" : r < 0.90 ? "pending" : "rejected";
      }

      await storage.createTimeEntry({
        employeeId: emp.id,
        date: dateStr,
        clockIn: isoTs(dateStr, clockInStr),
        clockOut: isToday ? null : isoTs(dateStr, clockOutStr),
        breakMinutes: breakMins,
        regularHours,
        overtimeHours,
        doubleTimeHours: "0.00",
        totalHours,
        clockInLat: lat,
        clockInLng: lng,
        clockOutLat: isToday ? null : lat,
        clockOutLng: isToday ? null : lng,
        geofenceVerified: 1,
        geofenceId: mainYard.id,
        status,
        approvedBy: status === "approved" ? createdEmps.find(e => e.role === "manager")?.id ?? null : null,
        approvedAt: status === "approved" ? new Date().toISOString() : null,
        rejectedReason: status === "rejected" ? "Insufficient documentation" : null,
        notes: null,
      });
    }
  }

  // ── 8. PAYROLL PERIODS ────────────────────────────────────────────────────
  console.log("  Seeding payroll periods...");
  const p1 = await storage.createPayrollPeriod({
    periodStart: daysAgo(28),
    periodEnd: daysAgo(15),
    status: "closed",
    totalRegularHours: "880.00",
    totalOvertimeHours: "42.00",
    totalDoubleTimeHours: "0.00",
    totalGrossPay: "25840.00",
    totalEmployees: opEmps.length,
    processedAt: new Date(Date.now() - 12 * 86400_000).toISOString(),
    processedBy: createdEmps.find(e => e.role === "manager")?.id ?? null,
    exportedAt: new Date(Date.now() - 11 * 86400_000).toISOString(),
    notes: "Period closed and exported to payroll provider",
  });

  const p2 = await storage.createPayrollPeriod({
    periodStart: daysAgo(14),
    periodEnd: daysAgo(1),
    status: "calculated",
    totalRegularHours: "760.00",
    totalOvertimeHours: "28.00",
    totalDoubleTimeHours: "0.00",
    totalGrossPay: "22100.00",
    totalEmployees: opEmps.length,
    processedAt: new Date().toISOString(),
    processedBy: createdEmps.find(e => e.role === "manager")?.id ?? null,
    exportedAt: null,
    notes: null,
  });

  await storage.createPayrollPeriod({
    periodStart: todayStr(),
    periodEnd: daysFromNow(13),
    status: "open",
    totalRegularHours: "0.00",
    totalOvertimeHours: "0.00",
    totalDoubleTimeHours: "0.00",
    totalGrossPay: "0.00",
    totalEmployees: 0,
    processedAt: null,
    processedBy: null,
    exportedAt: null,
    notes: null,
  });

  // ── 9. PAYROLL ENTRIES ────────────────────────────────────────────────────
  console.log("  Seeding payroll entries...");
  for (const period of [p1, p2]) {
    for (const emp of opEmps) {
      const isOtEmp = otEmpIds.has(emp.id);
      const regHours = randFloat(70, 80);
      const otHours = isOtEmp ? randFloat(4, 12) : "0.00";
      const regPay = (parseFloat(regHours) * parseFloat(emp.hourlyRate)).toFixed(2);
      const otPay = (parseFloat(otHours) * parseFloat(emp.overtimeRate)).toFixed(2);
      const grossPay = (parseFloat(regPay) + parseFloat(otPay)).toFixed(2);

      await storage.createPayrollEntry({
        payrollPeriodId: period.id,
        employeeId: emp.id,
        regularHours: regHours,
        overtimeHours: otHours,
        doubleTimeHours: "0.00",
        hourlyRate: emp.hourlyRate,
        overtimeRate: emp.overtimeRate,
        doubleTimeRate: "0.00",
        regularPay: regPay,
        overtimePay: otPay,
        doubleTimePay: "0.00",
        grossPay,
        status: period.status === "closed" ? "exported" : "calculated",
      });
    }
  }

  // ── 10. ALERTS ────────────────────────────────────────────────────────────
  console.log("  Seeding alerts...");
  const mike = createdEmps.find(e => e.lastName === "Thompson")!;
  const kevin = createdEmps.find(e => e.lastName === "Wilson")!;
  const john = createdEmps.find(e => e.lastName === "Smith")!;
  const maria = createdEmps.find(e => e.lastName === "Johnson")!;
  const manager = createdEmps.find(e => e.role === "manager")!;

  const alertDefs: InsertAlert[] = [
    {
      type: "overtime_warning",
      title: "Overtime Threshold Warning",
      message: `${john.firstName} ${john.lastName} has worked 38.5 hours this week and is approaching the 40-hour overtime threshold.`,
      severity: "warning",
      employeeId: john.id,
      resolved: 0,
    },
    {
      type: "overtime_warning",
      title: "Overtime Threshold Warning",
      message: `${maria.firstName} ${maria.lastName} has worked 37 hours this week and may hit overtime before the period ends.`,
      severity: "warning",
      employeeId: maria.id,
      resolved: 0,
    },
    {
      type: "overtime_exceeded",
      title: "Overtime Limit Exceeded",
      message: `${mike.firstName} ${mike.lastName} has worked 47.5 hours this week, exceeding the 40-hour threshold by 7.5 hours.`,
      severity: "critical",
      employeeId: mike.id,
      resolved: 0,
    },
    {
      type: "gps_anomaly",
      title: "GPS Clock-In Anomaly",
      message: "Employee clocked in from a location 2.3 miles from the designated yard geofence.",
      severity: "warning",
      employeeId: drivers[2].id,
      resolved: 1,
      resolvedBy: manager.id,
      resolvedAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
      resolutionNotes: "Employee confirmed early morning fuel stop before yard arrival.",
    },
    {
      type: "gps_anomaly",
      title: "GPS Clock-In Anomaly",
      message: "Employee clocked in from a location 1.8 miles from the nearest geofence.",
      severity: "warning",
      employeeId: drivers[4].id,
      resolved: 0,
    },
    {
      type: "missed_clock_out",
      title: "Missing Clock-Out",
      message: "Employee did not clock out yesterday. Time entry requires manual review.",
      severity: "warning",
      employeeId: drivers[1].id,
      resolved: 1,
      resolvedBy: manager.id,
      resolvedAt: new Date(Date.now() - 86400_000).toISOString(),
      resolutionNotes: "Confirmed 4:30 PM clock-out with employee. Entry updated.",
    },
    {
      type: "cdl_expiring",
      title: "CDL License Expiring Soon",
      message: `${kevin.firstName} ${kevin.lastName}'s CDL Class A license expires in 28 days. Renewal required to continue driving assignments.`,
      severity: "warning",
      employeeId: kevin.id,
      resolved: 0,
    },
    {
      type: "route_unprofitable",
      title: "Route Below Profitability Threshold",
      message: "Route B - South Commercial on " + daysAgo(5) + " recorded negative gross profit of -$42.50.",
      severity: "info",
      employeeId: null,
      resolved: 1,
      resolvedBy: manager.id,
      resolvedAt: new Date(Date.now() - 3 * 86400_000).toISOString(),
      resolutionNotes: "Reviewed pricing with sales team. Rate increase approved for next period.",
    },
    {
      type: "overtime_warning",
      title: "Weekly Hours Approaching Limit",
      message: `${drivers[3].firstName} ${drivers[3].lastName} has logged 36 hours through Wednesday with 2 days remaining this week.`,
      severity: "info",
      employeeId: drivers[3].id,
      resolved: 0,
    },
  ];

  for (const a of alertDefs) {
    await storage.createAlert(a);
  }

  // ── 11. AUDIT LOG ─────────────────────────────────────────────────────────
  console.log("  Seeding audit log...");
  const auditEntries: InsertAuditLog[] = [
    { action: "create", tableName: "employees", recordId: createdEmps[10].id, previousValues: null, newValues: JSON.stringify({ firstName: "Kevin", lastName: "Wilson", role: "driver" }), userId: manager.id, userDisplayName: `${manager.firstName} ${manager.lastName}` },
    { action: "update", tableName: "employees", recordId: createdEmps[4].id, previousValues: JSON.stringify({ hourlyRate: "25.00" }), newValues: JSON.stringify({ hourlyRate: "26.50" }), userId: manager.id, userDisplayName: `${manager.firstName} ${manager.lastName}` },
    { action: "approve", tableName: "time_entries", recordId: 1, previousValues: JSON.stringify({ status: "pending" }), newValues: JSON.stringify({ status: "approved" }), userId: manager.id, userDisplayName: `${manager.firstName} ${manager.lastName}` },
    { action: "approve", tableName: "time_entries", recordId: 2, previousValues: JSON.stringify({ status: "pending" }), newValues: JSON.stringify({ status: "approved" }), userId: manager.id, userDisplayName: `${manager.firstName} ${manager.lastName}` },
    { action: "reject", tableName: "time_entries", recordId: 5, previousValues: JSON.stringify({ status: "pending" }), newValues: JSON.stringify({ status: "rejected", rejectedReason: "Insufficient documentation" }), userId: manager.id, userDisplayName: `${manager.firstName} ${manager.lastName}` },
    { action: "create", tableName: "payroll_periods", recordId: p1.id, previousValues: null, newValues: JSON.stringify({ periodStart: p1.periodStart, periodEnd: p1.periodEnd }), userId: manager.id, userDisplayName: `${manager.firstName} ${manager.lastName}` },
    { action: "update", tableName: "payroll_periods", recordId: p1.id, previousValues: JSON.stringify({ status: "draft" }), newValues: JSON.stringify({ status: "calculated" }), userId: manager.id, userDisplayName: `${manager.firstName} ${manager.lastName}` },
    { action: "export", tableName: "payroll_periods", recordId: p1.id, previousValues: JSON.stringify({ status: "calculated" }), newValues: JSON.stringify({ status: "closed", exportedAt: new Date(Date.now() - 11 * 86400_000).toISOString() }), userId: manager.id, userDisplayName: `${manager.firstName} ${manager.lastName}` },
    { action: "create", tableName: "payroll_periods", recordId: p2.id, previousValues: null, newValues: JSON.stringify({ periodStart: p2.periodStart, periodEnd: p2.periodEnd }), userId: manager.id, userDisplayName: `${manager.firstName} ${manager.lastName}` },
    { action: "update", tableName: "payroll_periods", recordId: p2.id, previousValues: JSON.stringify({ status: "draft" }), newValues: JSON.stringify({ status: "calculated" }), userId: manager.id, userDisplayName: `${manager.firstName} ${manager.lastName}` },
    { action: "create", tableName: "geofences", recordId: createdGeos[0].id, previousValues: null, newValues: JSON.stringify({ name: "Main Yard", type: "depot" }), userId: manager.id, userDisplayName: `${manager.firstName} ${manager.lastName}` },
    { action: "update", tableName: "geofences", recordId: createdGeos[1].id, previousValues: JSON.stringify({ radiusMeters: 300 }), newValues: JSON.stringify({ radiusMeters: 500 }), userId: manager.id, userDisplayName: `${manager.firstName} ${manager.lastName}` },
    { action: "create", tableName: "overtime_rules", recordId: 1, previousValues: null, newValues: JSON.stringify({ name: "Federal Standard", weeklyThresholdHours: "40.00" }), userId: manager.id, userDisplayName: `${manager.firstName} ${manager.lastName}` },
    { action: "update", tableName: "employees", recordId: createdEmps[7].id, previousValues: JSON.stringify({ status: "active" }), newValues: JSON.stringify({ cdlExpiry: daysFromNow(28) }), userId: manager.id, userDisplayName: `${manager.firstName} ${manager.lastName}` },
    { action: "approve", tableName: "time_entries", recordId: 10, previousValues: JSON.stringify({ status: "pending" }), newValues: JSON.stringify({ status: "approved" }), userId: manager.id, userDisplayName: `${manager.firstName} ${manager.lastName}` },
    { action: "approve", tableName: "time_entries", recordId: 15, previousValues: JSON.stringify({ status: "pending" }), newValues: JSON.stringify({ status: "approved" }), userId: manager.id, userDisplayName: `${manager.firstName} ${manager.lastName}` },
    { action: "update", tableName: "routes", recordId: createdRoutes[0]?.id ?? 1, previousValues: JSON.stringify({ status: "scheduled" }), newValues: JSON.stringify({ status: "in_progress" }), userId: drivers[0].id, userDisplayName: `${drivers[0].firstName} ${drivers[0].lastName}` },
  ];

  for (const entry of auditEntries) {
    await storage.createAuditLog(entry);
  }

  console.log("  ✅ Seed complete.");
}
