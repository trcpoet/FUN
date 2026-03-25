export type LocationVisibilityMode = "ghost" | "close_friends" | "public";

const STORAGE_KEY = "fun_location_visibility_v1";

export function readLocationVisibility(): LocationVisibilityMode {
  if (typeof localStorage === "undefined") return "ghost";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "ghost" || raw === "close_friends" || raw === "public") return raw;
    return "ghost";
  } catch {
    return "ghost";
  }
}

export function writeLocationVisibility(mode: LocationVisibilityMode) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

