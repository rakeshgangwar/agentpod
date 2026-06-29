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
  // tauri-plugin-mcp is a Tauri-only workspace plugin with no web entry; it is
  // dynamically imported in +layout.svelte ONLY under Tauri (gated on
  // __TAURI_INTERNALS__), so it never runs in the browser. Exclude it (and the
  // dev-only html2canvas) from the CLIENT build too — otherwise `vite build`
  // fails to resolve the package entry on a clean checkout (no Tauri build
  // artifacts present). The gated dynamic import is left unresolved and never
  // executes in a browser.
  optimizeDeps: {
    exclude: ["tauri-plugin-mcp", "html2canvas"],
  },
  build: {
    rollupOptions: {
      external: ["tauri-plugin-mcp", "html2canvas"],
    },
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
