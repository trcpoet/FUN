import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

/** Same order as `api/overpass.ts` — Vite's http-proxy often 504s on slow upstreams. */
const UPSTREAMS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
] as const;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function overpassDevProxy(): Plugin {
  return {
    name: "overpass-dev-proxy",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const path = req.url?.split("?")[0] ?? "";
          if (path !== "/api/overpass") {
            next();
            return;
          }
          if (req.method === "OPTIONS") {
            res.statusCode = 204;
            res.end();
            return;
          }
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end();
            return;
          }
          const body = await readBody(req);
          const controllers = UPSTREAMS.map(() => new AbortController());
          try {
            const text = await Promise.any(
              UPSTREAMS.map((url, i) =>
                fetch(url, {
                  method: "POST",
                  body,
                  headers: { "Content-Type": "text/plain" },
                  signal: controllers[i].signal,
                }).then(async (r) => {
                  if (r.status === 429 || !r.ok) {
                    throw new Error(`upstream ${r.status}`);
                  }
                  const t = await r.text();
                  controllers.forEach((c, j) => {
                    if (j !== i) c.abort();
                  });
                  return t;
                })
              )
            );
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.statusCode = 200;
            res.end(text);
            return;
          } catch {
            /* fall through */
          }
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.statusCode = 200;
          res.end(JSON.stringify({ elements: [] }));
        }
      );
    },
  };
}
