/**
 * app-shell.svelte.test.ts
 *
 * TDD tests for the responsive fleet-first app-shell.
 * RED → implement app-shell.svelte → GREEN.
 *
 * Asserts:
 *  - Fleet nav item (href="/") rendered in both mobile + desktop navs
 *  - Projects / Workflows NOT present in nav
 *  - Admin nav item (href="/admin") present only when auth.user.role === "admin"
 */

import { test, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/svelte";

// ---------------------------------------------------------------------------
// SvelteKit stubs — must be mocked before the component is imported
// ---------------------------------------------------------------------------

// page store used by BottomNavItem to derive isActive
vi.mock("$app/state", () => ({
  page: {
    url: { pathname: "/" },
  },
}));

// goto used (transitively) by some child components
vi.mock("$app/navigation", () => ({
  goto: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Auth store mock — hoisted so factory closures can reference the object
// ---------------------------------------------------------------------------

const { mockAuthState } = vi.hoisted(() => ({
  mockAuthState: {
    user: null as { id: string; email: string; role?: string } | null,
    isAuthenticated: false,
    isInitialized: true,
    isLoading: false,
    error: null,
    displayName: null,
    initials: "?",
    avatarUrl: null,
    email: null,
  },
}));

vi.mock("$lib/stores/auth.svelte", () => ({
  auth: mockAuthState,
}));

// ---------------------------------------------------------------------------
// Static import — compiled once, avoids repeated compilation overhead
// ---------------------------------------------------------------------------

import AppShell from "./app-shell.svelte";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockAuthState.user = null;
  mockAuthState.isAuthenticated = false;
});

function getAllLinks(container: HTMLElement) {
  return Array.from(container.querySelectorAll("a[href]"));
}

function linksTo(container: HTMLElement, href: string) {
  return getAllLinks(container).filter((a) => a.getAttribute("href") === href);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("renders at least one Fleet nav item with href='/'", () => {
  const { container } = render(AppShell);
  const fleetLinks = linksTo(container, "/");
  expect(fleetLinks.length).toBeGreaterThan(0);
});

test("does NOT render a nav item pointing to /projects", () => {
  const { container } = render(AppShell);
  // A small "Legacy" link to /projects is allowed outside primary nav
  // but the nav itself must not have a primary /projects item.
  // We check that no element with the nav role links there.
  const navEls = Array.from(container.querySelectorAll("nav"));
  const navProjectLinks = navEls.flatMap((nav) =>
    Array.from(nav.querySelectorAll('a[href="/projects"]'))
  );
  expect(navProjectLinks.length).toBe(0);
});

test("does NOT render a nav item pointing to /workflows", () => {
  const { container } = render(AppShell);
  const navEls = Array.from(container.querySelectorAll("nav"));
  const navWorkflowLinks = navEls.flatMap((nav) =>
    Array.from(nav.querySelectorAll('a[href="/workflows"]'))
  );
  expect(navWorkflowLinks.length).toBe(0);
});

test("Admin nav item is present when auth.user.role === 'admin'", () => {
  mockAuthState.user = { id: "u1", email: "admin@test.com", role: "admin" };
  mockAuthState.isAuthenticated = true;

  const { container } = render(AppShell);
  const adminLinks = linksTo(container, "/admin");
  expect(adminLinks.length).toBeGreaterThan(0);
});

test("Admin nav item is absent when auth.user has no admin role", () => {
  mockAuthState.user = { id: "u2", email: "user@test.com", role: "user" };
  mockAuthState.isAuthenticated = true;

  const { container } = render(AppShell);
  const adminLinks = linksTo(container, "/admin");
  expect(adminLinks.length).toBe(0);
});

test("Admin nav item is absent when auth.user is null", () => {
  mockAuthState.user = null;
  mockAuthState.isAuthenticated = false;

  const { container } = render(AppShell);
  const adminLinks = linksTo(container, "/admin");
  expect(adminLinks.length).toBe(0);
});

test("Settings nav item is always present", () => {
  const { container } = render(AppShell);
  const settingsLinks = linksTo(container, "/settings");
  expect(settingsLinks.length).toBeGreaterThan(0);
});

test("renders an Agents nav item with href='/agents'", () => {
  const { container } = render(AppShell);
  const agentLinks = linksTo(container, "/agents");
  expect(agentLinks.length).toBeGreaterThan(0);
});

test("Agents nav item appears in the Fleet group (between Overview and Nodes)", () => {
  const { container } = render(AppShell);
  const navLinks = getAllLinks(container);
  const hrefs = navLinks.map((a) => a.getAttribute("href"));
  const overviewIdx = hrefs.indexOf("/");
  const agentsIdx = hrefs.indexOf("/agents");
  const nodesIdx = hrefs.indexOf("/nodes");
  // All three must be present and in order: Overview → Agents → Nodes
  expect(overviewIdx).toBeGreaterThanOrEqual(0);
  expect(agentsIdx).toBeGreaterThan(overviewIdx);
  expect(nodesIdx).toBeGreaterThan(agentsIdx);
});
