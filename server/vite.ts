import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer } from "vite";

export async function setupVite(app: Express) {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

export function serveStatic(app: Express) {
  // Try multiple paths for Railway compatibility
  const candidates = [
    path.resolve("dist/public"),
    path.resolve("/app/dist/public"),
    path.join(process.cwd(), "dist/public"),
  ];
  const distPath = candidates.find(p => fs.existsSync(p));
  if (!distPath) {
    console.error("Build directory not found. Tried:", candidates);
    throw new Error("Build directory not found. Run `npm run build` first.");
  }
  console.log(`Serving static files from: ${distPath}`);
  app.use(express.static(distPath));
  // SPA fallback — serve index.html for all non-API routes
  app.get("*", (_req, res) => {
    if (_req.path.startsWith("/api")) return res.status(404).json({ error: "Not found" });
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
