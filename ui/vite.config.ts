import type { Plugin } from "vite"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"

// The launcher (scripts/dev.py) passes the real ports; plain `npm run dev` uses the project defaults.
const apiPort = Number(process.env.LAB_API_PORT ?? 8792)
const uiPort = Number(process.env.LAB_UI_PORT ?? 5173)
const apiOrigin = `http://127.0.0.1:${apiPort}`
const localHosts = new Set([`127.0.0.1:${uiPort}`, `localhost:${uiPort}`])

/**
 * Keeps serve.py's local-only checks meaningful in development. The proxy rewrites Host and Origin to the API's own
 * origin (serve.py accepts only 127.0.0.1/localhost on its port), so this guard first refuses anything that is not a
 * same-origin request from this dev server's own page: foreign Host, foreign Origin, or cross-site fetch metadata.
 */
function localApiGuard(): Plugin {
  return {
    name: "lab-local-api-guard",
    configureServer(server) {
      server.middlewares.use("/api", (req, res, next) => {
        const host = req.headers.host ?? ""
        const origin = req.headers.origin
        const site = req.headers["sec-fetch-site"]
        let originHost = ""
        try { originHost = origin ? new URL(origin).host : "" } catch { originHost = "invalid" }
        const bad = !localHosts.has(host) || (origin !== undefined && !localHosts.has(originHost)) || site === "cross-site" || site === "same-site"
        if (bad) {
          res.statusCode = 403
          res.setHeader("Content-Type", "application/json")
          res.end(JSON.stringify({ error: "Local origin required." }))
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localApiGuard()],
  resolve: { alias: { "@lab": path.resolve(import.meta.dirname, "src/lab"), "@": path.resolve(import.meta.dirname, "src") } },
  server: {
    host: "127.0.0.1",
    port: uiPort,
    strictPort: true,
    fs: { allow: [path.resolve(import.meta.dirname, "..")] }, // presets.json lives at the repository root
    proxy: {
      "/api": {
        target: apiOrigin,
        changeOrigin: true, // Host -> 127.0.0.1:<api port>
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            if (proxyReq.getHeader("origin")) proxyReq.setHeader("origin", apiOrigin)
          })
        },
      },
    },
  },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true, proxy: { "/api": { target: apiOrigin, changeOrigin: true } } },
  build: { assetsInlineLimit: 0, outDir: "dist", emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 700, target: "es2022" },
  test: { environment: "node", include: ["src/**/*.test.{ts,tsx}", "../tests/ui/**/*.test.{ts,tsx}"], globals: false },
})
