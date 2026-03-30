import { CheckCircle, MapPin, FileText } from "lucide-react";

interface GPSBadgeProps {
  clockInType: string;
  geofenceName?: string;
}

export function GPSBadge({ clockInType, geofenceName }: GPSBadgeProps) {
  if (clockInType === "geofence") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800"
        title={geofenceName ? `Verified at: ${geofenceName}` : "GPS Verified"}
      >
        <CheckCircle className="w-3 h-3" />
        {geofenceName ? `GPS — ${geofenceName}` : "GPS Verified"}
      </span>
    );
  }
  if (clockInType === "gps") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
        <MapPin className="w-3 h-3" />
        GPS — Off-Site
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">
      <FileText className="w-3 h-3" />
      Manual Entry
    </span>
  );
}
