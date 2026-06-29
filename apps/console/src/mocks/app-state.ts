/**
 * Stub for $app/state (SvelteKit) in the Vitest/jsdom environment.
 * Real SvelteKit resolves this at runtime; tests need a static stand-in.
 * Individual test files can override via vi.mock("$app/state", () => ({ ... })).
 */
export const page = {
  url: { pathname: "/" },
  params: {},
  data: {},
  form: null,
  status: 200,
  error: null,
  route: { id: "/" },
};

export const navigating = null;
export const updated = { current: false };
