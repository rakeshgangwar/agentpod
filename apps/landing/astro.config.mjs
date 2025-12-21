// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://agentpod.dev",
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    format: "file",
  },
  compressHTML: true,
  output: "static",
});
