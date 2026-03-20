import React from "react";
import { X, MapPin, Activity } from "lucide-react";
import type { VenueSelection } from "./MapboxMap";

type VenueInfoPopupProps = {
  venue: VenueSelection;
  openGamesNearbyCount: number;
  onClose: () => void;
};

function formatCoords(lat: number, lng: number): string {
  const latStr = Math.abs(lat).toFixed(2) + (lat >= 0 ? "°N" : "°S");
  const lngStr = Math.abs(lng).toFixed(2) + (lng >= 0 ? "°E" : "°W");
  return `${latStr}, ${lngStr}`;
}

export function VenueInfoPopup({ venue, openGamesNearbyCount, onClose }: VenueInfoPopupProps) {
  const title = venue.name?.trim() ? venue.name : "Sports venue";
  const sub =
    venue.sport?.trim() || venue.leisure?.trim()
      ? `${venue.sport?.trim() ? venue.sport.trim() : venue.leisure?.trim() ?? ""}${venue.sport?.trim() && venue.leisure?.trim() ? " · " : ""}${
          venue.sport?.trim() && venue.leisure?.trim() ? venue.leisure.trim() : ""
        }`
      : "Pickup games nearby";

  return (
    <div
      className="absolute z-[1000] w-64 rounded-xl border border-slate-600 bg-slate-900/95 shadow-xl backdrop-blur-sm overflow-hidden"
      style={{ transform: "translate(-50%, calc(-100% - 12px))" }}
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white truncate">{title}</p>
            <p className="text-slate-400 text-sm mt-0.5 truncate">{sub}</p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1 rounded-full hover:bg-slate-800 text-slate-300"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-2 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-slate-300 text-sm">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span className="font-medium">{openGamesNearbyCount} open game{openGamesNearbyCount === 1 ? "" : "s"}</span>
            <span className="text-slate-500 text-xs">near this venue</span>
          </div>

          <div className="flex items-center gap-2 text-slate-500 text-xs">
            <MapPin className="w-3 h-3 shrink-0" />
            {formatCoords(venue.center.lat, venue.center.lng)}
          </div>
        </div>
      </div>
    </div>
  );
}

