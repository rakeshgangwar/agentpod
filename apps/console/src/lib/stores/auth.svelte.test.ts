/**
 * auth.svelte.test.ts
 *
 * TDD tests for the web-based auth store (Better Auth cookie session, no Tauri).
 * Run RED first (current Tauri implementation calls authGetStatus which is mocked
 * away here, causing initAuth to fail/warn), then implement → GREEN.
 */

import { vi, test, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mock objects so they are available inside vi.mock factory closures
// ---------------------------------------------------------------------------

const { mockAuthClient } = vi.hoisted(() => ({
  mockAuthClient: {
    getSession: vi.fn(),
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
  },
}));

// Mock better-auth/svelte so createAuthClient returns our mockAuthClient
vi.mock("better-auth/svelte", () => ({
  createAuthClient: vi.fn(() => mockAuthClient),
}));

// Mock the Tauri api — none of these should be called after the refactor
vi.mock("$lib/api/tauri", () => ({
  authStoreSession: vi.fn().mockResolvedValue(undefined),
  authLogout: vi.fn().mockResolvedValue(undefined),
  authGetStatus: vi.fn().mockResolvedValue({ authenticated: false, user: null }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Import a fresh copy of the auth store (resets all module-level $state). */
async function freshAuthStore() {
  vi.resetModules();
  // Re-apply mocks after reset so dynamic import picks them up
  vi.mock("better-auth/svelte", () => ({
    createAuthClient: vi.fn(() => mockAuthClient),
  }));
  vi.mock("$lib/api/tauri", () => ({
    authStoreSession: vi.fn().mockResolvedValue(undefined),
    authLogout: vi.fn().mockResolvedValue(undefined),
    authGetStatus: vi.fn().mockResolvedValue({ authenticated: false, user: null }),
  }));
  return import("./auth.svelte");
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Reset all mock call history and return values
  mockAuthClient.getSession.mockReset();
  mockAuthClient.signIn.email.mockReset();
  mockAuthClient.signUp.email.mockReset();
  mockAuthClient.signOut.mockReset();
});

// ---------------------------------------------------------------------------
// initAuth — no client configured yet → no-op (graceful), isInitialized stays false
// ---------------------------------------------------------------------------

test("initAuth with no API URL configured → no-op, stays unauthenticated, isInitialized=false", async () => {
  const { initAuth, auth } = await freshAuthStore();

  // Don't call setAuthApiUrl — client is not configured
  await initAuth();

  expect(auth.isAuthenticated).toBe(false);
  // isInitialized must remain false so a later call (after setAuthApiUrl) can proceed
  expect(auth.isInitialized).toBe(false);
  // getSession should NOT be called when there is no client
  expect(mockAuthClient.getSession).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// initAuth — re-callable: second call AFTER setAuthApiUrl restores session
// ---------------------------------------------------------------------------

test("initAuth called before client ready, then again after setAuthApiUrl → session restored", async () => {
  mockAuthClient.getSession.mockResolvedValue({
    data: {
      user: {
        id: "user-retry",
        email: "retry@example.com",
        name: "Retry User",
        image: null,
      },
      session: {},
    },
  });

  const { setAuthApiUrl, initAuth, auth } = await freshAuthStore();

  // First call with no client — should be a no-op, isInitialized stays false
  await initAuth();
  expect(auth.isInitialized).toBe(false);
  expect(auth.isAuthenticated).toBe(false);
  expect(mockAuthClient.getSession).not.toHaveBeenCalled();

  // Now the connection is established — configure the client and call again
  setAuthApiUrl("http://localhost:3001");
  await initAuth();

  // Second call should have restored the session
  expect(mockAuthClient.getSession).toHaveBeenCalledOnce();
  expect(auth.isAuthenticated).toBe(true);
  expect(auth.user?.id).toBe("user-retry");
  expect(auth.isInitialized).toBe(true);
});

// ---------------------------------------------------------------------------
// initAuth — with client configured, session exists
// ---------------------------------------------------------------------------

test("initAuth with configured client and active session → isAuthenticated true", async () => {
  mockAuthClient.getSession.mockResolvedValue({
    data: {
      user: {
        id: "user-abc",
        email: "alice@example.com",
        name: "Alice",
        image: null,
      },
      session: {},
    },
  });

  const { setAuthApiUrl, initAuth, auth } = await freshAuthStore();
  setAuthApiUrl("http://localhost:3001");

  await initAuth();

  expect(mockAuthClient.getSession).toHaveBeenCalledOnce();
  expect(auth.isAuthenticated).toBe(true);
  expect(auth.user?.id).toBe("user-abc");
  expect(auth.user?.email).toBe("alice@example.com");
  expect(auth.isInitialized).toBe(true);
});

// ---------------------------------------------------------------------------
// initAuth — with client configured, no session
// ---------------------------------------------------------------------------

test("initAuth with configured client but no session → stays unauthenticated", async () => {
  mockAuthClient.getSession.mockResolvedValue({ data: null });

  const { setAuthApiUrl, initAuth, auth } = await freshAuthStore();
  setAuthApiUrl("http://localhost:3001");

  await initAuth();

  expect(auth.isAuthenticated).toBe(false);
  expect(auth.isInitialized).toBe(true);
});

// ---------------------------------------------------------------------------
// initAuth — idempotent (second call is a no-op)
// ---------------------------------------------------------------------------

test("initAuth called twice → getSession called only once", async () => {
  mockAuthClient.getSession.mockResolvedValue({ data: null });

  const { setAuthApiUrl, initAuth } = await freshAuthStore();
  setAuthApiUrl("http://localhost:3001");

  await initAuth();
  await initAuth();

  expect(mockAuthClient.getSession).toHaveBeenCalledOnce();
});

// ---------------------------------------------------------------------------
// loginWithEmail — success, NO Tauri authStoreSession
// ---------------------------------------------------------------------------

test("loginWithEmail success → isAuthenticated true, authStoreSession NOT called", async () => {
  mockAuthClient.signIn.email.mockResolvedValue({
    data: {
      user: {
        id: "user-xyz",
        email: "bob@example.com",
        name: "Bob",
        image: null,
      },
      token: "tok-abc",
    },
    error: null,
  });

  const { setAuthApiUrl, loginWithEmail, auth } = await freshAuthStore();
  setAuthApiUrl("http://localhost:3001");

  // Import tauri mock to assert it was NOT called
  const tauri = await import("$lib/api/tauri");
  const result = await loginWithEmail("bob@example.com", "secret");

  expect(result).toBe(true);
  expect(auth.isAuthenticated).toBe(true);
  expect(auth.user?.email).toBe("bob@example.com");
  // The cookie is the session — Tauri storage must NOT be called
  expect(tauri.authStoreSession).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// loginWithEmail — failure
// ---------------------------------------------------------------------------

test("loginWithEmail with error response → returns false, stays unauthenticated", async () => {
  mockAuthClient.signIn.email.mockResolvedValue({
    data: null,
    error: { message: "Invalid credentials", status: 401 },
  });

  const { setAuthApiUrl, loginWithEmail, auth } = await freshAuthStore();
  setAuthApiUrl("http://localhost:3001");

  const result = await loginWithEmail("bad@example.com", "wrong");

  expect(result).toBe(false);
  expect(auth.isAuthenticated).toBe(false);
});

// ---------------------------------------------------------------------------
// signUp — success, NO Tauri authStoreSession
// ---------------------------------------------------------------------------

test("signUp success → isAuthenticated true, authStoreSession NOT called", async () => {
  mockAuthClient.signUp.email.mockResolvedValue({
    data: {
      user: {
        id: "user-new",
        email: "carol@example.com",
        name: "Carol",
        image: null,
      },
      token: "tok-new",
    },
    error: null,
  });

  const { setAuthApiUrl, signUp, auth } = await freshAuthStore();
  setAuthApiUrl("http://localhost:3001");

  const tauri = await import("$lib/api/tauri");
  const result = await signUp("carol@example.com", "password1", "Carol");

  expect(result).toBe(true);
  expect(auth.isAuthenticated).toBe(true);
  expect(auth.user?.name).toBe("Carol");
  expect(tauri.authStoreSession).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// logout — calls signOut, clears session, does NOT call tauriAuthLogout
// ---------------------------------------------------------------------------

test("logout → signOut called, isAuthenticated false, tauriAuthLogout NOT called", async () => {
  // Establish a session first via loginWithEmail
  mockAuthClient.signIn.email.mockResolvedValue({
    data: {
      user: { id: "u1", email: "dave@example.com", name: "Dave", image: null },
      token: "t1",
    },
    error: null,
  });
  mockAuthClient.signOut.mockResolvedValue({ data: null, error: null });

  const { setAuthApiUrl, loginWithEmail, logout, auth } = await freshAuthStore();
  setAuthApiUrl("http://localhost:3001");

  await loginWithEmail("dave@example.com", "pass");
  expect(auth.isAuthenticated).toBe(true);

  const tauri = await import("$lib/api/tauri");
  await logout();

  expect(mockAuthClient.signOut).toHaveBeenCalledOnce();
  expect(auth.isAuthenticated).toBe(false);
  expect(tauri.authLogout).not.toHaveBeenCalled();
});
