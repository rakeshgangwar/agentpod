import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/workflows/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
    alias: {
      "@cloudflare/sandbox/opencode": new URL("./src/__mocks__/cloudflare-sandbox-opencode.ts", import.meta.url).pathname,
      "@cloudflare/sandbox": new URL("./src/__mocks__/cloudflare-sandbox.ts", import.meta.url).pathname,
    },
  },
});
