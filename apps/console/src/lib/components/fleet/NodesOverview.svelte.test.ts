/**
 * NodesOverview.svelte.test.ts
 *
 * TDD tests for the fleet home Nodes Overview panel.
 * RED → implement NodesOverview.svelte → GREEN.
 *
 * Mocks $lib/api/client; asserts:
 *   - listNodes() → 2 nodes → both node cards render (host + status badge)
 *   - each card links to /nodes/<id>
 *   - empty array → empty state shown
 *   - "Create enrollment token" button is present
 *   - clicking it calls createEnrollmentToken and shows the returned token
 */

import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, fireEvent, cleanup } from "@testing-library/svelte";
import * as api from "$lib/api/client";
import NodesOverview from "./NodesOverview.svelte";

beforeEach(() => vi.restoreAllMocks());
afterEach(cleanup);

const mockNodes = [
  {
    id: "node_1",
    name: "vps1",
    hostname: "vps1.example.com",
    os: "linux",
    arch: "amd64",
    cpuCount: 4,
    status: "online" as const,
    lastSeenAt: "2026-06-28T10:00:00Z",
    createdAt: "2026-06-22T00:00:00Z",
  },
  {
    id: "node_2",
    name: "vps2",
    hostname: "vps2.example.com",
    os: "linux",
    arch: "arm64",
    cpuCount: 8,
    status: "offline" as const,
    lastSeenAt: null,
    createdAt: "2026-06-23T00:00:00Z",
  },
];

test("renders both node cards with hostname and status badge", async () => {
  vi.spyOn(api, "listNodes").mockResolvedValue(mockNodes);

  const { getByText } = render(NodesOverview);

  await waitFor(() => {
    expect(getByText("vps1.example.com")).toBeTruthy();
    expect(getByText("vps2.example.com")).toBeTruthy();
  });

  expect(getByText("online")).toBeTruthy();
  expect(getByText("offline")).toBeTruthy();
});

test("each node card links to /nodes/<id>", async () => {
  vi.spyOn(api, "listNodes").mockResolvedValue(mockNodes);

  const { container } = render(NodesOverview);

  await waitFor(() => {
    const links = Array.from(container.querySelectorAll("a[href]"));
    const hrefs = links.map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/nodes/node_1");
    expect(hrefs).toContain("/nodes/node_2");
  });
});

test("shows empty state when listNodes returns an empty array", async () => {
  vi.spyOn(api, "listNodes").mockResolvedValue([]);

  const { getByText } = render(NodesOverview);

  await waitFor(() => {
    expect(getByText(/no nodes yet/i)).toBeTruthy();
  });
});

test("'Create enrollment token' button is present", async () => {
  vi.spyOn(api, "listNodes").mockResolvedValue([]);

  const { getByRole } = render(NodesOverview);

  const btn = getByRole("button", { name: /create enrollment token/i });
  expect(btn).toBeTruthy();
});

test("mint failure shows inline mintError without replacing the node grid", async () => {
  vi.spyOn(api, "listNodes").mockResolvedValue(mockNodes);
  vi.spyOn(api, "createEnrollmentToken").mockRejectedValue(new Error("token quota exceeded"));

  const { getByRole, getByText, queryByText } = render(NodesOverview);

  // Wait for nodes to load
  await waitFor(() => {
    expect(getByText("vps1.example.com")).toBeTruthy();
  });

  const btn = getByRole("button", { name: /create enrollment token/i });
  fireEvent.click(btn);

  await waitFor(() => {
    // Inline mint error is shown
    expect(getByText("token quota exceeded")).toBeTruthy();
    // Node grid is still visible
    expect(getByText("vps1.example.com")).toBeTruthy();
    expect(getByText("vps2.example.com")).toBeTruthy();
    // Full-page error banner is NOT shown (no cyber-card border-destructive replacing the grid)
    expect(queryByText(/no nodes yet/i)).toBeNull();
  });
});

test("clicking 'Create enrollment token' calls createEnrollmentToken and shows the token command", async () => {
  vi.spyOn(api, "listNodes").mockResolvedValue([]);
  vi.spyOn(api, "createEnrollmentToken").mockResolvedValue({
    token: "tok_test_abc123",
    expiresAt: "2026-12-31T00:00:00Z",
  });

  const { getByRole, getByText } = render(NodesOverview);

  const btn = getByRole("button", { name: /create enrollment token/i });
  fireEvent.click(btn);

  await waitFor(() => {
    expect(api.createEnrollmentToken).toHaveBeenCalledOnce();
    expect(getByText(/tok_test_abc123/)).toBeTruthy();
  });
});
