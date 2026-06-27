/**
 * connection.svelte.test.ts
 *
 * TDD tests for the web-based connection store (fetch + localStorage).
 * Run RED first (current Tauri implementation fails in jsdom), then implement.
 */

import { vi, test, expect, beforeEach } from "vitest";

// Mock auth.svelte to avoid its Tauri/better-auth transitive imports
vi.mock("./auth.svelte", () => ({
  setAuthApiUrl: vi.fn(),
}));

import { connect, disconnect, initConnection, connection } from "./connection.svelte";
import { setAuthApiUrl } from "./auth.svelte";

const LS_KEY = "agentpod.apiUrl";

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  // Reset connection state via disconnect so each test starts fresh
  await disconnect();
});

// ---------------------------------------------------------------------------
// connect() — success path
// ---------------------------------------------------------------------------

test("connect with ok:true → isConnected true, url stored in localStorage, setAuthApiUrl called", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

  const result = await connect("http://localhost:3001");

  expect(result).toBe(true);
  expect(connection.isConnected).toBe(true);
  expect(connection.apiUrl).toBe("http://localhost:3001");
  expect(localStorage.getItem(LS_KEY)).toBe("http://localhost:3001");
  expect(setAuthApiUrl).toHaveBeenCalledWith("http://localhost:3001");
});

test("connect strips trailing slash from apiUrl before probing /health", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);

  await connect("http://localhost:3001/");

  expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/health");
});

// ---------------------------------------------------------------------------
// connect() — failure paths
// ---------------------------------------------------------------------------

test("connect with ok:false → isConnected false, error set, localStorage not written", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

  const result = await connect("http://localhost:3001");

  expect(result).toBe(false);
  expect(connection.isConnected).toBe(false);
  expect(connection.error).toBeTruthy();
  expect(localStorage.getItem(LS_KEY)).toBeNull();
  expect(setAuthApiUrl).not.toHaveBeenCalled();
});

test("connect that throws → isConnected false, error set, localStorage not written", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

  const result = await connect("http://localhost:3001");

  expect(result).toBe(false);
  expect(connection.isConnected).toBe(false);
  expect(connection.error).toBe("network error");
  expect(localStorage.getItem(LS_KEY)).toBeNull();
});

// ---------------------------------------------------------------------------
// disconnect()
// ---------------------------------------------------------------------------

test("disconnect → clears localStorage and resets isConnected to false", async () => {
  // Establish a connection first
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  await connect("http://localhost:3001");
  expect(connection.isConnected).toBe(true);
  expect(localStorage.getItem(LS_KEY)).toBe("http://localhost:3001");

  await disconnect();

  expect(connection.isConnected).toBe(false);
  expect(connection.apiUrl).toBeNull();
  expect(localStorage.getItem(LS_KEY)).toBeNull();
});

// ---------------------------------------------------------------------------
// initConnection()
// ---------------------------------------------------------------------------

test("initConnection with url in localStorage and health ok → sets isConnected true", async () => {
  localStorage.setItem(LS_KEY, "http://localhost:3001");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

  await initConnection();

  expect(connection.isConnected).toBe(true);
  expect(connection.apiUrl).toBe("http://localhost:3001");
  expect(setAuthApiUrl).toHaveBeenCalledWith("http://localhost:3001");
});

test("initConnection with url in localStorage but health fails → stays disconnected, url kept in localStorage", async () => {
  localStorage.setItem(LS_KEY, "http://localhost:3001");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

  await initConnection();

  expect(connection.isConnected).toBe(false);
  // URL must be retained in localStorage so the connect screen can prefill it
  expect(localStorage.getItem(LS_KEY)).toBe("http://localhost:3001");
  expect(setAuthApiUrl).not.toHaveBeenCalled();
});

test("initConnection with no url in localStorage → stays disconnected, no fetch called", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  await initConnection();

  expect(connection.isConnected).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});
