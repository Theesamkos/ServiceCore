import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import {
  Navigation, MapPin, Clock, TrendingDown, CheckCircle2,
  Loader2, Wifi, WifiOff, AlertTriangle,
} from "lucide-react";
import type { Geofence } from "@shared/schema";

// ─── Haversine distance (metres) ─────────────────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDist(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}
function fmtEta(m: number, kph = 40) {
  const mins = Math.round((m / 1000 / kph) * 60);
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

interface GeoCoords { lat: number; lng: number; accuracy?: number }
interface GeofenceResp { data: Geofence[] }

interface DriverMapProps {
  driverCoords?: GeoCoords | null;
  employeeName?: string;
  targetGeofenceId?: number | null;
  isClocked?: boolean;
}

// ─── Canvas-based map (no external dependencies) ─────────────────────────────
// Renders a clean visual map using HTML Canvas — works everywhere, no CDN needed
function CanvasMap({
  driver,
  sites,
  nearest,
}: {
  driver: GeoCoords;
  sites: Geofence[];
  nearest: Geofence | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    // Collect all points to determine bounds
    const allLats = [driver.lat, ...sites.map(s => parseFloat(s.centerLat))];
    const allLngs = [driver.lng, ...sites.map(s => parseFloat(s.centerLng))];
    const minLat = Math.min(...allLats);
    const maxLat = Math.max(...allLats);
    const minLng = Math.min(...allLngs);
    const maxLng = Math.max(...allLngs);

    const pad = 0.008; // ~800m padding
    const latRange = Math.max(maxLat - minLat + pad * 2, 0.02);
    const lngRange = Math.max(maxLng - minLng + pad * 2, 0.02);

    const toX = (lng: number) => ((lng - (minLng - pad)) / lngRange) * W;
    const toY = (lat: number) => H - ((lat - (minLat - pad)) / latRange) * H;

    // Background
    ctx.fillStyle = "#f8f9fa";
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo((W / 8) * i, 0);
      ctx.lineTo((W / 8) * i, H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, (H / 6) * i);
      ctx.lineTo(W, (H / 6) * i);
      ctx.stroke();
    }

    // Draw geofence circles for all sites
    sites.forEach(site => {
      const sx = toX(parseFloat(site.centerLng));
      const sy = toY(parseFloat(site.centerLat));
      // Approximate pixel radius from meters
      const radiusPx = (site.radiusMeters / (lngRange * 111320)) * W;
      const isTarget = nearest?.id === site.id;

      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(radiusPx, 8), 0, Math.PI * 2);
      ctx.fillStyle = isTarget ? "rgba(239,68,68,0.08)" : "rgba(107,114,128,0.06)";
      ctx.fill();
      ctx.strokeStyle = isTarget ? "#ef4444" : "#9ca3af";
      ctx.lineWidth = isTarget ? 2 : 1;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Draw dashed line from driver to nearest site
    if (nearest) {
      const nx = toX(parseFloat(nearest.centerLng));
      const ny = toY(parseFloat(nearest.centerLat));
      const dx = toX(driver.lng);
      const dy = toY(driver.lat);
      ctx.beginPath();
      ctx.moveTo(dx, dy);
      ctx.lineTo(nx, ny);
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw site pins
    sites.forEach(site => {
      const sx = toX(parseFloat(site.centerLng));
      const sy = toY(parseFloat(site.centerLat));
      const isTarget = nearest?.id === site.id;
      const color = isTarget ? "#ef4444" : "#6b7280";
      const r = isTarget ? 10 : 7;

      // Pin body
      ctx.beginPath();
      ctx.arc(sx, sy - r, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Pin point
      ctx.beginPath();
      ctx.moveTo(sx - 4, sy - r);
      ctx.lineTo(sx + 4, sy - r);
      ctx.lineTo(sx, sy + 2);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      // White dot in pin
      ctx.beginPath();
      ctx.arc(sx, sy - r, r * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();

      // Label
      ctx.font = `${isTarget ? "bold " : ""}11px Inter, system-ui, sans-serif`;
      ctx.fillStyle = isTarget ? "#dc2626" : "#374151";
      ctx.textAlign = "center";
      const label = site.name.length > 16 ? site.name.slice(0, 14) + "…" : site.name;
      // Label background
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(sx - tw / 2 - 3, sy + 5, tw + 6, 16);
      ctx.fillStyle = isTarget ? "#dc2626" : "#374151";
      ctx.fillText(label, sx, sy + 17);
    });

    // Draw driver dot (pulsing blue)
    const dx = toX(driver.lng);
    const dy = toY(driver.lat);

    // Outer pulse ring
    ctx.beginPath();
    ctx.arc(dx, dy, 18, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(59,130,246,0.15)";
    ctx.fill();

    // Middle ring
    ctx.beginPath();
    ctx.arc(dx, dy, 12, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(59,130,246,0.25)";
    ctx.fill();

    // Core dot
    ctx.beginPath();
    ctx.arc(dx, dy, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#3b82f6";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // "You" label
    ctx.font = "bold 11px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#1d4ed8";
    ctx.textAlign = "center";
    const youLabel = "📍 You";
    const yw = ctx.measureText(youLabel).width;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(dx - yw / 2 - 4, dy - 30, yw + 8, 17);
    ctx.fillStyle = "#1d4ed8";
    ctx.fillText(youLabel, dx, dy - 18);

    // Compass rose (top right)
    const cx = W - 28, cy = 28;
    ctx.font = "bold 10px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#6b7280";
    ctx.textAlign = "center";
    ctx.fillText("N", cx, cy - 14);
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx, cy + 10);
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy);
    ctx.lineTo(cx + 10, cy);
    ctx.stroke();

    // Scale bar (bottom left)
    const scaleMeters = Math.round(lngRange * 111320 * 0.2);
    const scaleLabel = scaleMeters >= 1000
      ? `${(scaleMeters / 1000).toFixed(1)} km`
      : `${scaleMeters} m`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(10, H - 26, 90, 18);
    ctx.strokeStyle = "#374151";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(14, H - 12);
    ctx.lineTo(94, H - 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(14, H - 16);
    ctx.lineTo(14, H - 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(94, H - 16);
    ctx.lineTo(94, H - 8);
    ctx.stroke();
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#374151";
    ctx.textAlign = "center";
    ctx.fillText(scaleLabel, 54, H - 14);

  }, [driver.lat, driver.lng, sites, nearest]);

  return (
    <canvas
      ref={canvasRef}
      width={700}
      height={300}
      className="w-full rounded-xl border border-gray-200"
      style={{ height: 300, display: "block" }}
    />
  );
}

// ─── Main exported component ─────────────────────────────────────────────────
export function DriverTrackingMap({
  driverCoords,
  employeeName,
  targetGeofenceId,
}: DriverMapProps) {
  const [liveCoords, setLiveCoords] = useState<GeoCoords | null>(driverCoords ?? null);
  const [gpsActive, setGpsActive] = useState(false);
  const [gpsError, setGpsError] = useState(false);
  const watchRef = useRef<number | null>(null);

  // Fetch geofences
  const { data: geoData, isLoading: geosLoading } = useQuery<GeofenceResp>({
    queryKey: ["/api/geofences"],
    queryFn: () => apiRequest("/api/geofences?status=active"),
    staleTime: 60_000,
  });
  const sites: Geofence[] = geoData?.data ?? [];

  // GPS watch — non-blocking, enhances map when available
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError(true);
      return;
    }
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setLiveCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGpsActive(true);
        setGpsError(false);
      },
      () => {
        setGpsActive(false);
        setGpsError(true);
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  // Sync prop changes
  useEffect(() => {
    if (driverCoords) { setLiveCoords(driverCoords); setGpsActive(true); }
  }, [driverCoords]);

  // Nearest geofence
  const nearest: Geofence | null = (() => {
    if (sites.length === 0) return null;
    if (targetGeofenceId) {
      const t = sites.find((s) => s.id === targetGeofenceId);
      if (t) return t;
    }
    if (!liveCoords) return sites[0];
    return sites.reduce<{ site: Geofence; dist: number } | null>((best, site) => {
      const d = haversine(liveCoords.lat, liveCoords.lng, parseFloat(site.centerLat), parseFloat(site.centerLng));
      return !best || d < best.dist ? { site, dist: d } : best;
    }, null)?.site ?? null;
  })();

  // Fallback coords: offset from nearest site center when GPS unavailable
  const displayCoords: GeoCoords = liveCoords ?? (nearest
    ? { lat: parseFloat(nearest.centerLat) + 0.006, lng: parseFloat(nearest.centerLng) + 0.006 }
    : { lat: 30.2672, lng: -97.7431 }); // Austin TX default

  const distToNearest = nearest
    ? haversine(displayCoords.lat, displayCoords.lng, parseFloat(nearest.centerLat), parseFloat(nearest.centerLng))
    : null;

  const onSite = distToNearest !== null && nearest !== null && distToNearest <= nearest.radiusMeters;

  if (geosLoading && !nearest) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        Loading job sites…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Status bar ─────────────────────────────────────────────────── */}
      <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border text-sm font-medium
        ${onSite ? "bg-green-50 border-green-200 text-green-800" : "bg-blue-50 border-blue-100 text-blue-800"}`}>
        <div className="flex items-center gap-2">
          {onSite
            ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
            : <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />}
          <span>
            {employeeName ? `${employeeName} — ` : ""}
            {onSite
              ? `On-site at ${nearest?.name}`
              : nearest
              ? `En route to ${nearest.name}`
              : "No job sites configured"}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {distToNearest !== null && !onSite && (
            <>
              <span className="flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5" />
                {fmtDist(distToNearest)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {fmtEta(distToNearest)}
              </span>
            </>
          )}
          <span className={`flex items-center gap-1 ${gpsActive ? "text-green-600" : "text-amber-500"}`}>
            {gpsActive
              ? <><Wifi className="w-3 h-3" />Live GPS</>
              : gpsError
              ? <><AlertTriangle className="w-3 h-3" />GPS unavailable</>
              : <><WifiOff className="w-3 h-3" />Acquiring…</>}
          </span>
          {liveCoords?.accuracy && (
            <span className="flex items-center gap-1 opacity-60">
              <Navigation className="w-3 h-3" />±{Math.round(liveCoords.accuracy)}m
            </span>
          )}
        </div>
      </div>

      {/* ── Canvas Map — always renders, zero external dependencies ─────── */}
      <CanvasMap driver={displayCoords} sites={sites} nearest={nearest} />

      {/* ── Site distance list ──────────────────────────────────────────── */}
      {sites.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {sites
            .map((s) => ({
              site: s,
              dist: haversine(displayCoords.lat, displayCoords.lng, parseFloat(s.centerLat), parseFloat(s.centerLng)),
            }))
            .sort((a, b) => a.dist - b.dist)
            .slice(0, 4)
            .map(({ site, dist }) => {
              const inside = dist <= site.radiusMeters;
              return (
                <div key={site.id}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs
                    ${inside ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
                  <div className="flex items-center gap-2">
                    <MapPin className={`w-3.5 h-3.5 shrink-0 ${inside ? "text-green-600" : "text-gray-400"}`} />
                    <span className="font-medium text-gray-800 truncate max-w-[130px]">{site.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-500 shrink-0">
                    <span>{fmtDist(dist)}</span>
                    {!inside && <span className="text-gray-400">· {fmtEta(dist)}</span>}
                    {inside && <span className="text-green-600 font-semibold">On-site ✓</span>}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
