import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/svelte";
import * as api from "$lib/api/client";
// Static import: compiled during file collection, not during the test body,
// so the first test's waitFor window isn't eaten by compilation time.
import LogTail from "./LogTail.svelte";

beforeEach(() => vi.restoreAllMocks());

// Minimal EventSource stub — captures the last instance so tests can fire events.
// jsdom does not provide EventSource natively; we install this before rendering.
class MockEventSource {
  static instance: MockEventSource | null = null;
  url: string;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onopen: ((e: Event) => void) | null = null;
  readyState = 0; // CONNECTING

  constructor(url: string) {
    this.url = url;
    MockEventSource.instance = this;
    // Simulate open after construction so onopen fires asynchronously
    setTimeout(() => {
      this.readyState = 1; // OPEN
      this.onopen?.(new Event("open"));
    }, 0);
  }

  close() {
    this.readyState = 2; // CLOSED
  }

  /** Fire a message event — called from test code to simulate SSE data. */
  fireMessage(data: string) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
}

afterEach(() => {
  MockEventSource.instance = null;
  cleanup();
});

test("LogTail opens EventSource with logsUrl and renders lines", async () => {
  vi.spyOn(api, "logsUrl").mockReturnValue("http://hub/api/stations/s1/logs");
  // Install stub before component mounts so onMount picks it up
  (globalThis as unknown as Record<string, unknown>).EventSource = MockEventSource;

  const { getByText } = render(LogTail, { props: { stationId: "s1" } });

  // Wait for the MockEventSource to be constructed (onMount ran)
  await waitFor(() => expect(MockEventSource.instance).toBeTruthy());

  // Fire a log line
  MockEventSource.instance!.fireMessage("2026-06-27 hello from agent");

  await waitFor(() => {
    expect(getByText(/hello from agent/)).toBeTruthy();
  });

  expect(api.logsUrl).toHaveBeenCalledWith("s1");
});

test("LogTail appends multiple lines in order", async () => {
  vi.spyOn(api, "logsUrl").mockReturnValue("http://hub/api/stations/s1/logs");
  (globalThis as unknown as Record<string, unknown>).EventSource = MockEventSource;

  const { getByText } = render(LogTail, { props: { stationId: "s1" } });

  await waitFor(() => expect(MockEventSource.instance).toBeTruthy());

  MockEventSource.instance!.fireMessage("line one");
  MockEventSource.instance!.fireMessage("line two");
  MockEventSource.instance!.fireMessage("line three");

  await waitFor(() => {
    expect(getByText(/line one/)).toBeTruthy();
    expect(getByText(/line two/)).toBeTruthy();
    expect(getByText(/line three/)).toBeTruthy();
  });
});
