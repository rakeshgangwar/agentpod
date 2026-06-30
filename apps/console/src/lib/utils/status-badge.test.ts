/**
 * status-badge.test.ts
 *
 * Unit tests for statusBadgeClass — the theme-robust outline badge helper.
 * Run: cd apps/console && pnpm test status-badge
 */

import { test, expect, describe } from "vitest";
import { statusBadgeClass } from "./status-badge";

describe("statusBadgeClass", () => {
  // ── chart-2 (green) group ──────────────────────────────────────────────────
  test("running → chart-2 outline", () => {
    const cls = statusBadgeClass("running");
    expect(cls).toContain("text-chart-2");
    expect(cls).toContain("border-chart-2");
    expect(cls).toContain("bg-chart-2/10");
  });

  test("online → chart-2 outline", () => {
    const cls = statusBadgeClass("online");
    expect(cls).toContain("text-chart-2");
    expect(cls).toContain("border-chart-2");
    expect(cls).toContain("bg-chart-2/10");
  });

  test("healthy → chart-2 outline", () => {
    const cls = statusBadgeClass("healthy");
    expect(cls).toContain("text-chart-2");
    expect(cls).toContain("border-chart-2");
    expect(cls).toContain("bg-chart-2/10");
  });

  test("active → chart-2 outline", () => {
    const cls = statusBadgeClass("active");
    expect(cls).toContain("text-chart-2");
    expect(cls).toContain("border-chart-2");
    expect(cls).toContain("bg-chart-2/10");
  });

  // ── destructive group ──────────────────────────────────────────────────────
  test("error → destructive outline", () => {
    const cls = statusBadgeClass("error");
    expect(cls).toContain("text-destructive");
    expect(cls).toContain("border-destructive");
    expect(cls).toContain("bg-destructive/10");
  });

  test("unhealthy → destructive outline", () => {
    const cls = statusBadgeClass("unhealthy");
    expect(cls).toContain("text-destructive");
    expect(cls).toContain("border-destructive");
    expect(cls).toContain("bg-destructive/10");
  });

  test("crashed → destructive outline", () => {
    const cls = statusBadgeClass("crashed");
    expect(cls).toContain("text-destructive");
    expect(cls).toContain("border-destructive");
    expect(cls).toContain("bg-destructive/10");
  });

  // ── chart-4 (amber) group ──────────────────────────────────────────────────
  test("starting → chart-4 outline", () => {
    const cls = statusBadgeClass("starting");
    expect(cls).toContain("text-chart-4");
    expect(cls).toContain("border-chart-4");
    expect(cls).toContain("bg-chart-4/10");
  });

  test("stopping → chart-4 outline", () => {
    const cls = statusBadgeClass("stopping");
    expect(cls).toContain("text-chart-4");
    expect(cls).toContain("border-chart-4");
    expect(cls).toContain("bg-chart-4/10");
  });

  test("warning → chart-4 outline", () => {
    const cls = statusBadgeClass("warning");
    expect(cls).toContain("text-chart-4");
    expect(cls).toContain("border-chart-4");
    expect(cls).toContain("bg-chart-4/10");
  });

  test("pending → chart-4 outline", () => {
    const cls = statusBadgeClass("pending");
    expect(cls).toContain("text-chart-4");
    expect(cls).toContain("border-chart-4");
    expect(cls).toContain("bg-chart-4/10");
  });

  // ── chart-5 group ──────────────────────────────────────────────────────────
  test("sleeping → chart-5 outline", () => {
    const cls = statusBadgeClass("sleeping");
    expect(cls).toContain("text-chart-5");
    expect(cls).toContain("border-chart-5");
    expect(cls).toContain("bg-chart-5/10");
  });

  test("hibernated → chart-5 outline", () => {
    const cls = statusBadgeClass("hibernated");
    expect(cls).toContain("text-chart-5");
    expect(cls).toContain("border-chart-5");
    expect(cls).toContain("bg-chart-5/10");
  });

  // ── muted-foreground group ─────────────────────────────────────────────────
  test("stopped → muted-foreground outline", () => {
    const cls = statusBadgeClass("stopped");
    expect(cls).toContain("text-muted-foreground");
    expect(cls).toContain("border-muted-foreground");
    expect(cls).toContain("bg-muted-foreground/10");
  });

  test("offline → muted-foreground outline", () => {
    const cls = statusBadgeClass("offline");
    expect(cls).toContain("text-muted-foreground");
    expect(cls).toContain("border-muted-foreground");
    expect(cls).toContain("bg-muted-foreground/10");
  });

  test("unknown → muted-foreground outline", () => {
    const cls = statusBadgeClass("unknown");
    expect(cls).toContain("text-muted-foreground");
    expect(cls).toContain("border-muted-foreground");
    expect(cls).toContain("bg-muted-foreground/10");
  });

  test("unrecognized status → muted-foreground outline (default)", () => {
    const cls = statusBadgeClass("something-random");
    expect(cls).toContain("text-muted-foreground");
    expect(cls).toContain("border-muted-foreground");
    expect(cls).toContain("bg-muted-foreground/10");
  });

  // ── case normalization ─────────────────────────────────────────────────────
  test("RUNNING (uppercase) → chart-2 outline", () => {
    const cls = statusBadgeClass("RUNNING");
    expect(cls).toContain("text-chart-2");
  });

  test("Connected (mixed-case) → chart-2 outline", () => {
    const cls = statusBadgeClass("Connected");
    expect(cls).toContain("text-chart-2");
  });
});
