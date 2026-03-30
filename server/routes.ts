import type { Express } from "express";
import { storage } from "./storage";
import { insertEmployeeSchema, insertPayrollRunSchema } from "@shared/schema";
import { isWithinGeofence, haversineDistance } from "./utils";

export function registerRoutes(app: Express) {

  // ── EMPLOYEES ─────────────────────────────────────────────────────────────
  app.get("/api/employees", async (req, res) => {
    try {
      const { status, role, department, search, page, limit } = req.query;
      const pageNum = page ? parseInt(page as string) : 1;
      const limitNum = limit ? parseInt(limit as string) : 50;
      const result = await storage.getEmployees({
        status: status as string | undefined,
        role: role as string | undefined,
        department: department as string | undefined,
        search: search as string | undefined,
        page: pageNum,
        limit: limitNum,
      });
      res.json({
        data: result.data,
        pagination: { page: pageNum, limit: limitNum, total: result.total, totalPages: Math.ceil(result.total / limitNum) },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch employees", code: "FETCH_ERROR" });
    }
  });

  app.get("/api/employees/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const data = await storage.getEmployeeById(id);
      if (!data) return res.status(404).json({ error: "Employee not found", code: "EMPLOYEE_NOT_FOUND" });
      res.json({ data });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch employee", code: "FETCH_ERROR" });
    }
  });

  app.post("/api/employees", async (req, res) => {
    try {
      const parsed = insertEmployeeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", code: "VALIDATION_ERROR", details: parsed.error.issues });
      }
      const data = await storage.createEmployee(parsed.data);
      await storage.createAuditLog({ action: "create", tableName: "employees", recordId: data.id, newValues: JSON.stringify(data), userId: null, userDisplayName: null });
      res.status(201).json({ data });
    } catch (error) {
      res.status(500).json({ error: "Failed to create employee", code: "CREATE_ERROR" });
    }
  });

  app.patch("/api/employees/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const previous = await storage.getEmployeeById(id);
      const data = await storage.updateEmployee(id, req.body);
      await storage.createAuditLog({ action: "update", tableName: "employees", recordId: id, previousValues: JSON.stringify(previous), newValues: JSON.stringify(data), userId: null, userDisplayName: null });
      res.json({ data });
    } catch (error) {
      res.status(500).json({ error: "Failed to update employee", code: "UPDATE_ERROR" });
    }
  });

  app.delete("/api/employees/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const active = await storage.getActiveTimeEntry(id);
      if (active) return res.status(409).json({ error: "Cannot delete employee with active time entries", code: "ACTIVE_TIME_ENTRY" });
      await storage.deleteEmployee(id);
      await storage.createAuditLog({ action: "delete", tableName: "employees", recordId: id, userId: null, userDisplayName: null });
      res.json({ data: { message: "Employee terminated successfully" } });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete employee", code: "DELETE_ERROR" });
    }
  });

  // ── TIME ENTRIES — specific routes BEFORE /:id ─────────────────────────────

  // Clock in
  app.post("/api/time-entries/clock-in", async (req, res) => {
    try {
      const { employeeId, gpsLat, gpsLng, routeId, notes } = req.body;
      if (!employeeId) return res.status(400).json({ error: "employeeId required", code: "VALIDATION_ERROR" });

      const employee = await storage.getEmployeeById(parseInt(employeeId));
      if (!employee) return res.status(404).json({ error: "Employee not found", code: "NOT_FOUND" });
      if (employee.status !== "active") return res.status(400).json({ error: "Employee is not active", code: "INACTIVE_EMPLOYEE" });

      const existing = await storage.getActiveTimeEntry(parseInt(employeeId));
      if (existing) return res.status(409).json({ error: "Employee is already clocked in", code: "ALREADY_CLOCKED_IN" });

      const clockInTs = new Date().toISOString();
      const dateStr = clockInTs.split("T")[0];

      let clockInType = "manual";
      let geofenceId: number | null = null;
      let geofenceMatch = { matched: false, geofenceName: undefined as string | undefined, distance: undefined as number | undefined };

      if (gpsLat != null && gpsLng != null) {
        const lat = parseFloat(gpsLat);
        const lng = parseFloat(gpsLng);
        const geos = await storage.getGeofences({ status: "active" });
        let nearest = { dist: Infinity, geo: geos[0] };
        for (const g of geos) {
          const dist = haversineDistance(lat, lng, parseFloat(g.centerLat), parseFloat(g.centerLng));
          if (dist < nearest.dist) nearest = { dist, geo: g };
          if (isWithinGeofence(lat, lng, parseFloat(g.centerLat), parseFloat(g.centerLng), g.radiusMeters)) {
            clockInType = "geofence";
            geofenceId = g.id;
            geofenceMatch = { matched: true, geofenceName: g.name, distance: Math.round(dist) };
            break;
          }
        }
        if (clockInType !== "geofence") {
          clockInType = "gps";
          geofenceMatch = { matched: false, geofenceName: undefined, distance: Math.round(nearest.dist) };
          // GPS anomaly alert if >8000m from nearest geofence
          if (nearest.dist > 8000) {
            await storage.createAlert({
              type: "gps_anomaly",
              title: "GPS Clock-In Anomaly",
              message: `${employee.firstName} ${employee.lastName} clocked in ${(nearest.dist / 1000).toFixed(1)}km from the nearest geofence.`,
              severity: "warning",
              employeeId: employee.id,
              resolved: 0,
            });
          }
        }
      }

      const entry = await storage.createTimeEntry({
        employeeId: parseInt(employeeId),
        date: dateStr,
        clockIn: clockInTs,
        clockInLat: gpsLat != null ? String(gpsLat) : null,
        clockInLng: gpsLng != null ? String(gpsLng) : null,
        geofenceVerified: geofenceId ? 1 : 0,
        geofenceId,
        routeId: routeId ? parseInt(routeId) : null,
        status: "active",
        clockInType,
        notes: notes ?? null,
        breakMinutes: 0,
      } as Parameters<typeof storage.createTimeEntry>[0]);

      await storage.createAuditLog({ action: "create", tableName: "time_entries", recordId: entry.id, newValues: JSON.stringify({ action: "clock_in", employeeId, clockInType }), userId: null, userDisplayName: `${employee.firstName} ${employee.lastName}` });
      res.status(201).json({ data: entry, geofenceMatch });
    } catch (error) {
      res.status(500).json({ error: "Failed to clock in", code: "CLOCK_IN_ERROR" });
    }
  });

  // Bulk approve (before /:id)
  app.post("/api/time-entries/bulk-approve", async (req, res) => {
    try {
      const { ids, userId } = req.body as { ids: number[]; userId: number };
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids array required", code: "VALIDATION_ERROR" });
      let approved = 0, skipped = 0;
      const errors: string[] = [];
      const ts = new Date().toISOString();
      for (const id of ids) {
        const entry = await storage.getTimeEntryById(id);
        if (!entry) { errors.push(`Entry ${id} not found`); continue; }
        if (entry.status !== "pending") { skipped++; continue; }
        await storage.updateTimeEntry(id, { status: "approved", approvedBy: userId, approvedAt: ts });
        await storage.createAuditLog({ action: "approve", tableName: "time_entries", recordId: id, previousValues: JSON.stringify({ status: "pending" }), newValues: JSON.stringify({ status: "approved" }), userId });
        approved++;
      }
      res.json({ data: { approved, skipped, errors } });
    } catch (error) {
      res.status(500).json({ error: "Bulk approve failed", code: "BULK_ERROR" });
    }
  });

  // Bulk reject (before /:id)
  app.post("/api/time-entries/bulk-reject", async (req, res) => {
    try {
      const { ids, userId, reason } = req.body as { ids: number[]; userId: number; reason: string };
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids array required", code: "VALIDATION_ERROR" });
      if (!reason || reason.length < 10) return res.status(400).json({ error: "Reason must be at least 10 characters", code: "VALIDATION_ERROR" });
      let rejected = 0, skipped = 0;
      const errors: string[] = [];
      for (const id of ids) {
        const entry = await storage.getTimeEntryById(id);
        if (!entry) { errors.push(`Entry ${id} not found`); continue; }
        if (entry.status !== "pending") { skipped++; continue; }
        await storage.updateTimeEntry(id, { status: "rejected", rejectedReason: reason });
        await storage.createAuditLog({ action: "reject", tableName: "time_entries", recordId: id, previousValues: JSON.stringify({ status: "pending" }), newValues: JSON.stringify({ status: "rejected", reason }), userId });
        rejected++;
      }
      res.json({ data: { rejected, skipped, errors } });
    } catch (error) {
      res.status(500).json({ error: "Bulk reject failed", code: "BULK_ERROR" });
    }
  });

  // List time entries with employee join
  app.get("/api/time-entries", async (req, res) => {
    try {
      const { employeeId, status, dateFrom, dateTo, routeId, page, limit } = req.query;
      const pageNum = page ? parseInt(page as string) : 1;
      const limitNum = limit ? parseInt(limit as string) : 50;
      const result = await storage.getTimeEntries({
        employeeId: employeeId ? parseInt(employeeId as string) : undefined,
        status: status as string | undefined,
        dateFrom: dateFrom as string | undefined,
        dateTo: dateTo as string | undefined,
        routeId: routeId ? parseInt(routeId as string) : undefined,
        page: pageNum,
        limit: limitNum,
      });
      // Join employee names
      const empsResult = await storage.getEmployees({ limit: 500 });
      const empMap = new Map(empsResult.data.map(e => [e.id, e]));
      const data = result.data.map(te => {
        const emp = empMap.get(te.employeeId);
        return { ...te, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown", employeeRole: emp?.role ?? "unknown" };
      });
      res.json({ data, pagination: { page: pageNum, limit: limitNum, total: result.total, totalPages: Math.ceil(result.total / limitNum) } });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch time entries", code: "FETCH_ERROR" });
    }
  });

  // Get single entry
  app.get("/api/time-entries/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const data = await storage.getTimeEntryById(id);
      if (!data) return res.status(404).json({ error: "Time entry not found", code: "NOT_FOUND" });
      res.json({ data });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch time entry", code: "FETCH_ERROR" });
    }
  });

  // Clock out
  app.patch("/api/time-entries/:id/clock-out", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { gpsLat, gpsLng, notes } = req.body;
      const entry = await storage.getTimeEntryById(id);
      if (!entry) return res.status(404).json({ error: "Time entry not found", code: "NOT_FOUND" });
      if (entry.status !== "active") return res.status(400).json({ error: "Entry is not active", code: "INVALID_STATE" });

      const clockOutTs = new Date().toISOString();
      const clockInMs = new Date(entry.clockIn!).getTime();
      const clockOutMs = new Date(clockOutTs).getTime();
      const totalMins = (clockOutMs - clockInMs) / 60000 - (entry.breakMinutes ?? 0);
      const totalHours = Math.max(0, totalMins / 60).toFixed(2);
      const regularHours = Math.min(parseFloat(totalHours), 8).toFixed(2);
      const overtimeHours = Math.max(0, parseFloat(totalHours) - 8).toFixed(2);

      const updated = await storage.updateTimeEntry(id, {
        clockOut: clockOutTs,
        clockOutLat: gpsLat != null ? String(gpsLat) : null,
        clockOutLng: gpsLng != null ? String(gpsLng) : null,
        totalHours,
        regularHours,
        overtimeHours,
        status: "pending",
        notes: notes ?? entry.notes,
      });

      // Alert if >16 hours
      if (parseFloat(totalHours) > 16) {
        const emp = await storage.getEmployeeById(entry.employeeId);
        await storage.createAlert({ type: "excessive_hours", title: "Excessive Hours Logged", message: `${emp?.firstName} ${emp?.lastName} logged ${parseFloat(totalHours).toFixed(1)} hours in one shift.`, severity: "warning", employeeId: entry.employeeId, timeEntryId: id, resolved: 0 });
      }

      await storage.createAuditLog({ action: "update", tableName: "time_entries", recordId: id, newValues: JSON.stringify({ action: "clock_out", totalHours }), userId: null, userDisplayName: null });
      res.json({ data: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to clock out", code: "CLOCK_OUT_ERROR" });
    }
  });

  // Start break
  app.patch("/api/time-entries/:id/start-break", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const entry = await storage.getTimeEntryById(id);
      if (!entry) return res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
      if (entry.status !== "active") return res.status(400).json({ error: "Entry not active", code: "INVALID_STATE" });
      if ((entry as { breakStart?: string | null }).breakStart) return res.status(400).json({ error: "Break already started", code: "INVALID_STATE" });
      const updated = await storage.updateTimeEntry(id, { breakStart: new Date().toISOString() } as Parameters<typeof storage.updateTimeEntry>[1]);
      res.json({ data: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to start break", code: "BREAK_ERROR" });
    }
  });

  // End break
  app.patch("/api/time-entries/:id/end-break", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      type EntryWithBreak = Awaited<ReturnType<typeof storage.getTimeEntryById>> & { breakStart?: string | null };
      const entry = await storage.getTimeEntryById(id) as EntryWithBreak;
      if (!entry) return res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
      if (entry.status !== "active") return res.status(400).json({ error: "Entry not active", code: "INVALID_STATE" });
      if (!entry.breakStart) return res.status(400).json({ error: "No break in progress", code: "INVALID_STATE" });
      const breakDuration = Math.floor((Date.now() - new Date(entry.breakStart).getTime()) / 60000);
      const updated = await storage.updateTimeEntry(id, {
        breakMinutes: (entry.breakMinutes ?? 0) + breakDuration,
        breakStart: null,
      } as Parameters<typeof storage.updateTimeEntry>[1]);
      res.json({ data: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to end break", code: "BREAK_ERROR" });
    }
  });

  // Approve entry
  app.patch("/api/time-entries/:id/approve", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { userId } = req.body;
      const entry = await storage.getTimeEntryById(id);
      if (!entry) return res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
      if (entry.status !== "pending") return res.status(400).json({ error: "Entry is not pending", code: "INVALID_STATE" });
      const ts = new Date().toISOString();
      const updated = await storage.updateTimeEntry(id, { status: "approved", approvedBy: userId ?? null, approvedAt: ts });
      await storage.createAuditLog({ action: "approve", tableName: "time_entries", recordId: id, previousValues: JSON.stringify({ status: "pending" }), newValues: JSON.stringify({ status: "approved" }), userId: userId ?? null });
      res.json({ data: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to approve", code: "APPROVE_ERROR" });
    }
  });

  // Reject entry
  app.patch("/api/time-entries/:id/reject", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { userId, reason } = req.body;
      if (!reason || reason.length < 10) return res.status(400).json({ error: "Reason must be at least 10 characters", code: "VALIDATION_ERROR" });
      const entry = await storage.getTimeEntryById(id);
      if (!entry) return res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
      if (entry.status !== "pending") return res.status(400).json({ error: "Entry is not pending", code: "INVALID_STATE" });
      const updated = await storage.updateTimeEntry(id, { status: "rejected", rejectedReason: reason });
      await storage.createAuditLog({ action: "reject", tableName: "time_entries", recordId: id, previousValues: JSON.stringify({ status: "pending" }), newValues: JSON.stringify({ status: "rejected", reason }), userId: userId ?? null });
      res.json({ data: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to reject", code: "REJECT_ERROR" });
    }
  });

  // Manual create (AFTER the specific routes above)
  app.post("/api/time-entries", async (req, res) => {
    try {
      const { employeeId, date, clockIn, clockOut, breakMinutes, routeId, jobId, notes } = req.body;
      if (!employeeId || !date || !clockIn || !clockOut) return res.status(400).json({ error: "employeeId, date, clockIn, clockOut required", code: "VALIDATION_ERROR" });
      if (!notes || notes.trim().length < 5) return res.status(400).json({ error: "Notes required (min 5 characters)", code: "VALIDATION_ERROR" });
      const ciMs = new Date(clockIn).getTime();
      const coMs = new Date(clockOut).getTime();
      if (coMs <= ciMs) return res.status(400).json({ error: "Clock out must be after clock in", code: "VALIDATION_ERROR" });
      const breakMins = parseInt(breakMinutes ?? "0") || 0;
      const totalMins = (coMs - ciMs) / 60000 - breakMins;
      const totalHours = Math.max(0, totalMins / 60).toFixed(2);
      if (parseFloat(totalHours) > 24) return res.status(400).json({ error: "Total hours cannot exceed 24", code: "VALIDATION_ERROR" });

      const entry = await storage.createTimeEntry({
        employeeId: parseInt(employeeId), date, clockIn, clockOut,
        breakMinutes: breakMins,
        regularHours: Math.min(parseFloat(totalHours), 8).toFixed(2),
        overtimeHours: Math.max(0, parseFloat(totalHours) - 8).toFixed(2),
        doubleTimeHours: "0.00",
        totalHours, status: "pending", clockInType: "manual",
        routeId: routeId ? parseInt(routeId) : null,
        jobId: jobId ? parseInt(jobId) : null,
        notes: notes.trim(),
      });
      await storage.createAuditLog({ action: "create", tableName: "time_entries", recordId: entry.id, newValues: JSON.stringify({ action: "manual_entry", employeeId, date }), userId: null, userDisplayName: null });
      res.status(201).json({ data: entry });
    } catch (error) {
      res.status(500).json({ error: "Failed to create time entry", code: "CREATE_ERROR" });
    }
  });

  // ── ROUTES listing (for dropdowns) ────────────────────────────────────────
  app.get("/api/routes", async (req, res) => {
    try {
      const { dateFrom, dateTo, status, limit } = req.query;
      const result = await storage.getRoutes({
        dateFrom: dateFrom as string | undefined,
        dateTo: dateTo as string | undefined,
        status: status as string | undefined,
        limit: limit ? parseInt(limit as string) : 100,
      });
      res.json({ data: result.data, pagination: { total: result.total } });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch routes", code: "FETCH_ERROR" });
    }
  });

  // ── PAYROLL (legacy) ──────────────────────────────────────────────────────
  app.get("/api/payroll-runs", async (req, res) => {
    try {
      const data = await storage.getPayrollRuns();
      res.json({ data });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch payroll runs", code: "FETCH_ERROR" });
    }
  });

  app.post("/api/payroll-runs", async (req, res) => {
    try {
      const parsed = insertPayrollRunSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", code: "VALIDATION_ERROR", details: parsed.error.issues });
      }
      const data = await storage.createPayrollRun(parsed.data);
      res.status(201).json({ data });
    } catch (error) {
      res.status(500).json({ error: "Failed to create payroll run", code: "CREATE_ERROR" });
    }
  });
}
