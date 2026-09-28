/**
 * The visitor's country, from Vercel's edge IP lookup. Only a prefill for the sign-up
 * form's country field: the person confirms or changes it, and the server applies the
 * minimum age for whatever they choose.
 */
import { apiResponse } from "../server/lib/apiGuards";

export const config = { runtime: "edge" };

export default function handler(request: Request): Response {
  if (request.method !== "GET") {
    return apiResponse.error("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
  }
  const raw = (request.headers.get("x-vercel-ip-country") || "").trim().toUpperCase();
  const country = /^[A-Z]{2}$/.test(raw) ? raw : null;
  // Per-visitor: never cache at the edge or it would answer for the first caller's country.
  return apiResponse.success({ country }, { headers: { "Cache-Control": "private, no-store" } });
}
