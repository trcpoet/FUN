/**
 * Render scripts/og-card.html to public/og-card.png at exactly 1200x630.
 *
 * Needs a Chrome listening on --remote-debugging-port=9333; the script starts
 * one if it has to. Run it after any change to the card or the brand tokens:
 *
 *   node scripts/render-og-card.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CARD = resolve(HERE, "og-card.html");
const OUT = resolve(HERE, "..", "public", "og-card.png");
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

async function chromeTargets() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    return await res.json();
  } catch {
    return null;
  }
}

let targets = await chromeTargets();
if (!targets) {
  const bin = CHROME_CANDIDATES.find(existsSync);
  if (!bin) {
    console.error("No Chrome found. Install Chrome or start one with --remote-debugging-port=9333.");
    process.exit(1);
  }
  spawn(bin, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--no-first-run",
    "--user-data-dir=/tmp/fun-og-card",
    "about:blank",
  ], { detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 40 && !targets; i++) {
    await sleep(250);
    targets = await chromeTargets();
  }
  if (!targets) { console.error("Chrome did not come up."); process.exit(1); }
}

let nextId = 1;
function send(ws, method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => {
    const on = (e) => {
      const m = JSON.parse(e.data);
      if (m.id !== id) return;
      ws.removeEventListener("message", on);
      m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result);
    };
    ws.addEventListener("message", on);
    setTimeout(() => rej(new Error(`${method} timed out`)), 45000);
  });
}

const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
await send(ws, "Page.enable");
await send(ws, "Runtime.enable");
// deviceScaleFactor 1: og:image wants 1200x630 actual pixels, not a 2x asset.
await send(ws, "Emulation.setDeviceMetricsOverride", {
  width: 1200, height: 630, deviceScaleFactor: 1, mobile: false,
});
await send(ws, "Page.navigate", { url: `file://${CARD}` });

// `font-display: block` means the text is invisible until the faces land; wait
// for them rather than screenshotting a blank card.
for (let i = 0; i < 60; i++) {
  await sleep(250);
  const { result } = await send(ws, "Runtime.evaluate", {
    expression: "document.fonts.status === 'loaded' && document.fonts.size >= 3",
    returnByValue: true,
  });
  if (result.value) break;
}
await sleep(400);

const { data } = await send(ws, "Page.captureScreenshot", {
  format: "png",
  clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 },
});
writeFileSync(OUT, Buffer.from(data, "base64"));
console.log(`wrote ${OUT}`);
ws.close();
process.exit(0);
