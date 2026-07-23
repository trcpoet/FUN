import { describe, it, expect } from "vitest";
import { classifyRpcError, isPermissionDenied, friendlyRpcError, mapAuthError } from "./rpcErrors";

describe("classifyRpcError", () => {
  it("classifies Postgres 42501 as permission-denied even when the message names the function", () => {
    // The old substring heuristics matched "get_notes_nearby" inside this
    // message and misread access regressions as "RPC not deployed".
    expect(
      classifyRpcError({ code: "42501", message: "permission denied for function get_notes_nearby" })
    ).toBe("permission-denied");
  });

  it("classifies permission denied for every previously-shadowed function name", () => {
    for (const fn of [
      "get_notes_nearby",
      "get_unified_feed",
      "get_live_nearby",
      "create_map_note",
      "can_dm",
      "get_or_create_dm_thread",
      "get_my_dm_inbox",
    ]) {
      expect(classifyRpcError({ code: "42501", message: `permission denied for function ${fn}` })).toBe(
        "permission-denied"
      );
    }
  });

  it("classifies permission-denied from message text when code is absent", () => {
    expect(classifyRpcError({ message: "permission denied for table map_notes" })).toBe("permission-denied");
  });

  it("classifies HTTP 401/403-shaped errors as permission-denied", () => {
    expect(classifyRpcError({ message: "JWT expired", code: "401" })).toBe("permission-denied");
    expect(classifyRpcError({ message: "Forbidden", code: "403" })).toBe("permission-denied");
  });

  it("classifies PGRST202 without a same-function hint as missing-function", () => {
    expect(
      classifyRpcError({
        code: "PGRST202",
        message: "Could not find the function public.get_notes_nearby(p_lat, p_lng) in the schema cache",
      })
    ).toBe("missing-function");
  });

  it("classifies PGRST202 with a 'Perhaps you meant' hint as signature-mismatch", () => {
    expect(
      classifyRpcError({
        code: "PGRST202",
        message:
          "Could not find the function public.get_games_nearby(p_lat, p_lng, p_radius_km) in the schema cache",
        hint: "Perhaps you meant to call the function public.get_games_nearby(lat, lng, radius_km)",
      })
    ).toBe("signature-mismatch");
  });

  it("classifies schema-cache staleness as missing-function", () => {
    expect(classifyRpcError({ message: "Searched the schema cache, no function matched" })).toBe(
      "missing-function"
    );
  });

  it("classifies 'does not exist' Postgres errors as missing-function", () => {
    expect(classifyRpcError({ code: "42883", message: "function public.can_dm(uuid) does not exist" })).toBe(
      "missing-function"
    );
  });

  it("classifies fetch failures as network", () => {
    expect(classifyRpcError({ message: "TypeError: Failed to fetch" })).toBe("network");
    expect(classifyRpcError({ message: "fetch failed" })).toBe("network");
    expect(classifyRpcError({ message: "Load failed" })).toBe("network");
  });

  it("classifies null and unknown errors as other", () => {
    expect(classifyRpcError(null)).toBe("other");
    expect(classifyRpcError({ message: "duplicate key value violates unique constraint" })).toBe("other");
  });

  it("checks permission-denied BEFORE missing-function when both could match", () => {
    // A 42501 whose message mentions "schema cache" text must still be permission-denied.
    expect(
      classifyRpcError({ code: "42501", message: "permission denied (cached in schema cache)" })
    ).toBe("permission-denied");
  });
});

describe("isPermissionDenied", () => {
  it("mirrors the classifier", () => {
    expect(isPermissionDenied({ code: "42501", message: "permission denied for function x" })).toBe(true);
    expect(isPermissionDenied({ code: "PGRST202", message: "Could not find the function" })).toBe(false);
    expect(isPermissionDenied(null)).toBe(false);
  });
});

describe("friendlyRpcError", () => {
  it("produces an access message for permission-denied", () => {
    const msg = friendlyRpcError({ code: "42501", message: "permission denied for function x" }, "Map Notes");
    expect(msg).toContain("Map Notes");
    expect(msg.toLowerCase()).toContain("access");
    expect(msg).not.toContain("migration");
  });

  it("reserves the migration message for missing-function", () => {
    const msg = friendlyRpcError(
      { code: "PGRST202", message: "Could not find the function public.create_map_note" },
      "Map Notes"
    );
    expect(msg.toLowerCase()).toContain("isn't available");
  });

  it("produces a connectivity message for network errors", () => {
    const msg = friendlyRpcError({ message: "Failed to fetch" }, "Feed");
    expect(msg.toLowerCase()).toContain("connection");
  });

  it("falls back to the raw message for other errors", () => {
    const msg = friendlyRpcError({ message: "value too long for type character varying(80)" }, "Feed");
    expect(msg).toContain("value too long");
  });
});

describe("mapAuthError", () => {
  it("maps invalid credentials", () => {
    expect(mapAuthError("Invalid login credentials")).toBe("Email or password is incorrect.");
  });
  it("maps unconfirmed email", () => {
    expect(mapAuthError("Email not confirmed")).toBe(
      "Confirm your email first — check your inbox for the verification link."
    );
  });
  it("maps rate limiting", () => {
    expect(mapAuthError("For security purposes, you can only request this after 60 seconds.")).toContain(
      "Too many attempts"
    );
  });
  it("maps network failures", () => {
    expect(mapAuthError("TypeError: Failed to fetch")).toBe("Can't reach the server. Check your connection.");
  });
  it("maps existing account", () => {
    expect(mapAuthError("User already registered")).toBe("An account with this email already exists. Try signing in.");
  });
  it("passes through unknown messages", () => {
    expect(mapAuthError("Some brand new error")).toBe("Some brand new error");
  });
});
