import React, { useState, KeyboardEvent } from "react";
import { X } from "lucide-react";
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
import { Slider } from "./ui/slider";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export type FiltersState = {
  /** Filter map pins to these sports (empty = all). Also filters OSM venues by pitch sport tags. */
  sports: string[];
  gamesRadiusKm: number;
  venueRadiusKm: number;
  athletesRadiusKm: number;
  skillLevel?: string;
  ageRange?: string;
};

export const DEFAULT_FILTERS: FiltersState = {
  sports: [],
  gamesRadiusKm: 15,
  venueRadiusKm: 15,
  athletesRadiusKm: 10,
  skillLevel: "Any",
  ageRange: "Any",
};

type FiltersModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: FiltersState;
  onChange: (next: FiltersState) => void;
  onApply?: () => void;
  onClear?: () => void;
};

function RadiusSliderRow(props: {
  value: number;
  onChange: (km: number) => void;
  label: string;
}) {
  const { value, onChange, label } = props;
  return (
    <section className="space-y-3 pb-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
        <span className="text-sm font-medium tabular-nums text-foreground/90">{value} km</span>
      </div>
      <Slider
        min={1}
        max={25}
        step={1}
        value={[value]}
        onValueChange={([val]) => onChange(val)}
        className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4 cursor-pointer"
      />
    </section>
  );
}

function SportsFilterRow(props: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { selected, onChange } = props;
  const [inputValue, setInputValue] = useState("");

  const handleAdd = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    if (!selected.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      onChange([...selected, trimmed]);
    }
    setInputValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd(inputValue);
    }
  };

  const handleRemove = (val: string) => {
    onChange(selected.filter((s) => s !== val));
  };

  const unselectedPopular = SPORT_OPTIONS.filter(
    (o) => !selected.some((s) => s.toLowerCase() === o.toLowerCase())
  ).slice(0, 10);

  return (
    <section className="space-y-3">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Sports</Label>
      <div className="flex gap-2">
        <Input
          placeholder="Search or type custom sport..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-9 text-sm"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-9"
          onClick={() => handleAdd(inputValue)}
        >
          Add
        </Button>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selected.map((s) => (
            <Badge key={s} variant="default" className="text-xs py-0.5 px-2.5 flex items-center gap-1 shadow-sm font-medium">
              {s}
              <X
                className="w-3 h-3 cursor-pointer hover:text-white/80 transition-colors"
                onClick={() => handleRemove(s)}
              />
            </Badge>
          ))}
        </div>
      )}

      {unselectedPopular.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Suggestions</p>
          <div className="flex flex-wrap gap-1.5">
            {unselectedPopular.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => handleAdd(opt)}
                className="rounded-full border border-border/60 bg-card/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                + {opt}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function FiltersModal(props: FiltersModalProps) {
  const { open, onOpenChange, value = DEFAULT_FILTERS, onChange, onApply, onClear } = props;

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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Map filters</DialogTitle>
        </DialogHeader>

        <div className="mt-3 flex max-h-[75vh] flex-col gap-6 overflow-y-auto pr-2 pb-2">
          <p className="text-xs text-muted-foreground">
            Sports narrow both <span className="text-foreground/80">games</span> and{" "}
            <span className="text-foreground/80">venue pitches</span> (OSM tags). Radii control how far the map loads each
            layer.
          </p>

          <SportsFilterRow selected={value.sports} onChange={(sports) => update({ sports })} />

          <div className="space-y-5 pt-3 border-t border-border/40">
            <RadiusSliderRow
              label="Games search radius"
              value={value.gamesRadiusKm}
              onChange={(gamesRadiusKm) => update({ gamesRadiusKm })}
            />

            <RadiusSliderRow
              label="Sports venues radius"
              value={value.venueRadiusKm}
              onChange={(venueRadiusKm) => update({ venueRadiusKm })}
            />

            <RadiusSliderRow
              label="Athletes on map radius"
              value={value.athletesRadiusKm}
              onChange={(athletesRadiusKm) => update({ athletesRadiusKm })}
            />
          </div>

          <Accordion type="single" collapsible className="w-full mt-2">
            <AccordionItem value="advanced" className="border-border/50">
              <AccordionTrigger className="py-3 text-[11px] uppercase tracking-wide text-muted-foreground hover:no-underline hover:text-foreground transition-colors">
                Advanced Preferences
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4 pb-4 px-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Skill Level</Label>
                    <Select value={value.skillLevel || "Any"} onValueChange={(v) => update({ skillLevel: v })}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Any">Any</SelectItem>
                        <SelectItem value="Beginner">Beginner</SelectItem>
                        <SelectItem value="Intermediate">Intermediate</SelectItem>
                        <SelectItem value="Advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Age Range</Label>
                    <Select value={value.ageRange || "Any"} onValueChange={(v) => update({ ageRange: v })}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Any">Any</SelectItem>
                        <SelectItem value="18-25">18 - 25</SelectItem>
                        <SelectItem value="26-35">26 - 35</SelectItem>
                        <SelectItem value="36-45">36 - 45</SelectItem>
                        <SelectItem value="46+">46+</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <DialogFooter className="mt-4 flex items-center justify-between gap-3 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={handleClear}>
            Clear
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleApply}>
              Apply
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
