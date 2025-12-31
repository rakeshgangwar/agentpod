// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx";

export default defineConfig({
  site: "https://agentpod.dev",
  integrations: [mdx()],
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    format: "file",
  },
  compressHTML: true,
  output: "static",
});
