/**
 * Unit tests for config.ts — origin allowlist.
 * No DB connection required — pure functions only.
 */
import { describe, it, expect } from "bun:test";
import { allowedOrigins, isAllowedOrigin } from "./config";

describe("allowedOrigins (single canonical list)", () => {
  it("contains expected default origins", () => {
    expect(allowedOrigins).toContain("http://localhost:5173");
    expect(allowedOrigins).toContain("https://console.agentpod.dev");
    expect(allowedOrigins).toContain("https://app.agentpod.dev");
  });

  it("is a plain array (not readonly tuple)", () => {
    expect(Array.isArray(allowedOrigins)).toBe(true);
  });
});

describe("isAllowedOrigin", () => {
  it("returns true for origins in the allowedOrigins list", () => {
    expect(isAllowedOrigin("https://console.agentpod.dev")).toBe(true);
    expect(isAllowedOrigin("https://app.agentpod.dev")).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173")).toBe(true);
  });

  it("returns false for origins not in the list", () => {
    expect(isAllowedOrigin("https://malicious.com")).toBe(false);
    expect(isAllowedOrigin("http://localhost:9999")).toBe(false);
    expect(isAllowedOrigin("http://localhost:1420")).toBe(false); // removed in P2c (no Tauri); localhost is not a LAN IP
  });

  it("returns true for missing/empty origin (server-to-server, no CSWSH risk)", () => {
    expect(isAllowedOrigin(null)).toBe(true);
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin("")).toBe(true);
  });

  it("returns true for local LAN IP origins (192.168/10.x, any port — dev)", () => {
    expect(isAllowedOrigin("http://192.168.1.50:5173")).toBe(true);
    expect(isAllowedOrigin("http://10.0.1.2:1420")).toBe(true);
  });
});
