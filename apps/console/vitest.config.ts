import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";

export default defineConfig({
  plugins: [svelte({ hot: false })],
  resolve: {
    conditions: ["browser"],
    alias: {
      $lib: path.resolve(__dirname, "./src/lib"),
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
