// Tauri doesn't have a Node.js server to do proper SSR
// so we will use adapter-static to prerender the app (SSG)
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import preprocessReact from "svelte-preprocess-react/preprocessReact";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // preprocessReact must be last in the array
  preprocess: [vitePreprocess(), preprocessReact()],
  kit: {
    adapter: adapter({
      // Fallback page for dynamic routes in SPA mode
      fallback: "index.html",
    }),
    prerender: {
      // Dynamic routes like /projects/[id] cannot be prerendered
      // They will use client-side routing via the fallback page
      handleUnseenRoutes: "ignore",
    },
  },
};

export default config;
