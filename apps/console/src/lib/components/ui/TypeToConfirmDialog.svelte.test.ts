import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, fireEvent, cleanup } from "@testing-library/svelte";
import TypeToConfirmDialog from "./TypeToConfirmDialog.svelte";

beforeEach(() => vi.restoreAllMocks());
afterEach(cleanup);

test("TypeToConfirmDialog: confirm button is disabled initially", () => {
  const { getByRole } = render(TypeToConfirmDialog, {
    props: {
      open: true,
      title: "Delete station",
      message: "This cannot be undone.",
      confirmPhrase: "my-station",
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    },
  });

  const confirmBtn = getByRole("button", { name: /confirm/i }) as HTMLButtonElement;
  expect(confirmBtn.disabled).toBe(true);
});

test("TypeToConfirmDialog: wrong input keeps confirm button disabled", () => {
  const { getByRole, getByPlaceholderText } = render(TypeToConfirmDialog, {
    props: {
      open: true,
      title: "Delete station",
      message: "This cannot be undone.",
      confirmPhrase: "my-station",
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    },
  });

  const input = getByPlaceholderText("my-station");
  fireEvent.input(input, { target: { value: "wrong-value" } });

  const confirmBtn = getByRole("button", { name: /confirm/i }) as HTMLButtonElement;
  expect(confirmBtn.disabled).toBe(true);
});

test("TypeToConfirmDialog: matching input enables button and fires onConfirm on click", async () => {
  const onConfirm = vi.fn();

  const { getByRole, getByPlaceholderText } = render(TypeToConfirmDialog, {
    props: {
      open: true,
      title: "Delete station",
      message: "This cannot be undone.",
      confirmPhrase: "my-station",
      onConfirm,
      onCancel: vi.fn(),
    },
  });

  const input = getByPlaceholderText("my-station");
  fireEvent.input(input, { target: { value: "my-station" } });

  await waitFor(() => {
    const btn = getByRole("button", { name: /confirm/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  fireEvent.click(getByRole("button", { name: /confirm/i }));
  expect(onConfirm).toHaveBeenCalledOnce();
});

test("TypeToConfirmDialog: Cancel button fires onCancel", () => {
  const onCancel = vi.fn();

  const { getByRole } = render(TypeToConfirmDialog, {
    props: {
      open: true,
      title: "Delete station",
      message: "This cannot be undone.",
      confirmPhrase: "my-station",
      onConfirm: vi.fn(),
      onCancel,
    },
  });

  fireEvent.click(getByRole("button", { name: /cancel/i }));
  expect(onCancel).toHaveBeenCalledOnce();
});

test("TypeToConfirmDialog: not rendered when open=false", () => {
  const { queryByRole } = render(TypeToConfirmDialog, {
    props: {
      open: false,
      title: "Delete station",
      message: "This cannot be undone.",
      confirmPhrase: "my-station",
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    },
  });

  expect(queryByRole("dialog")).toBeNull();
});
