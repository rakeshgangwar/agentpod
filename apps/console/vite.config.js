import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [sveltekit(), tailwindcss()],
  // Allow PUBLIC_* env vars (in addition to VITE_*) to be inlined at build time.
  // Required for import.meta.env.PUBLIC_HUB_URL used in src/lib/api/client.ts.
  envPrefix: ["VITE_", "PUBLIC_"],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  
  // Mark dev-only packages as external for SSR builds (they're dynamically imported only in dev mode)
  ssr: {
    external: ["tauri-plugin-mcp", "html2canvas"],
  },
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || "0.0.0.0",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
