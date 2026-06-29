/**
 * Stub for $app/navigation (SvelteKit) in the Vitest/jsdom environment.
 */
export const goto = async (_url: string, _opts?: unknown) => undefined;
export const invalidate = async (_url: string) => undefined;
export const invalidateAll = async () => undefined;
export const preloadData = async (_url: string) => ({ type: "loaded" as const, status: 200, data: {} });
export const preloadCode = async (..._urls: string[]) => undefined;
export const beforeNavigate = (_callback: unknown) => undefined;
export const afterNavigate = (_callback: unknown) => undefined;
export const pushState = (_url: string, _state: unknown) => undefined;
export const replaceState = (_url: string, _state: unknown) => undefined;
