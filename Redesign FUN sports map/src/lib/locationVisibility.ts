export type LocationVisibilityMode = "ghost" | "close_friends" | "public";

const STORAGE_KEY = "fun_location_visibility_v1";

export function readLocationVisibility(): LocationVisibilityMode {
  if (typeof localStorage === "undefined") return "public";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "ghost" || raw === "close_friends" || raw === "public") return raw;
    return "public";
  } catch {
    return "public";
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

