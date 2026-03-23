import express from "express";
import { registerRoutes } from "./routes";
import { setupVite } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

registerRoutes(app);

const PORT = parseInt(process.env.PORT ?? "5000");

if (process.env.NODE_ENV === "production") {
  const { serveStatic } = await import("./vite");
  serveStatic(app);
} else {
  await setupVite(app);
}

app.listen(PORT, () => {
  console.log(`ServiceCore server running on port ${PORT}`);
});
