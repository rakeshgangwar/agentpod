import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, fireEvent, cleanup } from "@testing-library/svelte";
import * as api from "$lib/api/client";
import type { FsEntry } from "@agentpod/contract";
// Static import ensures module is compiled during file collection, so the
// first test doesn't pay the ~4s compilation cost inside its waitFor window.
import FileBrowser from "./FileBrowser.svelte";

beforeEach(() => vi.restoreAllMocks());
afterEach(cleanup);

const mockDir: FsEntry = {
  name: "src",
  path: "src",
  type: "dir",
  size: null,
  modified: null,
};

const mockFile: FsEntry = {
  name: "README.md",
  path: "README.md",
  type: "file",
  size: 1024,
  modified: "2026-06-27T10:00:00Z",
};

const mockSubFile: FsEntry = {
  name: "index.ts",
  path: "src/index.ts",
  type: "file",
  size: 512,
  modified: "2026-06-27T09:00:00Z",
};

test("FileBrowser renders root entries (dir + file)", async () => {
  vi.spyOn(api, "listFiles").mockResolvedValue([mockDir, mockFile]);

  const { getByText } = render(FileBrowser, { props: { stationId: "station_1" } });

  await waitFor(() => {
    expect(getByText("src")).toBeTruthy();
    expect(getByText("README.md")).toBeTruthy();
  });

  expect(api.listFiles).toHaveBeenCalledWith("station_1", "");
});

test("FileBrowser clicking a directory calls listFiles again for that path", async () => {
  vi.spyOn(api, "listFiles")
    .mockResolvedValueOnce([mockDir, mockFile])   // root load
    .mockResolvedValueOnce([mockSubFile]);         // dir expand load

  const { getByText } = render(FileBrowser, { props: { stationId: "station_1" } });

  await waitFor(() => expect(getByText("src")).toBeTruthy());

  // Click the directory to trigger lazy load
  fireEvent.click(getByText("src"));

  await waitFor(() => {
    expect(api.listFiles).toHaveBeenCalledWith("station_1", "src");
    expect(getByText("index.ts")).toBeTruthy();
  });
});

test("FileBrowser clicking a file calls readFile", async () => {
  vi.spyOn(api, "listFiles").mockResolvedValue([mockDir, mockFile]);
  vi.spyOn(api, "readFile").mockResolvedValue({ content: "# Hello", truncated: false });

  const { getByText } = render(FileBrowser, { props: { stationId: "station_1" } });

  await waitFor(() => expect(getByText("README.md")).toBeTruthy());

  fireEvent.click(getByText("README.md"));

  await waitFor(() => {
    expect(api.readFile).toHaveBeenCalledWith("station_1", "README.md");
  });
});

test("FileBrowser shows truncated notice when file is truncated", async () => {
  vi.spyOn(api, "listFiles").mockResolvedValue([mockFile]);
  vi.spyOn(api, "readFile").mockResolvedValue({ content: "big content...", truncated: true });

  const { getByText } = render(FileBrowser, { props: { stationId: "station_1" } });

  await waitFor(() => expect(getByText("README.md")).toBeTruthy());
  fireEvent.click(getByText("README.md"));

  await waitFor(() => {
    expect(getByText(/truncated/i)).toBeTruthy();
  });
});
