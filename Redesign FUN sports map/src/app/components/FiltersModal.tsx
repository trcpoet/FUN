import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { cn } from "./ui/utils";
import { SPORT_OPTIONS } from "../../lib/sports";

/** Search radii for map data (km). */
export const RADIUS_KM_OPTIONS = [3, 5, 10, 15, 25] as const;

export type FiltersState = {
  /** Filter map pins to these sports (empty = all). Also filters OSM venues by pitch sport tags. */
  sports: string[];
  gamesRadiusKm: number;
  venueRadiusKm: number;
  athletesRadiusKm: number;
};

export const DEFAULT_FILTERS: FiltersState = {
  sports: [],
  gamesRadiusKm: 15,
  venueRadiusKm: 15,
  athletesRadiusKm: 10,
};

type FiltersModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: FiltersState;
  onChange: (next: FiltersState) => void;
  onApply?: () => void;
  onClear?: () => void;
};

function toggleInArray(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function PillsRow(props: {
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { options, selected, onChange } = props;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(toggleInArray(selected, opt))}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-emerald-400 bg-emerald-500/90 text-slate-950"
                : "border-slate-700 bg-slate-800/60 text-slate-300 hover:border-emerald-400/70 hover:text-white",
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function KmPillsRow(props: {
  value: number;
  onChange: (km: number) => void;
}) {
  const { value, onChange } = props;
  return (
    <div className="flex flex-wrap gap-2">
      {RADIUS_KM_OPTIONS.map((km) => {
        const active = value === km;
        return (
          <button
            key={km}
            type="button"
            onClick={() => onChange(km)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium tabular-nums transition-colors",
              active
                ? "border-emerald-400 bg-emerald-500/90 text-slate-950"
                : "border-slate-700 bg-slate-800/60 text-slate-300 hover:border-emerald-400/70 hover:text-white",
            )}
          >
            {km} km
          </button>
        );
      })}
    </div>
  );
}

export function FiltersModal(props: FiltersModalProps) {
  const { open, onOpenChange, value, onChange, onApply, onClear } = props;

  const update = (patch: Partial<FiltersState>) => {
    onChange({ ...value, ...patch });
  };

  const handleClear = () => {
    onChange({ ...DEFAULT_FILTERS });
    onClear?.();
  };

  const handleApply = () => {
    onApply?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-slate-700 bg-[#020617]/95 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Map filters</DialogTitle>
        </DialogHeader>

        <div className="mt-3 flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
          <p className="text-xs text-slate-500">
            Sports narrow both <span className="text-slate-400">games</span> and{" "}
            <span className="text-slate-400">venue pitches</span> (OSM tags). Radii control how far the map loads each
            layer.
          </p>

          <section className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-slate-400">Sports</Label>
            <PillsRow options={SPORT_OPTIONS} selected={value.sports} onChange={(sports) => update({ sports })} />
          </section>

          <section className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-slate-400">Games search radius</Label>
            <KmPillsRow value={value.gamesRadiusKm} onChange={(gamesRadiusKm) => update({ gamesRadiusKm })} />
          </section>

          <section className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-slate-400">Sports venues radius</Label>
            <KmPillsRow value={value.venueRadiusKm} onChange={(venueRadiusKm) => update({ venueRadiusKm })} />
          </section>

          <section className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-slate-400">Athletes on map radius</Label>
            <KmPillsRow value={value.athletesRadiusKm} onChange={(athletesRadiusKm) => update({ athletesRadiusKm })} />
          </section>
        </div>

        <DialogFooter className="mt-4 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-slate-600 text-slate-300"
            onClick={handleClear}
          >
            Clear
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-slate-600 text-slate-300"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={handleApply}>
              Apply
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
