import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // VITE_API_PROXY_TARGET points the dev server at the local Functions host.
  // Override it in web/.env.local; defaults to the Azure Functions default port.
  const env = loadEnv(mode, process.cwd())
  const apiProxyTarget = env.VITE_API_PROXY_TARGET ?? "http://localhost:7071"

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      // The app calls a relative "/api" base (see src/lib/config.ts); in dev we
      // proxy that to the Functions host so there's no CORS and no separate URL.
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
