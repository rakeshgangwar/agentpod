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

// ─── Write-action tests (canWrite=true) ──────────────────────────────────────

test("FileBrowser: delete button opens type-to-confirm dialog and calls del on confirm", async () => {
  vi.spyOn(api, "listFiles").mockResolvedValue([mockFile]);
  vi.spyOn(api, "del").mockResolvedValue({ ok: true });

  const { getByText, getByRole, getByPlaceholderText } = render(FileBrowser, {
    props: { stationId: "station_1", canWrite: true },
  });

  await waitFor(() => expect(getByText("README.md")).toBeTruthy());

  // Click the delete button for README.md
  fireEvent.click(getByRole("button", { name: "Delete README.md" }));

  // The type-to-confirm dialog should now be open
  await waitFor(() => expect(getByRole("dialog")).toBeTruthy());

  // Type the confirm phrase (the file name)
  const input = getByPlaceholderText("README.md");
  fireEvent.input(input, { target: { value: "README.md" } });

  // Confirm button should now be enabled
  await waitFor(() => {
    const btn = getByRole("button", { name: /confirm/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  fireEvent.click(getByRole("button", { name: /confirm/i }));

  await waitFor(() => {
    expect(api.del).toHaveBeenCalledWith("station_1", "README.md", { recursive: false });
  });
});

test("FileBrowser: new folder button calls mkdir", async () => {
  vi.spyOn(api, "listFiles").mockResolvedValue([]);
  vi.spyOn(api, "mkdir").mockResolvedValue({ ok: true });

  const { getByRole, getByPlaceholderText } = render(FileBrowser, {
    props: { stationId: "station_1", canWrite: true },
  });

  // Toolbar is rendered immediately (outside the loading state block)
  const newFolderBtn = getByRole("button", { name: /new folder/i });
  fireEvent.click(newFolderBtn);

  // An inline name input should appear
  await waitFor(() => {
    expect(getByPlaceholderText(/folder name/i)).toBeTruthy();
  });

  const input = getByPlaceholderText(/folder name/i);
  fireEvent.input(input, { target: { value: "my-new-dir" } });
  fireEvent.keyDown(input, { key: "Enter" });

  await waitFor(() => {
    expect(api.mkdir).toHaveBeenCalledWith("station_1", "my-new-dir");
  });
});

test("FileBrowser: 'Edit (diff)' button calls onOpenConfigEditor with the file path", async () => {
  vi.spyOn(api, "listFiles").mockResolvedValue([mockFile]);
  vi.spyOn(api, "readFile").mockResolvedValue({ content: "# Hello", truncated: false });

  const onOpenConfigEditor = vi.fn();

  const { getByText, getByRole } = render(FileBrowser, {
    props: { stationId: "station_1", canWrite: true, onOpenConfigEditor },
  });

  await waitFor(() => expect(getByText("README.md")).toBeTruthy());

  // Click the file to open the preview
  fireEvent.click(getByText("README.md"));

  // Wait for file content to load and "Edit (diff)" to appear
  await waitFor(() => {
    expect(getByRole("button", { name: /edit \(diff\)/i })).toBeTruthy();
  });

  fireEvent.click(getByRole("button", { name: /edit \(diff\)/i }));

  expect(onOpenConfigEditor).toHaveBeenCalledWith("README.md");
});

test("FileBrowser: write actions are hidden when canWrite is false", async () => {
  vi.spyOn(api, "listFiles").mockResolvedValue([mockFile]);

  const { queryByRole, getByText } = render(FileBrowser, {
    props: { stationId: "station_1", canWrite: false },
  });

  // Wait for entries to render
  await waitFor(() => expect(getByText("README.md")).toBeTruthy());

  // Toolbar and per-entry write actions must not exist
  expect(queryByRole("button", { name: /new file/i })).toBeNull();
  expect(queryByRole("button", { name: /new folder/i })).toBeNull();
  expect(queryByRole("button", { name: "Delete README.md" })).toBeNull();
  expect(queryByRole("button", { name: "Rename README.md" })).toBeNull();
});
