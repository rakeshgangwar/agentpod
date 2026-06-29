/**
 * connect-banner.svelte.test.ts
 *
 * TDD tests for the "Connect your first node" banner.
 * RED → implement connect-banner.svelte → GREEN.
 *
 * Asserts:
 *   - renders a "connect your first node" heading
 *   - renders a "Create enrollment token" CTA button
 *   - clicking the CTA fires the passed onCreateToken callback
 */

import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import ConnectBanner from "./connect-banner.svelte";

beforeEach(() => vi.restoreAllMocks());
afterEach(cleanup);

test('renders "connect your first node" heading', () => {
  const { getByText } = render(ConnectBanner, { props: { onCreateToken: vi.fn() } });
  expect(getByText(/connect your first node/i)).toBeTruthy();
});

test("renders a Create enrollment token CTA button", () => {
  const { getByRole } = render(ConnectBanner, { props: { onCreateToken: vi.fn() } });
  expect(getByRole("button", { name: /create enrollment token/i })).toBeTruthy();
});

test("clicking the CTA calls the onCreateToken callback", async () => {
  const onCreateToken = vi.fn();
  const { getByRole } = render(ConnectBanner, { props: { onCreateToken } });
  const btn = getByRole("button", { name: /create enrollment token/i });
  await fireEvent.click(btn);
  expect(onCreateToken).toHaveBeenCalledOnce();
});
