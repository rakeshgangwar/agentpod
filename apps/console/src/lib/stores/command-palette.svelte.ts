/**
 * command-palette.svelte.ts
 *
 * Svelte 5 runes store for the Cmd-K fleet command palette.
 * Replaces quick-task.svelte.ts as the Cmd-K target.
 */

let _open = $state(false);

export const commandPalette = {
  get isOpen() { return _open; },
  open() { _open = true; },
  close() { _open = false; },
  toggle() { _open = !_open; },
};
