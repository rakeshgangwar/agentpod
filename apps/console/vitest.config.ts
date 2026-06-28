import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * Strip <style> blocks from bits-ui Svelte components before vite-plugin-svelte
 * processes them.  bits-ui's select-viewport.svelte (and potentially others)
 * contain style blocks that call preprocessCSS internally, which fails in the
 * jsdom test environment under Vite 6 because PartialEnvironment is unavailable.
 * Tests never need CSS to function, so stripping these blocks is safe.
 */
function stripNodeModuleStyles(): Plugin {
  return {
    name: "strip-node-module-svelte-styles",
    enforce: "pre",
    transform(code: string, id: string) {
      if (id.includes("node_modules") && id.endsWith(".svelte")) {
        return {
          code: code.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ""),
          map: null,
        };
      }
    },
  };
}

export default defineConfig({
  plugins: [stripNodeModuleStyles(), svelte({ hot: false })],
  resolve: {
    conditions: ["browser"],
    alias: {
      $lib: path.resolve(__dirname, "./src/lib"),
      // SvelteKit runtime modules — resolved to stubs in the jsdom environment.
      // Individual test files can override via vi.mock("$app/...").
      "$app/state": path.resolve(__dirname, "./src/mocks/app-state.ts"),
      "$app/navigation": path.resolve(__dirname, "./src/mocks/app-navigation.ts"),
      "$app/environment": path.resolve(__dirname, "./src/mocks/app-environment.ts"),
      "$app/stores": path.resolve(__dirname, "./src/mocks/app-stores.ts"),
    },
  },
  test: {
    environment: "jsdom",
    // Disable vite CSS processing — Svelte <style> blocks (including those in
    // transitively imported components like code-block.svelte) trigger
    // preprocessCSS which fails in the jsdom environment with vite 6 +
    // vite-plugin-svelte. Tests don't need CSS to function.
    css: false,
  },
});
