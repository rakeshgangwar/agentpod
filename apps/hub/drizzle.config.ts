/// <reference types="bun-types" />
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/drizzle-migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://agentpod:agentpod-dev-password@localhost:5432/agentpod",
  },
  verbose: true,
  strict: true,
});
