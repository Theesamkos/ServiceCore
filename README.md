# ServiceCore

**Field Service Management Platform** — Real-time time tracking, GPS verification, job costing, payroll processing, and route management for field operations teams.

## Live Demo

**URL:** https://servicecore-production-3b31.up.railway.app  
**Credentials:** `admin` / `admin123`

---

## Features

| Module | Description |
|---|---|
| **Dashboard** | 8 live KPI cards — today's revenue, gross profit, active employees, pending approvals, and alerts. Auto-refreshes every 30 seconds. |
| **Time Tracking** | GPS-verified clock in/out with real-time geofence validation. Approval workflow with bulk actions. |
| **Live Driver Map** | Canvas-based real-time tracking map — driver position, job site pins, geofence radius rings, distance and ETA calculation. Zero external map dependencies. |
| **Job Costing** | Full P&L engine with labor and material cost tracking. Inline editing with live margin recalculation. Recharts visualizations by service type, customer, and route. |
| **Payroll** | Automated overtime engine (regular, 1.5x OT, 2x double time). QuickBooks IIF and CSV export. |
| **Routes** | Route management with ordered stop sequencing and per-route margin analysis. |
| **Analytics** | 6 interactive charts covering revenue trends, labor efficiency, job profitability, and crew performance. |
| **Settings** | Company profile, overtime rules, pay period configuration, and geofence management. |
| **AI Assistant** | Embedded chat widget with real-time data context for operational queries. |

---

## Tech Stack

- **Frontend:** React 18, TypeScript, TailwindCSS, Recharts, HTML5 Canvas
- **Backend:** Express.js, Node.js
- **Database:** SQLite with Drizzle ORM
- **Deployment:** Railway (auto-deploy from GitHub)

---

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

The app runs on `http://localhost:5000` in development.

---

## Architecture

The application follows a monorepo structure with a shared TypeScript schema:

```
servicecore/
├── client/          # React frontend (Vite)
│   └── src/
│       ├── components/
│       │   ├── time-tracking/   # Clock widget + live driver map
│       │   ├── routes/          # Route form and detail views
│       │   └── layout/          # Sidebar, navigation
│       └── pages/               # Dashboard, Timesheets, Job Costing, etc.
├── server/          # Express backend
│   ├── routes.ts    # All API endpoints
│   ├── storage.ts   # Drizzle ORM data access layer
│   └── payroll-calculator.ts   # OT calculation engine
└── shared/
    └── schema.ts    # Drizzle schema + Zod validation types
```

---

## GPS & Geofencing

The live driver tracking map is built on the browser's native `Geolocation.watchPosition` API and rendered via HTML5 Canvas — no third-party map libraries. Distance calculations use the Haversine formula. Geofence boundaries are stored in the database and rendered as radius rings on the canvas.

---

## Payroll Engine

The overtime calculation engine supports configurable rules per jurisdiction:

- **Regular time:** up to 8 hours/day, 40 hours/week
- **Overtime (1.5x):** 8–12 hours/day or 40–60 hours/week
- **Double time (2x):** 12+ hours/day or 60+ hours/week

Rules are configurable per company in Settings.
