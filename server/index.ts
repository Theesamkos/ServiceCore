import 'dotenv/config';
import express from "express";
import { registerRoutes } from "./routes";
import { setupVite } from "./vite";
import { storage } from "./storage";
import { seedDatabase } from "./seed";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

registerRoutes(app);

// Auto-seed on first run
const check = await storage.getEmployees({ limit: 1 });
if (check.total === 0) {
  console.log("🌱 Seeding database with demo data...");
  await seedDatabase();
  console.log("✅ Seed data created successfully");
}

const PORT = parseInt(process.env.PORT ?? "5000");

if (process.env.NODE_ENV === "production") {
  const { serveStatic } = await import("./vite");
  serveStatic(app);
} else {
  await setupVite(app);
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ServiceCore server running on port ${PORT}`);
});
