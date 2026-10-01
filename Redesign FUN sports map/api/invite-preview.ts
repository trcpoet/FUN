/**
 * Crawler-facing HTML for a game share link (`/g/<token>`).
 *
 * Every FUN URL currently unfurls as the same static card, because `/g/<token>`
 * is a react-router route: a crawler gets the SPA shell and the generic
 * "FUN — find a game tonight" tags. An invite that says what the game actually
 * is does more for the share path than anything else we could build.
 *
 * This is not cloaking. It returns the real `index.html` with a handful of meta
 * tags rewritten, so a person and a crawler receive the same document — the SPA
 * boots as usual and react-router handles `/g/<token>` from there.
 *
 * It reads with the **anon** key deliberately, not the service role. The RPC is
 * granted to anon and projects only guest-safe columns, so this endpoint is
 * structurally incapable of leaking more than a signed-out visitor already
 * sees. A service-role key would work here and would quietly remove that
 * guarantee.
 *
 * The decisions about *what* a preview may say, and the HTML rewriting, live in
 * `server/lib/invitePreview.ts` where they are unit-tested.
 *
 * Routing: `vercel.json` rewrites `/g/:token` here, and that entry MUST stay
 * above the SPA catch-all or the catch-all swallows it and crawlers get the
 * generic card again. The rewrite carries no comment because Vercel validates
 * vercel.json strictly — an extra key such as `"//"` fails the build, and a
 * failed build leaves the previous deployment serving, which looks exactly like
 * the rewrite silently not working.
 */
import {
  applyPreview,
  INVITE_TOKEN_RE,
  setNoIndex,
  type InvitePreview,
} from "../server/lib/invitePreview";

export const config = { runtime: "edge" };

/** Short: "3 spots left" goes stale as people join. */
const CACHE = "public, s-maxage=30, stale-while-revalidate=120";

function html(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": CACHE },
  });
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = (url.searchParams.get("token") || "").trim();

  // The shell we serve either way. An unknown token still gets the real app,
  // which shows its own "invalid or expired" screen — better than a 404, and it
  // means a lookup failure degrades to today's behaviour rather than an error.
  const raw = await fetch(new URL("/index.html", url.origin).toString()).then((r) => r.text());
  // Every /g/ URL stays out of the index, including the fallbacks — an unknown
  // token is still a private link someone shared.
  const shell = setNoIndex(raw);

  if (!INVITE_TOKEN_RE.test(token)) return html(shell);

  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const anon = (
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ""
  ).trim();
  if (!base || !anon) {
    console.error("[invite-preview] missing SUPABASE_URL / anon key");
    return html(shell);
  }

  let preview: InvitePreview | null = null;
  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/rest/v1/rpc/get_invite_preview`, {
      method: "POST",
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_token: token }),
    });
    if (res.ok) {
      const rows = (await res.json()) as InvitePreview[];
      preview = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    } else {
      console.error("[invite-preview] rpc", res.status);
    }
  } catch (e) {
    console.error("[invite-preview] lookup failed", e);
  }

  if (!preview) return html(shell);

  return html(applyPreview(shell, preview, `${url.origin}/g/${encodeURIComponent(token)}`));
}
