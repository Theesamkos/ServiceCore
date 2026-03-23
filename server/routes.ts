import type { Express } from "express";
import { storage } from "./storage";
import { insertEmployeeSchema, insertTimeEntrySchema, insertPayrollRunSchema } from "@shared/schema";

export function registerRoutes(app: Express) {
  // Employees
  app.get("/api/employees", async (req, res) => {
    try {
      const data = await storage.getEmployees();
      res.json({ data });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch employees", code: "FETCH_ERROR" });
    }
  });

  app.get("/api/employees/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const data = await storage.getEmployee(id);
      if (!data) return res.status(404).json({ error: "Employee not found", code: "NOT_FOUND" });
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
      res.status(201).json({ data });
    } catch (error) {
      res.status(500).json({ error: "Failed to create employee", code: "CREATE_ERROR" });
    }
  });

  app.patch("/api/employees/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const data = await storage.updateEmployee(id, req.body);
      res.json({ data });
    } catch (error) {
      res.status(500).json({ error: "Failed to update employee", code: "UPDATE_ERROR" });
    }
  });

  // Time entries
  app.get("/api/time-entries", async (req, res) => {
    try {
      const data = await storage.getTimeEntries();
      res.json({ data });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch time entries", code: "FETCH_ERROR" });
    }
  });

  app.post("/api/time-entries", async (req, res) => {
    try {
      const parsed = insertTimeEntrySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", code: "VALIDATION_ERROR", details: parsed.error.issues });
      }
      const data = await storage.createTimeEntry(parsed.data);
      res.status(201).json({ data });
    } catch (error) {
      res.status(500).json({ error: "Failed to create time entry", code: "CREATE_ERROR" });
    }
  });

  // Payroll
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
