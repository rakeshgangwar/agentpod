/**
 * Stub for $app/stores (SvelteKit legacy) in the Vitest/jsdom environment.
 */
import { readable } from "svelte/store";

export const page = readable({
  url: new URL("http://localhost/"),
  params: {},
  data: {},
  form: null,
  status: 200,
  error: null,
  route: { id: "/" },
});

export const navigating = readable(null);
export const updated = readable(false);
