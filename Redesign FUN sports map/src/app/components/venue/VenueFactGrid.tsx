import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  Accessibility,
  Armchair,
  Building2,
  CircleParking,
  Clock,
  DoorOpen,
  Droplet,
  Layers,
  Lock,
  MapPin,
  Phone,
  ShowerHead,
  Sun,
  Ticket,
  Toilet,
  Umbrella,
  Users,
  Wifi,
} from "lucide-react";
import {
  formatAccess,
  formatAddress,
  formatCapacity,
  formatCoords,
  formatCount,
  formatLit,
  formatOpeningHours,
  formatSurface,
  prettyLabel,
  telHref,
} from "../../lib/venueInfoHelpers";
import type { VenueGoogleDetails } from "../../../lib/api";
import type { VenueSelection } from "../mapboxMapTypes";

type Item = { key: string; label: string; icon: ReactNode };

type Props = {
  venue: VenueSelection;
  google?: VenueGoogleDetails | null;
};

/**
 * The venue's factual block: chips, an amenities grid, then labelled rows.
 *
 * Most of this was already being fetched and thrown away — the OSM importer
 * dropped ~30 tags it received for free, and the Google lookup asked for four
 * fields. Nothing here is invented: these are claims about a real place, so a
 * tag that is merely absent renders nothing rather than a negative. ("no
 * toilets" and "nobody mapped the toilets" are different statements, and only
 * one of them is supported by the data.)
 */
export function VenueFactGrid({ venue, google }: Props) {
  const tags = venue.tags;

  const chips = useMemo(() => {
    const items: Item[] = [];
    const push = (key: string, label: string | null, icon: ReactNode) => {
      if (label) items.push({ key, label, icon });
    };
    push("surface", formatSurface(venue.surface), <Layers className="h-3 w-3" />);
    push("lit", formatLit(venue.lit), <Sun className="h-3 w-3" />);
    push("access", formatAccess(venue.access), <Lock className="h-3 w-3" />);
    // Countable facts read better as chips than as amenity rows.
    push("hoops", formatCount(tags?.hoops, "hoop"), <Ticket className="h-3 w-3" />);
    push("lanes", formatCount(tags?.lanes, "lane"), <Ticket className="h-3 w-3" />);
    push("capacity", formatCapacity(tags?.capacity), <Users className="h-3 w-3" />);
    return items;
  }, [venue.surface, venue.lit, venue.access, tags]);

  const amenities = useMemo(() => {
    const t = tags;
    const items: Item[] = [];
    const has = (v: string | undefined) => Boolean(v) && v !== "no";

    if (t) {
      if (has(t.toilets)) items.push({ key: "toilets", label: "Restrooms", icon: <Toilet className="h-3.5 w-3.5" /> });
      if (has(t.drinking_water))
        items.push({ key: "water", label: "Drinking water", icon: <Droplet className="h-3.5 w-3.5" /> });
      if (has(t.parking))
        items.push({ key: "parking", label: "Parking", icon: <CircleParking className="h-3.5 w-3.5" /> });
      if (has(t.shower)) items.push({ key: "shower", label: "Showers", icon: <ShowerHead className="h-3.5 w-3.5" /> });
      if (has(t.changing_room))
        items.push({ key: "changing", label: "Changing rooms", icon: <DoorOpen className="h-3.5 w-3.5" /> });
      if (has(t.internet_access) && t.internet_access !== "terminal")
        items.push({ key: "wifi", label: "Wi-Fi", icon: <Wifi className="h-3.5 w-3.5" /> });
      if (has(t.bench)) items.push({ key: "bench", label: "Seating", icon: <Armchair className="h-3.5 w-3.5" /> });
      if (has(t.covered)) items.push({ key: "covered", label: "Covered", icon: <Umbrella className="h-3.5 w-3.5" /> });
      if (t.wheelchair === "yes")
        items.push({ key: "wheelchair", label: "Step-free access", icon: <Accessibility className="h-3.5 w-3.5" /> });
      // "fee" is the one tag worth showing in both directions — free vs paid both matter.
      if (t.fee === "no") items.push({ key: "fee", label: "Free to use", icon: <Ticket className="h-3.5 w-3.5" /> });
      else if (has(t.fee)) items.push({ key: "fee", label: "Paid", icon: <Ticket className="h-3.5 w-3.5" /> });
    }

    // Google fills gaps OSM left blank, never overriding a mapped tag.
    if (!items.some((i) => i.key === "wheelchair") && google?.wheelchairAccessible) {
      items.push({ key: "wheelchair", label: "Step-free access", icon: <Accessibility className="h-3.5 w-3.5" /> });
    }
    if (!items.some((i) => i.key === "parking") && google?.freeParking) {
      items.push({ key: "parking", label: "Free parking", icon: <CircleParking className="h-3.5 w-3.5" /> });
    }
    return items;
  }, [tags, google]);

  // OSM hours are terse ("Mo-Fr 08:00-22:00"); Google's weekday lines read
  // better, so prefer them when the venue matched a real place.
  const osmHours = useMemo(() => formatOpeningHours(venue.opening_hours), [venue.opening_hours]);
  const googleHours = google?.openingHours?.length ? google.openingHours : null;
  const hours = googleHours ?? osmHours;

  const operator = prettyLabel(venue.operator);
  const address = google?.formattedAddress ?? formatAddress(tags?.addr);
  const phone = tags?.phone ?? google?.phone ?? null;
  const phoneLink = telHref(phone);
  const closed = google?.businessStatus && google.businessStatus !== "OPERATIONAL";

  return (
    <>
      {closed ? (
        <p className="mx-4 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Google lists this place as{" "}
          {google?.businessStatus === "CLOSED_TEMPORARILY" ? "temporarily closed" : "permanently closed"}.
        </p>
      ) : null}

      {chips.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 px-4">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs font-medium text-slate-200"
            >
              <span className="text-emerald-400">{chip.icon}</span>
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}

      {amenities.length > 0 ? (
        <div className="mt-4 px-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Amenities</p>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
            {amenities.map((a) => (
              <li key={a.key} className="flex items-center gap-2 text-sm text-slate-200">
                <span className="shrink-0 text-emerald-400">{a.icon}</span>
                <span className="truncate">{a.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 space-y-2.5 px-4 text-sm text-slate-300">
        {operator ? (
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            <span className="text-slate-400">Operated by</span>
            <span className="truncate font-medium text-slate-200">{operator}</span>
          </div>
        ) : null}

        <div className="flex items-start gap-2">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          {hours.length > 0 ? (
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Hours
                {typeof google?.openNow === "boolean" ? (
                  <span className={google.openNow ? "text-emerald-400" : "text-slate-500"}>
                    {google.openNow ? "Open now" : "Closed now"}
                  </span>
                ) : null}
              </p>
              <div
                className={
                  googleHours
                    ? "mt-0.5 text-[12px] leading-relaxed text-slate-200"
                    : "mt-0.5 font-mono text-[12px] leading-relaxed text-slate-200"
                }
              >
                {hours.map((line, i) => (
                  <div key={i} className="break-words">
                    {line}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <span className="text-slate-500">Hours not listed</span>
          )}
        </div>

        {address ? (
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            <span className="min-w-0 break-words text-slate-300">{address}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            <span className="text-slate-400">{formatCoords(venue.center.lat, venue.center.lng)}</span>
          </div>
        )}

        {phone ? (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            {phoneLink ? (
              <a
                href={phoneLink}
                className="text-slate-200 underline decoration-dotted underline-offset-2 hover:text-white"
              >
                {phone}
              </a>
            ) : (
              <span className="text-slate-300">{phone}</span>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
