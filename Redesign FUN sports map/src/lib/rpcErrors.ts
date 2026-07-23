/**
 * Shared RPC/auth error classification.
 *
 * Postgres permission failures include the function name in their message
 * ("permission denied for function get_notes_nearby"), which the old
 * name-substring "missing RPC" heuristics matched — so access regressions
 * rendered as silent empty UI or a misleading "run migration" toast.
 * Permission checks here run BEFORE any missing-function heuristics.
 */

export type RpcErrorLike = {
  message?: string;
  code?: string;
  hint?: string | null;
  status?: number;
} | null;

export type RpcErrorKind =
  | "permission-denied"
  | "missing-function"
  | "signature-mismatch"
  | "network"
  | "other";

export function classifyRpcError(err: RpcErrorLike): RpcErrorKind {
  if (!err) return "other";
  const m = (err.message ?? "").toLowerCase();
  const code = err.code ?? "";

  if (code === "42501" || code === "401" || code === "403" || err.status === 401 || err.status === 403) {
    return "permission-denied";
  }
  if (m.includes("permission denied") || m.includes("jwt expired")) {
    return "permission-denied";
  }

  if (m.includes("failed to fetch") || m.includes("fetch failed") || m.includes("load failed")) {
    return "network";
  }

  const looksMissing =
    code === "PGRST202" ||
    code === "42883" ||
    m.includes("could not find the function") ||
    m.includes("schema cache") ||
    m.includes("does not exist");
  if (looksMissing) {
    // PostgREST hints "Perhaps you meant to call the function …" when a
    // function with that name exists under different argument names.
    const hint = (err.hint ?? "").toLowerCase();
    if (hint.includes("perhaps you meant")) return "signature-mismatch";
    return "missing-function";
  }

  return "other";
}

export function isPermissionDenied(err: RpcErrorLike): boolean {
  return classifyRpcError(err) === "permission-denied";
}

/** True when the RPC is genuinely absent from the DB (pre-migration), not merely denied. */
export function isMissingRpc(err: RpcErrorLike): boolean {
  const kind = classifyRpcError(err);
  return kind === "missing-function" || kind === "signature-mismatch";
}

export function friendlyRpcError(err: RpcErrorLike, feature: string): string {
  switch (classifyRpcError(err)) {
    case "permission-denied":
      return `You don't have access to ${feature}. Try signing out and back in.`;
    case "missing-function":
    case "signature-mismatch":
      return `${feature} isn't available yet — the server is missing an update.`;
    case "network":
      return "Can't reach the server. Check your connection.";
    default:
      return err?.message || "Something went wrong.";
  }
}

/** Friendly copy for Supabase Auth error messages (login / signup / reset). */
export function mapAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email or password is incorrect.";
  if (m.includes("email not confirmed")) {
    return "Confirm your email first — check your inbox for the verification link.";
  }
  if (m.includes("user already registered")) {
    return "An account with this email already exists. Try signing in.";
  }
  if (m.includes("you can only request this after")) {
    return "Too many attempts — wait a minute, then try again.";
  }
  if (m.includes("failed to fetch") || m.includes("fetch failed") || m.includes("load failed")) {
    return "Can't reach the server. Check your connection.";
  }
  return message;
}
