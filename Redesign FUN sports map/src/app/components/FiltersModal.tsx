import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { cn } from "./ui/utils";
import { SPORT_OPTIONS } from "../../lib/sports";
const LEVEL_OPTIONS = ["Any", "Beginner", "Intermediate", "Advanced", "Competitive"] as const;
const DISTANCE_OPTIONS = ["1 km", "3 km", "5 km", "10 km", "25+ km"] as const;
const AGE_RANGE_OPTIONS = ["Any", "13–17", "18–24", "25–34", "35–44", "45+"] as const;
const AVAILABILITY_OPTIONS = ["Now", "Today", "This week"] as const;
const TIME_OF_DAY_OPTIONS = ["Morning", "Afternoon", "Evening", "Late night"] as const;
const GAME_TYPE_OPTIONS = ["Casual", "Training", "Competitive", "Tournament", "1‑on‑1"] as const;

export type FiltersState = {
  sports: string[];
  level: string;
  distance: string;
  ageRange: string;
  availability: string[];
  timeOfDay: string[];
  gameTypes: string[];
  school: string;
  onlyLookingNow: boolean;
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
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              active
                ? "bg-emerald-500/90 border-emerald-400 text-slate-950"
                : "bg-slate-800/60 border-slate-700 text-slate-300 hover:border-emerald-400/70 hover:text-white"
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function SinglePillsRow(props: {
  options: readonly string[];
  selected: string;
  onChange: (next: string) => void;
}) {
  const { options, selected, onChange } = props;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              active
                ? "bg-emerald-500/90 border-emerald-400 text-slate-950"
                : "bg-slate-800/60 border-slate-700 text-slate-300 hover:border-emerald-400/70 hover:text-white"
            )}
          >
            {opt}
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
    const cleared: FiltersState = {
      sports: [],
      level: "Any",
      distance: "5 km",
      ageRange: "Any",
      availability: [],
      timeOfDay: [],
      gameTypes: [],
      school: "",
      onlyLookingNow: false,
    };
    onChange(cleared);
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
          <DialogTitle className="text-base font-semibold">
            Filter players and games
          </DialogTitle>
        </DialogHeader>

        <div className="mt-3 flex flex-col gap-5 max-h-[70vh] overflow-y-auto pr-1">
          <section className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-slate-400">
              Sports
            </Label>
            <PillsRow
              options={SPORT_OPTIONS}
              selected={value.sports}
              onChange={(sports) => update({ sports })}
            />
          </section>

          <section className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-slate-400">
              Skill level
            </Label>
            <SinglePillsRow
              options={LEVEL_OPTIONS}
              selected={value.level}
              onChange={(level) => update({ level })}
            />
          </section>

          <section className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-slate-400">
              Distance
            </Label>
            <SinglePillsRow
              options={DISTANCE_OPTIONS}
              selected={value.distance}
              onChange={(distance) => update({ distance })}
            />
          </section>

          <section className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-slate-400">
              Age range
            </Label>
            <SinglePillsRow
              options={AGE_RANGE_OPTIONS}
              selected={value.ageRange}
              onChange={(ageRange) => update({ ageRange })}
            />
          </section>

          <section className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-slate-400">
              Availability
            </Label>
            <PillsRow
              options={AVAILABILITY_OPTIONS}
              selected={value.availability}
              onChange={(availability) => update({ availability })}
            />
          </section>

          <section className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-slate-400">
              Time of day
            </Label>
            <PillsRow
              options={TIME_OF_DAY_OPTIONS}
              selected={value.timeOfDay}
              onChange={(timeOfDay) => update({ timeOfDay })}
            />
          </section>

          <section className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-slate-400">
              Game type
            </Label>
            <PillsRow
              options={GAME_TYPE_OPTIONS}
              selected={value.gameTypes}
              onChange={(gameTypes) => update({ gameTypes })}
            />
          </section>

          <section className="space-y-2">
            <Label
              htmlFor="filters-school"
              className="text-xs uppercase tracking-wide text-slate-400"
            >
              School / organization
            </Label>
            <Input
              id="filters-school"
              placeholder="e.g. NYU, Local rec league"
              value={value.school}
              onChange={(e) => update({ school: e.target.value })}
              className="bg-slate-900/60 border-slate-700 text-sm"
            />
          </section>

          <section className="flex items-center justify-between pt-1">
            <div className="space-y-0.5">
              <Label className="text-xs uppercase tracking-wide text-slate-400">
                Only players looking now
              </Label>
              <p className="text-[11px] text-slate-500">
                Show players who recently opened the app or joined games.
              </p>
            </div>
            <button
              type="button"
              onClick={() => update({ onlyLookingNow: !value.onlyLookingNow })}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full border transition-colors",
                value.onlyLookingNow
                  ? "bg-emerald-500/90 border-emerald-400"
                  : "bg-slate-800 border-slate-600"
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                  value.onlyLookingNow ? "translate-x-5" : "translate-x-1"
                )}
              />
            </button>
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
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleApply}
            >
              Apply filters
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

