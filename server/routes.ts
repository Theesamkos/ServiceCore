import type { Express } from "express";
import { storage } from "./storage";
import { insertEmployeeSchema, insertPayrollRunSchema } from "@shared/schema";
import { isWithinGeofence, haversineDistance } from "./utils";
import { calculatePayrollForPeriod } from "./payroll-calculator";
import { generatePayrollCSV, generatePayrollIIF } from "./export-utils";

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

  // ── ROUTES ────────────────────────────────────────────────────────────────

  // Helper: compute derived fields (driverName, laborCost, revenue, margin) for a route
  async function enrichRoute(route: Awaited<ReturnType<typeof storage.getRouteById>>) {
    if (!route) return null;
    let driverName: string | null = null;
    let laborCost = 0;

    if (route.assignedDriverId) {
      const driver = await storage.getEmployeeById(route.assignedDriverId);
      if (driver) {
        driverName = `${driver.firstName} ${driver.lastName}`;
        const { data: tes } = await storage.getTimeEntries({
          employeeId: driver.id,
          dateFrom: route.date,
          dateTo: route.date,
          limit: 50,
        });
        for (const te of tes) {
          laborCost += parseFloat(te.totalHours ?? "0") * parseFloat(driver.hourlyRate ?? "0");
        }
      }
    }

    const { data: jobs } = await storage.getJobs({ routeId: route.id, limit: 500 });
    const revenue = jobs.reduce((s, j) => s + parseFloat(j.revenue ?? "0"), 0);
    const margin = revenue > 0
      ? ((revenue - laborCost) / revenue * 100).toFixed(1)
      : null;

    return { ...route, driverName, laborCost: laborCost.toFixed(2), revenue: revenue.toFixed(2), margin };
  }

  // GET /api/routes — list with computed fields
  app.get("/api/routes", async (req, res) => {
    try {
      const { date, dateFrom, dateTo, assignedDriverId, status, zone, page, limit } = req.query;
      const pageNum = page ? parseInt(page as string) : 1;
      const limitNum = limit ? parseInt(limit as string) : 25;
      const result = await storage.getRoutes({
        date: date as string | undefined,
        dateFrom: dateFrom as string | undefined,
        dateTo: dateTo as string | undefined,
        assignedDriverId: assignedDriverId ? parseInt(assignedDriverId as string) : undefined,
        status: status as string | undefined,
        zone: zone as string | undefined,
        page: pageNum,
        limit: limitNum,
      });
      const enriched = await Promise.all(result.data.map(r => enrichRoute(r)));
      res.json({
        data: enriched.filter(Boolean),
        pagination: { page: pageNum, limit: limitNum, total: result.total, totalPages: Math.ceil(result.total / limitNum) },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch routes", code: "FETCH_ERROR" });
    }
  });

  // POST /api/routes — create route
  app.post("/api/routes", async (req, res) => {
    try {
      const { name, zone, assignedDriverId, date, estimatedHours, notes } = req.body;
      if (!name || !date || !estimatedHours) {
        return res.status(400).json({ error: "name, date, and estimatedHours are required", code: "VALIDATION_ERROR" });
      }
      const route = await storage.createRoute({
        name,
        zone: zone ?? null,
        assignedDriverId: assignedDriverId ? parseInt(assignedDriverId) : null,
        date,
        estimatedHours: parseFloat(estimatedHours).toFixed(2),
        actualHours: "0.00",
        totalStops: 0,
        completedStops: 0,
        status: "scheduled",
        notes: notes ?? null,
      });
      res.status(201).json({ data: route });
    } catch (error) {
      res.status(500).json({ error: "Failed to create route", code: "CREATE_ERROR" });
    }
  });

  // GET /api/routes/:id — route with stops, driver, computed fields
  app.get("/api/routes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const route = await storage.getRouteById(id);
      if (!route) return res.status(404).json({ error: "Route not found", code: "NOT_FOUND" });

      const [enriched, stops] = await Promise.all([
        enrichRoute(route),
        storage.getRouteStops(id),
      ]);

      let driver = null;
      if (route.assignedDriverId) {
        driver = await storage.getEmployeeById(route.assignedDriverId);
      }

      const { data: timeEntries } = route.assignedDriverId
        ? await storage.getTimeEntries({ employeeId: route.assignedDriverId, dateFrom: route.date, dateTo: route.date, limit: 50 })
        : { data: [] };

      res.json({ data: { ...enriched, stops, driver, timeEntries } });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch route", code: "FETCH_ERROR" });
    }
  });

  // PATCH /api/routes/:id — update route
  app.patch("/api/routes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const route = await storage.getRouteById(id);
      if (!route) return res.status(404).json({ error: "Route not found", code: "NOT_FOUND" });
      const { name, zone, assignedDriverId, date, estimatedHours, status, notes } = req.body;
      const updates: Parameters<typeof storage.updateRoute>[1] = {};
      if (name !== undefined) updates.name = name;
      if (zone !== undefined) updates.zone = zone;
      if (assignedDriverId !== undefined) updates.assignedDriverId = assignedDriverId ? parseInt(assignedDriverId) : null;
      if (date !== undefined) updates.date = date;
      if (estimatedHours !== undefined) updates.estimatedHours = parseFloat(estimatedHours).toFixed(2);
      if (status !== undefined) updates.status = status;
      if (notes !== undefined) updates.notes = notes;
      const updated = await storage.updateRoute(id, updates);
      res.json({ data: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to update route", code: "UPDATE_ERROR" });
    }
  });

  // POST /api/routes/:id/stops — add stop
  app.post("/api/routes/:id/stops", async (req, res) => {
    try {
      const routeId = parseInt(req.params.id);
      const route = await storage.getRouteById(routeId);
      if (!route) return res.status(404).json({ error: "Route not found", code: "NOT_FOUND" });
      const { sequence, customerName, address, serviceType, estimatedMinutes, lat, lng, notes } = req.body;
      if (!customerName || !address || !estimatedMinutes) {
        return res.status(400).json({ error: "customerName, address, and estimatedMinutes are required", code: "VALIDATION_ERROR" });
      }
      const stop = await storage.createRouteStop({
        routeId,
        sequence: sequence ?? (route.totalStops + 1),
        customerName,
        address,
        serviceType: serviceType ?? "service",
        estimatedMinutes: parseInt(estimatedMinutes),
        lat: lat ? String(lat) : null,
        lng: lng ? String(lng) : null,
        notes: notes ?? null,
        status: "pending",
      });
      // Increment totalStops on the route
      await storage.updateRoute(routeId, { totalStops: route.totalStops + 1 });
      res.status(201).json({ data: stop });
    } catch (error) {
      res.status(500).json({ error: "Failed to add stop", code: "CREATE_ERROR" });
    }
  });

  // PATCH /api/routes/:routeId/stops/:stopId — update stop
  app.patch("/api/routes/:routeId/stops/:stopId", async (req, res) => {
    try {
      const stopId = parseInt(req.params.stopId);
      const updates: Parameters<typeof storage.updateRouteStop>[1] = {};
      const { sequence, customerName, address, serviceType, estimatedMinutes, lat, lng, notes, status } = req.body;
      if (sequence !== undefined) updates.sequence = parseInt(sequence);
      if (customerName !== undefined) updates.customerName = customerName;
      if (address !== undefined) updates.address = address;
      if (serviceType !== undefined) updates.serviceType = serviceType;
      if (estimatedMinutes !== undefined) updates.estimatedMinutes = parseInt(estimatedMinutes);
      if (lat !== undefined) updates.lat = lat ? String(lat) : null;
      if (lng !== undefined) updates.lng = lng ? String(lng) : null;
      if (notes !== undefined) updates.notes = notes;
      if (status !== undefined) updates.status = status;
      const updated = await storage.updateRouteStop(stopId, updates);
      res.json({ data: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to update stop", code: "UPDATE_ERROR" });
    }
  });

  // PATCH /api/routes/:routeId/stops/:stopId/complete — mark stop completed
  app.patch("/api/routes/:routeId/stops/:stopId/complete", async (req, res) => {
    try {
      const routeId = parseInt(req.params.routeId);
      const stopId = parseInt(req.params.stopId);
      const { actualMinutes, notes } = req.body;
      const now = new Date().toISOString();

      const updated = await storage.updateRouteStop(stopId, {
        status: "completed",
        completedAt: now,
        durationMinutes: actualMinutes ? parseInt(actualMinutes) : undefined,
        notes: notes ?? undefined,
      });

      // Increment completedStops on the route
      const route = await storage.getRouteById(routeId);
      if (route) {
        const newCompleted = route.completedStops + 1;
        const routeUpdates: Parameters<typeof storage.updateRoute>[1] = { completedStops: newCompleted };
        // Auto-complete route if all stops done
        if (newCompleted >= route.totalStops && route.totalStops > 0) {
          routeUpdates.status = "completed";
          routeUpdates.actualEndTime = now;
        }
        await storage.updateRoute(routeId, routeUpdates);
      }

      res.json({ data: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to complete stop", code: "UPDATE_ERROR" });
    }
  });

  // ── PAYROLL PERIODS ───────────────────────────────────────────────────────

  // GET /api/payroll/periods — list all periods
  app.get("/api/payroll/periods", async (req, res) => {
    try {
      const { status, sortBy, sortOrder } = req.query;
      const periods = await storage.getPayrollPeriods({
        status: status as string | undefined,
        sortBy: sortBy as string | undefined,
        sortOrder: sortOrder as string | undefined,
      });
      res.json({ data: periods });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch payroll periods", code: "FETCH_ERROR" });
    }
  });

  // POST /api/payroll/periods — create period (before /:id)
  app.post("/api/payroll/periods", async (req, res) => {
    try {
      const { periodStart, periodEnd, notes } = req.body;
      if (!periodStart || !periodEnd) {
        return res.status(400).json({ error: "periodStart and periodEnd are required", code: "VALIDATION_ERROR" });
      }
      if (periodEnd <= periodStart) {
        return res.status(400).json({ error: "periodEnd must be after periodStart", code: "VALIDATION_ERROR" });
      }
      const days = (new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86400000;
      if (days > 31) {
        return res.status(400).json({ error: "Pay period cannot exceed 31 days", code: "VALIDATION_ERROR" });
      }
      const overlap = await storage.checkPayrollPeriodOverlap(periodStart, periodEnd);
      if (overlap) {
        return res.status(409).json({ error: "This period overlaps with an existing pay period", code: "OVERLAP_ERROR" });
      }
      const period = await storage.createPayrollPeriod({
        periodStart,
        periodEnd,
        status: "open",
        notes: notes ?? null,
        totalRegularHours: "0.00",
        totalOvertimeHours: "0.00",
        totalDoubleTimeHours: "0.00",
        totalGrossPay: "0.00",
        totalEmployees: 0,
      });
      res.status(201).json({ data: period });
    } catch (error) {
      res.status(500).json({ error: "Failed to create payroll period", code: "CREATE_ERROR" });
    }
  });

  // GET /api/payroll/periods/:id — period with entries and unapproved count
  app.get("/api/payroll/periods/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const period = await storage.getPayrollPeriodById(id);
      if (!period) return res.status(404).json({ error: "Period not found", code: "NOT_FOUND" });

      const rawEntries = await storage.getPayrollEntries(id);

      // Join employee names + department
      const empsResult = await storage.getEmployees({ limit: 500 });
      const empMap = new Map(empsResult.data.map(e => [e.id, e]));
      const entries = rawEntries.map(e => {
        const emp = empMap.get(e.employeeId);
        return {
          ...e,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
          department: emp?.department ?? "",
        };
      });

      // Count unapproved entries in the period
      const { data: allEntries } = await storage.getTimeEntries({
        dateFrom: period.periodStart,
        dateTo: period.periodEnd,
        limit: 1000,
      });
      const unapprovedCount = allEntries.filter(e => e.status === "pending" || e.status === "active").length;

      res.json({ data: { ...period, entries, unapprovedCount } });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch payroll period", code: "FETCH_ERROR" });
    }
  });

  // POST /api/payroll/periods/:id/calculate
  app.post("/api/payroll/periods/:id/calculate", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { userId } = req.body;
      const period = await storage.getPayrollPeriodById(id);
      if (!period) return res.status(404).json({ error: "Period not found", code: "NOT_FOUND" });
      if (period.status === "approved" || period.status === "exported" || period.status === "closed") {
        return res.status(400).json({ error: `Cannot recalculate a ${period.status} period`, code: "INVALID_STATE" });
      }

      const { entries: calcEntries, warnings } = await calculatePayrollForPeriod(id, userId ?? 1);

      // Refresh period after update
      const updatedPeriod = await storage.getPayrollPeriodById(id);

      // Comparison to previous period
      const allPeriods = await storage.getPayrollPeriods({ sortOrder: "desc" });
      const prevPeriod = allPeriods.find(p =>
        p.id !== id &&
        p.periodEnd < period.periodStart &&
        ["calculated", "approved", "exported", "closed"].includes(p.status)
      );

      const totGross = parseFloat(updatedPeriod!.totalGrossPay);
      const comparisonToPreviousPeriod = prevPeriod ? {
        previousPeriodId: prevPeriod.id,
        previousGrossPay: prevPeriod.totalGrossPay,
        difference: (totGross - parseFloat(prevPeriod.totalGrossPay)).toFixed(2),
        percentChange: parseFloat(prevPeriod.totalGrossPay) > 0
          ? (((totGross - parseFloat(prevPeriod.totalGrossPay)) / parseFloat(prevPeriod.totalGrossPay)) * 100).toFixed(1)
          : null,
      } : null;

      res.json({
        data: {
          period: updatedPeriod,
          entries: calcEntries,
          summary: {
            totals: {
              employees: calcEntries.length,
              regularHours: updatedPeriod!.totalRegularHours,
              overtimeHours: updatedPeriod!.totalOvertimeHours,
              doubleTimeHours: updatedPeriod!.totalDoubleTimeHours,
              grossPay: updatedPeriod!.totalGrossPay,
            },
            warnings,
            comparisonToPreviousPeriod,
          },
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Calculation failed";
      res.status(500).json({ error: msg, code: "CALCULATE_ERROR" });
    }
  });

  // POST /api/payroll/periods/:id/approve — requires confirmation="APPROVE"
  app.post("/api/payroll/periods/:id/approve", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { userId, confirmation } = req.body;
      if (confirmation !== "APPROVE") {
        return res.status(400).json({ error: "Must type APPROVE to confirm", code: "CONFIRMATION_REQUIRED" });
      }
      const period = await storage.getPayrollPeriodById(id);
      if (!period) return res.status(404).json({ error: "Period not found", code: "NOT_FOUND" });
      if (period.status !== "calculated") {
        return res.status(400).json({ error: "Period must be in calculated status to approve", code: "INVALID_STATE" });
      }
      const ts = new Date().toISOString();
      const updated = await storage.updatePayrollPeriod(id, {
        status: "approved",
        processedBy: userId ?? null,
        processedAt: ts,
      });
      await storage.createAuditLog({
        action: "approve",
        tableName: "payroll_periods",
        recordId: id,
        previousValues: JSON.stringify({ status: "calculated" }),
        newValues: JSON.stringify({ status: "approved" }),
        userId: userId ?? null,
        userDisplayName: null,
      });
      res.json({ data: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to approve payroll", code: "APPROVE_ERROR" });
    }
  });

  // GET /api/payroll/periods/:id/export/csv
  app.get("/api/payroll/periods/:id/export/csv", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const period = await storage.getPayrollPeriodById(id);
      if (!period) return res.status(404).json({ error: "Period not found", code: "NOT_FOUND" });

      const rawEntries = await storage.getPayrollEntries(id);
      const empsResult = await storage.getEmployees({ limit: 500 });
      const empMap = new Map(empsResult.data.map(e => [e.id, e]));
      const entries = rawEntries.map(e => {
        const emp = empMap.get(e.employeeId);
        return { ...e, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown", department: emp?.department ?? "" };
      });

      const csv = generatePayrollCSV(period, entries);
      const filename = `payroll-${period.periodStart}-${period.periodEnd}.csv`;

      // Mark exported if approved
      if (period.status === "approved") {
        await storage.updatePayrollPeriod(id, { status: "exported", exportedAt: new Date().toISOString() });
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      res.status(500).json({ error: "Export failed", code: "EXPORT_ERROR" });
    }
  });

  // GET /api/payroll/periods/:id/export/iif
  app.get("/api/payroll/periods/:id/export/iif", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const period = await storage.getPayrollPeriodById(id);
      if (!period) return res.status(404).json({ error: "Period not found", code: "NOT_FOUND" });

      const rawEntries = await storage.getPayrollEntries(id);
      const empsResult = await storage.getEmployees({ limit: 500 });
      const empMap = new Map(empsResult.data.map(e => [e.id, e]));
      const entries = rawEntries.map(e => {
        const emp = empMap.get(e.employeeId);
        return { ...e, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown", department: emp?.department ?? "" };
      });

      const { data: timeEntries } = await storage.getTimeEntries({
        dateFrom: period.periodStart,
        dateTo: period.periodEnd,
        status: "approved",
        limit: 1000,
      });

      const iif = generatePayrollIIF(period, entries, timeEntries);
      const filename = `payroll-${period.periodStart}-${period.periodEnd}.iif`;

      if (period.status === "approved") {
        await storage.updatePayrollPeriod(id, { status: "exported", exportedAt: new Date().toISOString() });
      }

      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(iif);
    } catch (error) {
      res.status(500).json({ error: "Export failed", code: "EXPORT_ERROR" });
    }
  });

  // POST /api/payroll/periods/:id/close
  app.post("/api/payroll/periods/:id/close", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const period = await storage.getPayrollPeriodById(id);
      if (!period) return res.status(404).json({ error: "Period not found", code: "NOT_FOUND" });
      if (period.status !== "exported") {
        return res.status(400).json({ error: "Period must be exported before closing", code: "INVALID_STATE" });
      }
      const updated = await storage.updatePayrollPeriod(id, { status: "closed" });
      res.json({ data: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to close period", code: "CLOSE_ERROR" });
    }
  });

  // ── JOB COSTING ───────────────────────────────────────────────────────────

  // GET /api/jobs/costing-summary (specific, before any /:id route)
  app.get("/api/jobs/costing-summary", async (req, res) => {
    try {
      const { dateFrom, dateTo, groupBy } = req.query;
      const result = await storage.getJobs({
        dateFrom: dateFrom as string | undefined,
        dateTo: dateTo as string | undefined,
        limit: 2000,
      });
      const jobs = result.data;

      const totalRevenue = jobs.reduce((s, j) => s + parseFloat(j.revenue ?? "0"), 0);
      const totalLaborCost = jobs.reduce((s, j) => s + parseFloat(j.laborCost ?? "0"), 0);
      const overallMargin = totalRevenue > 0 ? (totalRevenue - totalLaborCost) / totalRevenue * 100 : 0;
      const unprofitableJobs = jobs.filter(j => parseFloat(j.laborCost ?? "0") > parseFloat(j.revenue ?? "0")).length;

      type BI = { name: string; revenue: string; laborCost: string; grossProfit: string; margin: string; jobCount: number };
      const breakdown: BI[] = [];

      if (groupBy === "serviceType" || groupBy === "customer") {
        const gmap = new Map<string, typeof jobs>();
        for (const job of jobs) {
          const k = groupBy === "serviceType" ? job.serviceType : job.customerName;
          const arr = gmap.get(k) ?? [];
          arr.push(job);
          gmap.set(k, arr);
        }
        for (const [name, grp] of gmap) {
          const rev = grp.reduce((s, j) => s + parseFloat(j.revenue ?? "0"), 0);
          const cost = grp.reduce((s, j) => s + parseFloat(j.laborCost ?? "0"), 0);
          const profit = rev - cost;
          breakdown.push({ name, revenue: rev.toFixed(2), laborCost: cost.toFixed(2), grossProfit: profit.toFixed(2), margin: rev > 0 ? ((profit / rev) * 100).toFixed(1) : "0.0", jobCount: grp.length });
        }
        breakdown.sort((a, b) => parseFloat(b.revenue) - parseFloat(a.revenue));
      } else if (groupBy === "route") {
        const gmap = new Map<number | null, typeof jobs>();
        for (const job of jobs) {
          const arr = gmap.get(job.routeId) ?? [];
          arr.push(job);
          gmap.set(job.routeId, arr);
        }
        const routeNames = new Map<number, string>();
        await Promise.all([...gmap.keys()].filter(k => k !== null).map(async rid => {
          const r = await storage.getRouteById(rid as number);
          if (r) routeNames.set(rid as number, r.name);
        }));
        for (const [routeId, grp] of gmap) {
          const name = routeId ? routeNames.get(routeId) ?? `Route ${routeId}` : "No Route";
          const rev = grp.reduce((s, j) => s + parseFloat(j.revenue ?? "0"), 0);
          const cost = grp.reduce((s, j) => s + parseFloat(j.laborCost ?? "0"), 0);
          const profit = rev - cost;
          breakdown.push({ name, revenue: rev.toFixed(2), laborCost: cost.toFixed(2), grossProfit: profit.toFixed(2), margin: rev > 0 ? ((profit / rev) * 100).toFixed(1) : "0.0", jobCount: grp.length });
        }
        breakdown.sort((a, b) => parseFloat(b.revenue) - parseFloat(a.revenue));
      }

      res.json({ data: { totalRevenue: totalRevenue.toFixed(2), totalLaborCost: totalLaborCost.toFixed(2), overallMargin: overallMargin.toFixed(1), totalJobs: jobs.length, unprofitableJobs, breakdown } });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch costing summary", code: "FETCH_ERROR" });
    }
  });

  // GET /api/jobs
  app.get("/api/jobs", async (req, res) => {
    try {
      const { dateFrom, dateTo, serviceType, routeId, customerName, profitability, page, limit } = req.query;
      const pageNum = page ? parseInt(page as string) : 1;
      const limitNum = limit ? parseInt(limit as string) : 25;
      const result = await storage.getJobs({
        dateFrom: dateFrom as string | undefined,
        dateTo: dateTo as string | undefined,
        serviceType: serviceType as string | undefined,
        routeId: routeId ? parseInt(routeId as string) : undefined,
        customerName: customerName as string | undefined,
        page: pageNum,
        limit: limitNum,
      });

      const routeIds = [...new Set(result.data.filter(j => j.routeId).map(j => j.routeId!))];
      const routeMap = new Map<number, { name: string; assignedDriverId: number | null }>();
      await Promise.all(routeIds.map(async rid => {
        const r = await storage.getRouteById(rid);
        if (r) routeMap.set(rid, { name: r.name, assignedDriverId: r.assignedDriverId });
      }));
      const driverIds = [...new Set([...routeMap.values()].filter(r => r.assignedDriverId).map(r => r.assignedDriverId!))];
      const driverMap = new Map<number, string>();
      await Promise.all(driverIds.map(async did => {
        const e = await storage.getEmployeeById(did);
        if (e) driverMap.set(did, `${e.firstName} ${e.lastName}`);
      }));

      let data = result.data.map(job => {
        const route = job.routeId ? routeMap.get(job.routeId) : null;
        const rev = parseFloat(job.revenue ?? "0");
        const labor = parseFloat(job.laborCost ?? "0");
        const margin = rev > 0 ? ((rev - labor) / rev * 100).toFixed(1) : null;
        return { ...job, routeName: route?.name ?? null, driverName: route?.assignedDriverId ? driverMap.get(route.assignedDriverId) ?? null : null, margin };
      });

      if (profitability === "profitable") data = data.filter(j => j.margin !== null && parseFloat(j.margin) > 0);
      if (profitability === "unprofitable") data = data.filter(j => j.margin === null || parseFloat(j.margin) <= 0);

      res.json({ data, pagination: { page: pageNum, limit: limitNum, total: result.total, totalPages: Math.ceil(result.total / limitNum) } });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch jobs", code: "FETCH_ERROR" });
    }
  });

  // POST /api/jobs
  app.post("/api/jobs", async (req, res) => {
    try {
      const { jobNumber, customerName, address, serviceType, scheduledDate, revenue, laborCost, materialCost, routeId, status, notes, customerPhone, scheduledTime } = req.body;
      if (!jobNumber || !customerName || !address || !scheduledDate) {
        return res.status(400).json({ error: "jobNumber, customerName, address, scheduledDate required", code: "VALIDATION_ERROR" });
      }
      const rev = parseFloat(revenue ?? "0");
      const labor = parseFloat(laborCost ?? "0");
      const mat = parseFloat(materialCost ?? "0");
      const job = await storage.createJob({
        jobNumber, customerName, customerPhone: customerPhone ?? null, address,
        serviceType: serviceType ?? "service", routeId: routeId ? parseInt(routeId) : null,
        scheduledDate, scheduledTime: scheduledTime ?? null,
        revenue: rev.toFixed(2), laborCost: labor.toFixed(2), materialCost: mat.toFixed(2),
        grossProfit: (rev - labor - mat).toFixed(2), status: status ?? "scheduled", notes: notes ?? null,
      });
      res.status(201).json({ data: job });
    } catch (error) {
      res.status(500).json({ error: "Failed to create job", code: "CREATE_ERROR" });
    }
  });

  // PATCH /api/jobs/:id
  app.patch("/api/jobs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const job = await storage.getJobById(id);
      const updates: Parameters<typeof storage.updateJob>[1] = {};
      const { revenue, laborCost, materialCost, status, notes, scheduledDate, scheduledTime, customerName, customerPhone, address, serviceType } = req.body;
      if (customerName) updates.customerName = customerName;
      if (customerPhone !== undefined) updates.customerPhone = customerPhone;
      if (address) updates.address = address;
      if (serviceType) updates.serviceType = serviceType;
      if (scheduledDate) updates.scheduledDate = scheduledDate;
      if (scheduledTime !== undefined) updates.scheduledTime = scheduledTime;
      if (status) updates.status = status;
      if (notes !== undefined) updates.notes = notes;
      const rev = parseFloat(revenue ?? job?.revenue ?? "0");
      const labor = parseFloat(laborCost ?? job?.laborCost ?? "0");
      const mat = parseFloat(materialCost ?? job?.materialCost ?? "0");
      updates.revenue = rev.toFixed(2);
      updates.laborCost = labor.toFixed(2);
      updates.materialCost = mat.toFixed(2);
      updates.grossProfit = (rev - labor - mat).toFixed(2);
      const updated = await storage.updateJob(id, updates);
      res.json({ data: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to update job", code: "UPDATE_ERROR" });
    }
  });

  // ── ANALYTICS ─────────────────────────────────────────────────────────────

  // GET /api/analytics/overtime-trends
  app.get("/api/analytics/overtime-trends", async (req, res) => {
    try {
      const weeksNum = req.query.weeks ? parseInt(req.query.weeks as string) : 12;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - weeksNum * 7);
      const dateFrom = cutoff.toISOString().split("T")[0];

      type OTRow = { date: string; employee_id: number; emp_name: string; ot_hours: number; hourly_rate: number; ot_rate: number };
      const rows = storage.sqlite.prepare(`
        SELECT te.date, te.employee_id,
          e.first_name || ' ' || e.last_name as emp_name,
          CAST(te.overtime_hours AS REAL) as ot_hours,
          CAST(e.hourly_rate AS REAL) as hourly_rate,
          CAST(e.overtime_rate AS REAL) as ot_rate
        FROM time_entries te
        JOIN employees e ON te.employee_id = e.id
        WHERE te.status = 'approved' AND te.date >= ? AND CAST(te.overtime_hours AS REAL) > 0
        ORDER BY te.date
      `).all(dateFrom) as OTRow[];

      function getMonday(d: string) {
        const dt = new Date(d + "T12:00:00Z");
        const day = dt.getUTCDay();
        const diff = day === 0 ? -6 : 1 - day;
        const mon = new Date(dt);
        mon.setUTCDate(dt.getUTCDate() + diff);
        return mon.toISOString().split("T")[0];
      }
      function weekLabel(wk: string) {
        const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const s = new Date(wk + "T12:00:00Z");
        const e = new Date(s);
        e.setUTCDate(s.getUTCDate() + 6);
        return `${MONTHS[s.getUTCMonth()]} ${s.getUTCDate()}–${e.getUTCDate()}`;
      }

      const weekMap = new Map<string, { totalOTHours: number; otCost: number; emps: Map<number, { name: string; hours: number }> }>();
      for (const row of rows) {
        const wk = getMonday(row.date);
        if (!weekMap.has(wk)) weekMap.set(wk, { totalOTHours: 0, otCost: 0, emps: new Map() });
        const w = weekMap.get(wk)!;
        w.totalOTHours += row.ot_hours;
        w.otCost += row.ot_hours * (row.ot_rate > 0 ? row.ot_rate : row.hourly_rate * 1.5);
        const emp = w.emps.get(row.employee_id) ?? { name: row.emp_name, hours: 0 };
        emp.hours += row.ot_hours;
        w.emps.set(row.employee_id, emp);
      }

      const weeks = [...weekMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([wk, d]) => ({
        weekKey: wk, weekLabel: weekLabel(wk), weekStart: wk,
        totalOTHours: parseFloat(d.totalOTHours.toFixed(2)),
        otCost: parseFloat(d.otCost.toFixed(2)),
        employeesWithOT: d.emps.size,
        topContributor: [...d.emps.values()].sort((a, b) => b.hours - a.hours)[0]?.name ?? null,
      }));

      let trend = { direction: "stable" as "up" | "down" | "stable", percentage: "0.0" };
      if (weeks.length >= 4) {
        const half = Math.floor(weeks.length / 2);
        const first = weeks.slice(0, half).reduce((s, w) => s + w.totalOTHours, 0);
        const last = weeks.slice(-half).reduce((s, w) => s + w.totalOTHours, 0);
        if (first > 0) {
          const pct = ((last - first) / first) * 100;
          trend = { direction: pct > 2 ? "up" : pct < -2 ? "down" : "stable", percentage: Math.abs(pct).toFixed(1) };
        }
      }

      res.json({ data: { trend, weeks } });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch OT trends", code: "FETCH_ERROR" });
    }
  });

  // GET /api/analytics/labor-costs
  app.get("/api/analytics/labor-costs", async (req, res) => {
    try {
      const { dateFrom, dateTo, groupBy } = req.query;
      const dFrom = (dateFrom as string) || new Date(Date.now() - 84 * 86400000).toISOString().split("T")[0];
      const dTo = (dateTo as string) || new Date().toISOString().split("T")[0];

      if (groupBy === "day") {
        type DayRow = { date: string; regular_cost: number; ot_cost: number };
        const rows = storage.sqlite.prepare(`
          SELECT te.date,
            ROUND(SUM(CAST(te.regular_hours AS REAL) * CAST(e.hourly_rate AS REAL)), 2) as regular_cost,
            ROUND(SUM(CAST(te.overtime_hours AS REAL) *
              CASE WHEN CAST(e.overtime_rate AS REAL) > 0 THEN CAST(e.overtime_rate AS REAL)
                   ELSE CAST(e.hourly_rate AS REAL) * 1.5 END), 2) as ot_cost
          FROM time_entries te JOIN employees e ON te.employee_id = e.id
          WHERE te.status = 'approved' AND te.date >= ? AND te.date <= ?
          GROUP BY te.date ORDER BY te.date
        `).all(dFrom, dTo) as DayRow[];
        return res.json({ data: rows.map(r => ({ name: r.date, regularCost: r.regular_cost, otCost: r.ot_cost, totalCost: parseFloat((r.regular_cost + r.ot_cost).toFixed(2)) })) });
      }

      const gCol = groupBy === "role" ? "e.role" : groupBy === "employee" ? "e.first_name || ' ' || e.last_name" : "COALESCE(e.department, 'Unknown')";
      type GroupRow = { name: string; regular_cost: number; ot_cost: number };
      const rows = storage.sqlite.prepare(`
        SELECT ${gCol} as name,
          ROUND(SUM(CAST(te.regular_hours AS REAL) * CAST(e.hourly_rate AS REAL)), 2) as regular_cost,
          ROUND(SUM(CAST(te.overtime_hours AS REAL) *
            CASE WHEN CAST(e.overtime_rate AS REAL) > 0 THEN CAST(e.overtime_rate AS REAL)
                 ELSE CAST(e.hourly_rate AS REAL) * 1.5 END), 2) as ot_cost
        FROM time_entries te JOIN employees e ON te.employee_id = e.id
        WHERE te.status = 'approved' AND te.date >= ? AND te.date <= ?
        GROUP BY ${gCol} ORDER BY regular_cost + ot_cost DESC
      `).all(dFrom, dTo) as GroupRow[];

      res.json({ data: rows.map(r => ({ name: r.name || "Unknown", regularCost: r.regular_cost, otCost: r.ot_cost, totalCost: parseFloat((r.regular_cost + r.ot_cost).toFixed(2)) })) });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch labor costs", code: "FETCH_ERROR" });
    }
  });

  // GET /api/analytics/driver-efficiency
  app.get("/api/analytics/driver-efficiency", async (req, res) => {
    try {
      const { dateFrom, dateTo } = req.query;
      const dFrom = (dateFrom as string) || new Date(Date.now() - 84 * 86400000).toISOString().split("T")[0];
      const dTo = (dateTo as string) || new Date().toISOString().split("T")[0];

      type DR = { id: number; name: string; total_hours: number; ot_hours: number; days_worked: number; stops_completed: number; total_routes: number; completed_routes: number };
      const rows = storage.sqlite.prepare(`
        SELECT e.id, e.first_name || ' ' || e.last_name as name,
          COALESCE(SUM(CAST(te.total_hours AS REAL)), 0) as total_hours,
          COALESCE(SUM(CAST(te.overtime_hours AS REAL)), 0) as ot_hours,
          COUNT(DISTINCT te.date) as days_worked,
          (SELECT COUNT(*) FROM route_stops rs JOIN routes r ON rs.route_id = r.id
           WHERE r.assigned_driver_id = e.id AND rs.status = 'completed' AND r.date >= ? AND r.date <= ?) as stops_completed,
          (SELECT COUNT(*) FROM routes r WHERE r.assigned_driver_id = e.id AND r.date >= ? AND r.date <= ?) as total_routes,
          (SELECT COUNT(*) FROM routes r WHERE r.assigned_driver_id = e.id AND r.status = 'completed' AND r.date >= ? AND r.date <= ?) as completed_routes
        FROM employees e
        LEFT JOIN time_entries te ON te.employee_id = e.id AND te.status = 'approved' AND te.date >= ? AND te.date <= ?
        WHERE e.role = 'driver' AND e.status = 'active'
        GROUP BY e.id HAVING total_hours > 0 ORDER BY name
      `).all(dFrom, dTo, dFrom, dTo, dFrom, dTo, dFrom, dTo) as DR[];

      const totalDays = Math.round((new Date(dTo).getTime() - new Date(dFrom).getTime()) / 86400000) + 1;
      const businessDays = Math.max(1, Math.round(totalDays * 5 / 7));

      const data = rows.map(r => {
        const stopsPerHour = r.total_hours > 0 ? r.stops_completed / r.total_hours : 0;
        const otPct = r.total_hours > 0 ? (r.ot_hours / r.total_hours) * 100 : 0;
        const rcRate = r.total_routes > 0 ? r.completed_routes / r.total_routes : 1;
        const avgDailyHrs = r.days_worked > 0 ? r.total_hours / r.days_worked : 0;
        const speed = Math.min(100, stopsPerHour * 20);
        const consistency = Math.max(0, 100 - Math.abs(avgDailyHrs - 8) * 10);
        const attendance = Math.min(100, (r.days_worked / businessDays) * 100);
        const otDiscipline = Math.max(0, 100 - otPct * 2.5);
        const completion = rcRate * 100;
        return {
          id: r.id, name: r.name,
          stopsCompleted: r.stops_completed, totalHours: parseFloat(r.total_hours.toFixed(2)),
          stopsPerHour: parseFloat(stopsPerHour.toFixed(2)), avgDailyHours: parseFloat(avgDailyHrs.toFixed(2)),
          overtimePercentage: parseFloat(otPct.toFixed(1)), routeCompletionRate: parseFloat(rcRate.toFixed(2)),
          efficiencyScore: Math.round((speed + consistency + attendance + otDiscipline + completion) / 5),
          speed: Math.round(speed), consistency: Math.round(consistency),
          attendance: Math.round(attendance), otDiscipline: Math.round(otDiscipline), completion: Math.round(completion),
        };
      });

      res.json({ data });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch driver efficiency", code: "FETCH_ERROR" });
    }
  });

  // GET /api/analytics/route-profitability
  app.get("/api/analytics/route-profitability", async (req, res) => {
    try {
      const { dateFrom, dateTo } = req.query;
      const dFrom = (dateFrom as string) || new Date(Date.now() - 84 * 86400000).toISOString().split("T")[0];
      const dTo = (dateTo as string) || new Date().toISOString().split("T")[0];

      type RR = { id: number; name: string; estimated_hours: number; total_stops: number; revenue: number; labor_cost: number };
      const rows = storage.sqlite.prepare(`
        SELECT r.id, r.name, CAST(r.estimated_hours AS REAL) as estimated_hours, r.total_stops,
          COALESCE(SUM(CAST(j.revenue AS REAL)), 0) as revenue,
          COALESCE(SUM(CAST(j.labor_cost AS REAL)), 0) as labor_cost
        FROM routes r LEFT JOIN jobs j ON j.route_id = r.id
        WHERE r.date >= ? AND r.date <= ?
        GROUP BY r.id HAVING revenue > 0
        ORDER BY revenue DESC LIMIT 15
      `).all(dFrom, dTo) as RR[];

      const data = rows.map(r => {
        const margin = r.revenue > 0 ? ((r.revenue - r.labor_cost) / r.revenue * 100) : 0;
        const label = r.name.length > 22 ? r.name.substring(0, 22) + "…" : r.name;
        return { id: r.id, name: label, revenue: r.revenue, laborCost: r.labor_cost, margin: parseFloat(margin.toFixed(1)), avgStops: r.total_stops, avgHours: r.estimated_hours };
      });

      res.json({ data });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch route profitability", code: "FETCH_ERROR" });
    }
  });

  // GET /api/analytics/period-comparison
  app.get("/api/analytics/period-comparison", async (req, res) => {
    try {
      const now = new Date();
      const cTo = (req.query.currentTo as string) || now.toISOString().split("T")[0];
      const cFrom = (req.query.currentFrom as string) || new Date(now.getTime() - 28 * 86400000).toISOString().split("T")[0];
      const pTo = (req.query.previousTo as string) || new Date(new Date(cFrom).getTime() - 86400000).toISOString().split("T")[0];
      const pFrom = (req.query.previousFrom as string) || new Date(new Date(pTo).getTime() - 28 * 86400000).toISOString().split("T")[0];

      type PM = { total_hours: number; ot_hours: number; regular_cost: number; ot_cost: number };
      const queryPeriod = (from: string, to: string): PM =>
        storage.sqlite.prepare(`
          SELECT COALESCE(SUM(CAST(te.total_hours AS REAL)), 0) as total_hours,
            COALESCE(SUM(CAST(te.overtime_hours AS REAL)), 0) as ot_hours,
            COALESCE(ROUND(SUM(CAST(te.regular_hours AS REAL) * CAST(e.hourly_rate AS REAL)), 2), 0) as regular_cost,
            COALESCE(ROUND(SUM(CAST(te.overtime_hours AS REAL) * CASE WHEN CAST(e.overtime_rate AS REAL) > 0 THEN CAST(e.overtime_rate AS REAL) ELSE CAST(e.hourly_rate AS REAL) * 1.5 END), 2), 0) as ot_cost
          FROM time_entries te JOIN employees e ON te.employee_id = e.id
          WHERE te.status = 'approved' AND te.date >= ? AND te.date <= ?
        `).get(from, to) as PM;

      const queryRev = (from: string, to: string): number =>
        (storage.sqlite.prepare(`SELECT COALESCE(SUM(CAST(revenue AS REAL)), 0) as total FROM jobs WHERE scheduled_date >= ? AND scheduled_date <= ?`).get(from, to) as { total: number }).total;

      const curr = queryPeriod(cFrom, cTo);
      const prev = queryPeriod(pFrom, pTo);

      res.json({
        data: [
          { metric: "Total Hours", current: parseFloat(curr.total_hours.toFixed(2)), previous: parseFloat(prev.total_hours.toFixed(2)) },
          { metric: "OT Hours", current: parseFloat(curr.ot_hours.toFixed(2)), previous: parseFloat(prev.ot_hours.toFixed(2)) },
          { metric: "Labor Cost", current: parseFloat((curr.regular_cost + curr.ot_cost).toFixed(2)), previous: parseFloat((prev.regular_cost + prev.ot_cost).toFixed(2)) },
          { metric: "Revenue", current: parseFloat(queryRev(cFrom, cTo).toFixed(2)), previous: parseFloat(queryRev(pFrom, pTo).toFixed(2)) },
        ],
        meta: { currentFrom: cFrom, currentTo: cTo, previousFrom: pFrom, previousTo: pTo },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch period comparison", code: "FETCH_ERROR" });
    }
  });

  // ── DASHBOARD STATS ───────────────────────────────────────────────────────
  app.get("/api/dashboard/stats", async (_req, res) => {
    try {
      const today = new Date().toISOString().split("T")[0];

      // This-week Monday
      const now = new Date();
      const dow = now.getUTCDay(); // 0=Sun
      const diffToMon = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(now);
      monday.setUTCDate(now.getUTCDate() + diffToMon);
      const weekStart = monday.toISOString().split("T")[0];
      const weekEnd = new Date(monday.getTime() + 6 * 86400000).toISOString().split("T")[0];

      // ── Workforce ─────────────────────────────────────────────────────────
      const activeDriversRows = storage.sqlite.prepare(`
        SELECT DISTINCT te.employee_id FROM time_entries te
        JOIN employees e ON e.id = te.employee_id
        WHERE te.date = ? AND te.status = 'active'
      `).all(today) as { employee_id: number }[];
      const activeDrivers = activeDriversRows.length;

      const onBreakRows = storage.sqlite.prepare(`
        SELECT COUNT(*) as cnt FROM time_entries te
        WHERE te.date = ? AND te.status = 'active' AND te.break_start IS NOT NULL AND te.clock_out IS NULL
      `).get(today) as { cnt: number };
      const driversOnBreak = Number(onBreakRows?.cnt ?? 0);

      const totalDriversRow = storage.sqlite.prepare(`
        SELECT COUNT(*) as cnt FROM employees WHERE role = 'driver' AND status = 'active'
      `).get() as { cnt: number };
      const totalDrivers = Number(totalDriversRow?.cnt ?? 0);

      // ── Today hours & cost ─────────────────────────────────────────────────
      interface TERow {
        total_hours: string; clock_in: string | null; clock_out: string | null;
        break_minutes: number; status: string; hourly_rate: string; overtime_rate: string;
      }
      const todayEntries = storage.sqlite.prepare(`
        SELECT te.total_hours, te.clock_in, te.clock_out, te.break_minutes, te.status,
               CAST(e.hourly_rate AS REAL) as hourly_rate, CAST(e.overtime_rate AS REAL) as overtime_rate
        FROM time_entries te JOIN employees e ON e.id = te.employee_id
        WHERE te.date = ?
      `).all(today) as TERow[];

      let todayTotalHours = 0;
      let todayLaborCost = 0;
      const nowMs = Date.now();
      for (const te of todayEntries) {
        let h = parseFloat(te.total_hours ?? "0");
        if (te.status === "active" && te.clock_in && !te.clock_out) {
          const elapsed = (nowMs - new Date(te.clock_in + (te.clock_in.includes("T") ? "" : "T00:00:00Z")).getTime()) / 3600000;
          const breaks = (te.break_minutes ?? 0) / 60;
          h = Math.max(0, elapsed - breaks);
        }
        todayTotalHours += h;
        const rate = Number(te.hourly_rate) > 0 ? te.hourly_rate : 0;
        todayLaborCost += h * Number(rate);
      }

      // ── Today stops ────────────────────────────────────────────────────────
      const stopsRow = storage.sqlite.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN rs.status = 'completed' THEN 1 ELSE 0 END) as completed
        FROM route_stops rs JOIN routes r ON r.id = rs.route_id WHERE r.date = ?
      `).get(today) as { total: number; completed: number };
      const todayTotalStops = Number(stopsRow?.total ?? 0);
      const todayCompletedStops = Number(stopsRow?.completed ?? 0);

      // ── Weekly hours & OT ──────────────────────────────────────────────────
      interface WeekRow { employee_id: number; total_hours: string; status: string }
      const weekEntries = storage.sqlite.prepare(`
        SELECT employee_id, total_hours, status, clock_in, clock_out, break_minutes
        FROM time_entries WHERE date >= ? AND date <= ?
      `).all(weekStart, weekEnd) as (WeekRow & { clock_in: string | null; clock_out: string | null; break_minutes: number })[];

      const weekByEmp = new Map<number, number>();
      for (const te of weekEntries) {
        let h = parseFloat(te.total_hours ?? "0");
        if (te.status === "active" && te.clock_in && !te.clock_out) {
          const elapsed = (nowMs - new Date(te.clock_in + (te.clock_in.includes("T") ? "" : "T00:00:00Z")).getTime()) / 3600000;
          h = Math.max(0, elapsed - (te.break_minutes ?? 0) / 60);
        }
        weekByEmp.set(te.employee_id, (weekByEmp.get(te.employee_id) ?? 0) + h);
      }
      let weeklyTotalHours = 0;
      let weeklyOvertimeHours = 0;
      let weeklyLaborCost = 0;
      for (const [empId, hrs] of weekByEmp) {
        weeklyTotalHours += hrs;
        if (hrs > 40) weeklyOvertimeHours += hrs - 40;
        const emp = storage.sqlite.prepare("SELECT hourly_rate, overtime_rate FROM employees WHERE id = ?").get(empId) as { hourly_rate: string; overtime_rate: string } | undefined;
        const rate = parseFloat(emp?.hourly_rate ?? "0");
        const otRate = parseFloat(emp?.overtime_rate ?? "0") || rate * 1.5;
        const reg = Math.min(hrs, 40);
        const ot = Math.max(0, hrs - 40);
        weeklyLaborCost += reg * rate + ot * otRate;
      }

      // ── Alerts ─────────────────────────────────────────────────────────────
      const alertCounts = storage.sqlite.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical
        FROM alerts WHERE resolved = 0
      `).get() as { total: number; critical: number };
      const unresolvedAlerts = Number(alertCounts?.total ?? 0);
      const criticalAlerts = Number(alertCounts?.critical ?? 0);

      // ── Pending approvals ──────────────────────────────────────────────────
      const pendingRow = storage.sqlite.prepare(
        "SELECT COUNT(*) as cnt FROM time_entries WHERE status = 'pending'"
      ).get() as { cnt: number };
      const pendingApprovals = Number(pendingRow?.cnt ?? 0);

      // ── Recent Activity ────────────────────────────────────────────────────
      interface TEActivity {
        id: number; status: string; clock_in: string | null; clock_out: string | null;
        updated_at: string; created_at: string; total_hours: string;
        first_name: string; last_name: string;
      }
      const recentEntries = storage.sqlite.prepare(`
        SELECT te.id, te.status, te.clock_in, te.clock_out, te.updated_at, te.created_at, te.total_hours,
               e.first_name, e.last_name
        FROM time_entries te JOIN employees e ON e.id = te.employee_id
        ORDER BY te.updated_at DESC LIMIT 20
      `).all() as TEActivity[];

      interface AlertActivity { id: number; title: string; message: string; severity: string; created_at: string }
      const recentAlerts = storage.sqlite.prepare(`
        SELECT id, title, message, severity, created_at FROM alerts ORDER BY created_at DESC LIMIT 10
      `).all() as AlertActivity[];

      type ActivityItem = { type: string; description: string; timestamp: string; employeeName?: string };
      const activityItems: ActivityItem[] = [];

      for (const te of recentEntries) {
        const name = `${te.first_name} ${te.last_name}`;
        const ts = te.updated_at || te.created_at;
        if (te.status === "active" && te.clock_in && !te.clock_out) {
          const t = new Date(te.clock_in).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
          activityItems.push({ type: "clock_in", description: `${name} clocked in at ${t}`, timestamp: te.clock_in, employeeName: name });
        } else if (te.clock_out) {
          activityItems.push({ type: "clock_out", description: `${name} clocked out — ${parseFloat(te.total_hours).toFixed(1)} hours`, timestamp: te.clock_out, employeeName: name });
        } else if (te.status === "approved") {
          activityItems.push({ type: "approval", description: `${name}'s timesheet approved`, timestamp: ts, employeeName: name });
        } else if (te.status === "rejected") {
          activityItems.push({ type: "rejection", description: `${name}'s time entry rejected`, timestamp: ts, employeeName: name });
        }
      }
      for (const a of recentAlerts) {
        activityItems.push({ type: "alert", description: a.title, timestamp: a.created_at });
      }
      activityItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const recentActivity = activityItems.slice(0, 10);

      // ── Active routes today ────────────────────────────────────────────────
      interface RouteRow {
        id: number; name: string; assigned_driver_id: number | null;
        first_name: string | null; last_name: string | null;
        total_stops: number; completed_stops: number;
      }
      const routeRows = storage.sqlite.prepare(`
        SELECT r.id, r.name, r.assigned_driver_id,
               e.first_name, e.last_name,
               COUNT(rs.id) as total_stops,
               SUM(CASE WHEN rs.status = 'completed' THEN 1 ELSE 0 END) as completed_stops
        FROM routes r
        LEFT JOIN employees e ON e.id = r.assigned_driver_id
        LEFT JOIN route_stops rs ON rs.route_id = r.id
        WHERE r.date = ? AND r.status IN ('active', 'in_progress')
        GROUP BY r.id
      `).all(today) as RouteRow[];

      const activeRoutes = await Promise.all(routeRows.map(async r => {
        const total = Number(r.total_stops ?? 0);
        const completed = Number(r.completed_stops ?? 0);
        const progress = total > 0 ? Math.round(completed / total * 100) : 0;
        const driverName = r.first_name ? `${r.first_name} ${r.last_name}` : "Unassigned";

        let laborCost = 0;
        if (r.assigned_driver_id) {
          const { data: tes } = await storage.getTimeEntries({ employeeId: r.assigned_driver_id, dateFrom: today, dateTo: today, limit: 50 });
          const driver = await storage.getEmployeeById(r.assigned_driver_id);
          const rate = parseFloat(driver?.hourlyRate ?? "0");
          for (const te of tes) laborCost += parseFloat(te.totalHours ?? "0") * rate;
        }

        const { data: jobs } = await storage.getJobs({ routeId: r.id, limit: 200 });
        const revenue = jobs.reduce((s, j) => s + parseFloat(j.revenue ?? "0"), 0);

        return {
          id: r.id,
          name: r.name,
          driverName,
          progress,
          completedStops: completed,
          totalStops: total,
          laborCost: laborCost.toFixed(2),
          revenue: revenue.toFixed(2),
        };
      }));

      // ── Overtime exposure ──────────────────────────────────────────────────
      const activeEmpRows = storage.sqlite.prepare(`
        SELECT id, first_name, last_name FROM employees WHERE status = 'active'
      `).all() as { id: number; first_name: string; last_name: string }[];

      const todayDow = new Date(today + "T12:00:00Z").getUTCDay();
      const workdaysElapsed = todayDow === 0 ? 7 : todayDow === 6 ? 6 : todayDow; // Mon=1..Fri=5, treat as 5 max
      const workdaysInWeek = 5;

      const overtimeExposure = activeEmpRows
        .map(e => {
          const hrs = weekByEmp.get(e.id) ?? 0;
          const daysWorked = Math.min(workdaysElapsed, workdaysInWeek);
          const projected = daysWorked > 0 ? (hrs / daysWorked) * workdaysInWeek : hrs;
          let status: "safe" | "approaching" | "exceeded" = "safe";
          if (hrs > 40) status = "exceeded";
          else if (projected >= 38) status = "approaching";
          return {
            employeeId: e.id,
            name: `${e.first_name} ${e.last_name}`,
            currentWeeklyHours: hrs.toFixed(2),
            projectedWeeklyHours: projected.toFixed(2),
            status,
          };
        })
        .filter(e => parseFloat(e.currentWeeklyHours) > 0 || parseFloat(e.projectedWeeklyHours) >= 30);

      overtimeExposure.sort((a, b) => {
        const order = { exceeded: 0, approaching: 1, safe: 2 };
        return order[a.status] - order[b.status] || parseFloat(b.currentWeeklyHours) - parseFloat(a.currentWeeklyHours);
      });

      res.json({
        data: {
          activeDrivers,
          totalDrivers,
          driversOnBreak,
          todayTotalHours: todayTotalHours.toFixed(2),
          todayLaborCost: todayLaborCost.toFixed(2),
          todayCompletedStops,
          todayTotalStops,
          weeklyTotalHours: weeklyTotalHours.toFixed(2),
          weeklyOvertimeHours: weeklyOvertimeHours.toFixed(2),
          weeklyLaborCost: weeklyLaborCost.toFixed(2),
          pendingApprovals,
          unresolvedAlerts,
          criticalAlerts,
          recentActivity,
          activeRoutes,
          overtimeExposure,
        },
      });
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ error: "Failed to fetch dashboard stats", code: "FETCH_ERROR" });
    }
  });

  // ── ALERTS ─────────────────────────────────────────────────────────────────
  app.get("/api/alerts", async (req, res) => {
    try {
      const { resolved, severity, limit } = req.query;
      const data = await storage.getAlerts({
        resolved: resolved === "false" ? false : resolved === "true" ? true : undefined,
        severity: severity as string | undefined,
        limit: limit ? parseInt(limit as string) : 20,
      });
      res.json({ data });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch alerts", code: "FETCH_ERROR" });
    }
  });

  app.patch("/api/alerts/:id/resolve", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { userId, notes } = req.body;
      const data = await storage.resolveAlert(id, userId ?? 1, notes);
      res.json({ data });
    } catch (error) {
      res.status(500).json({ error: "Failed to resolve alert", code: "UPDATE_ERROR" });
    }
  });

  // ── PAYROLL (legacy) ──────────────────────────────────────────────────────
  app.get("/api/payroll-runs", async (_req, res) => {
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
