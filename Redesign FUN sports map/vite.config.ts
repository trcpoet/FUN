import { defineConfig, loadEnv, type Plugin } from 'vite'
import path from 'path'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { overpassDevProxy } from './vite-plugin-overpass-dev'

// Vite restarts the dev server when these files emit a watcher "change" event.
const CONFIG_FILES = [
  path.resolve(__dirname, 'vite.config.ts'),
  path.resolve(__dirname, 'vite-plugin-overpass-dev.ts'),
]

function configDigest(): string {
  const h = createHash('sha256')
  for (const f of CONFIG_FILES) {
    try { h.update(readFileSync(f)) } catch { /* ignore: vite will surface missing-config errors itself */ }
  }
  return h.digest('hex')
}

// This repo lives in ~/Desktop, which is under iCloud Desktop & Documents sync.
// fileproviderd rewrites xattrs/metadata on files WITHOUT changing content; chokidar
// reports that as "change", so vite logs "vite.config.ts changed, restarting server..."
// in an endless loop. Each restart kills dependency optimization mid-flight, every
// module request 504s, and the app hangs on "Loading FUN…" forever.
// Gate restarts on the config content actually changing. Tradeoff: the terminal "r"
// shortcut is gated too — kill and rerun `npm run dev` to force a manual restart.
function phantomRestartGuard(): Plugin {
  let lastDigest = configDigest()
  return {
    name: 'fun-phantom-restart-guard',
    configureServer(server) {
      const realRestart = server.restart.bind(server)
      server.restart = async (forceOptimize?: boolean) => {
        const now = configDigest()
        if (now === lastDigest) {
          server.config.logger.info('[fun] ignored phantom config-change restart (content unchanged — likely iCloud/fileprovider event)')
          return
        }
        lastDigest = now
        return realRestart(forceOptimize)
      }
    },
  }
}

function supabasePreconnect(env: Record<string, string>): Plugin {
  return {
    name: 'fun-supabase-preconnect',
    transformIndexHtml(html) {
      const raw = env.VITE_SUPABASE_URL?.trim()
      if (!raw) return html
      try {
        const origin = new URL(raw).origin
        const tags = `<link rel="preconnect" href="${origin}" crossorigin />\n    <link rel="dns-prefetch" href="${origin}" />`
        return html.replace('</head>', `    ${tags}\n  </head>`)
      } catch {
        return html
      }
    },
  }
}

// FCP fix: Vite emits the app + mapbox stylesheets as render-blocking
// `<link rel="stylesheet">` in <head>. The browser refuses to paint ANYTHING —
// including our fully inline-styled #root orbit loader — until those sheets
// download + parse, which was the dominant cost in a 2.49s P75 desktop FCP.
// The loader needs none of that CSS, so load every build stylesheet
// non-blocking (media="print" → swap to "all" on load) with a <noscript>
// fallback for no-JS clients. First paint then lands at ~TTFB; the real UI's
// CSS (downloaded in parallel) is applied well before React renders past the
// loader. Build-only — dev serves CSS via the JS graph, no <link> tags exist.
function asyncCriticalCss(): Plugin {
  return {
    name: 'fun-async-critical-css',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*>/g, (tag) => {
        if (/\bmedia=/.test(tag)) return tag // respect any explicit media query
        const asyncTag = tag.replace(
          /\s*\/?>$/,
          ` media="print" onload="this.onload=null;this.media='all'">`,
        )
        return `${asyncTag}<noscript>${tag}</noscript>`
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  return {
  plugins: [
    phantomRestartGuard(),
    supabasePreconnect(env),
    // Dev-only: same behavior as `api/overpass.ts` (multi-mirror). Vite `server.proxy` often 504s on slow Overpass.
    overpassDevProxy(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
    asyncCriticalCss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  optimizeDeps: {
    // Pre-bundle ALL runtime deps at server start. Anything discovered lazily after
    // startup triggers a mid-session re-optimize + full page reload, which is the
    // source of the "stuck on Loading FUN…" dev hangs.
    include: [
      'react',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom',
      'react-dom/client',
      'react-router',
      '@supabase/supabase-js',
      // mapbox-gl MUST be prebundled and must never go in `exclude`: the package is
      // "type": "module" but its `main` is a UMD file with no ESM exports. Excluded,
      // dev serves that file raw and `import mapboxgl from "mapbox-gl"` fails to link
      // (=> "accessToken on undefined" / "Map export missing" / black map). esbuild's
      // CJS interop produces a correct default export (~4s, no hang on this machine).
      'mapbox-gl',
      '@radix-ui/react-accordion',
      '@radix-ui/react-avatar',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-dialog',
      '@radix-ui/react-label',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-slider',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      'class-variance-authority',
      'clsx',
      'date-fns',
      'embla-carousel-react',
      'lucide-react',
      'motion/react',
      'ogl',
      'react-day-picker',
      'react-easy-crop',
      'tailwind-merge',
    ],
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Rollup's CommonJS interop shims (getDefaultExportFromCjs, etc.) live in
          // a single virtual `\0commonjsHelpers.js` module shared by nearly every
          // CJS dependency (sonner, etc.). Left unassigned, Rollup parked it INSIDE
          // the 1.7MB mapbox chunk — so the eagerly-loaded entry statically imported
          // mapbox just to grab a ~30-byte helper, forcing all of mapbox-gl to
          // download on every route before React could mount. Pin the helpers to a
          // tiny standalone chunk so mapbox-gl stays purely lazy (loaded only when
          // the map mounts). No-op if the id ever stops matching.
          if (id.includes("commonjsHelpers")) return "cjs-helpers";
          if (id.includes("node_modules/mapbox-gl")) return "mapbox";
          if (id.includes("node_modules/three")) return "three";
        },
      },
    },
  },

  server: {
    host: true,
    watch: {
      // .env: tooling touches it while the server runs.
      // dist/node_modules/.git: mass writes there (npm run build, re-optimize)
      // overflow macOS fsevents and make chokidar emit phantom "vite.config.ts
      // changed" events → endless restart loop + 504 transforms ("Loading FUN…"
      // forever). Never run `npm run build` against this tree while reproducing
      // dev issues without these ignores.
      ignored: ['**/.env', '**/.env.*', '**/dist/**', '**/node_modules/**', '**/.git/**'],
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})
