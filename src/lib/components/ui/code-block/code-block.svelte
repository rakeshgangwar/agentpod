<script lang="ts">
  import { codeToHtml, type BundledTheme } from "shiki";

  interface Props {
    code: string;
    language?: string;
    lightTheme?: BundledTheme;
    darkTheme?: BundledTheme;
    showLineNumbers?: boolean;
    class?: string;
  }

  let {
    code,
    language = "plaintext",
    lightTheme = "github-light",
    darkTheme = "github-dark",
    showLineNumbers = false,
    class: className = "",
  }: Props = $props();

  let highlightedHtml = $state<string>("");
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  // Languages supported by Shiki
  const supportedLanguages = new Set<string>([
    "javascript", "typescript", "jsx", "tsx", "json", "jsonc", "json5",
    "html", "css", "scss", "sass", "less", "xml",
    "markdown", "mdx", "yaml", "toml",
    "python", "rust", "go", "java", "kotlin", "swift", "c", "cpp", "csharp", "ruby", "php",
    "bash", "fish", "powershell", "sql",
    "dockerfile", "makefile", "nginx",
    "svelte", "vue", "graphql", "prisma"
  ]);

  // Map common file extensions to shiki language names
  function normalizeLanguage(lang: string): string {
    const langMap: Record<string, string> = {
      // JavaScript/TypeScript
      js: "javascript",
      jsx: "jsx",
      ts: "typescript",
      tsx: "tsx",
      mjs: "javascript",
      cjs: "javascript",
      // Web
      html: "html",
      htm: "html",
      css: "css",
      scss: "scss",
      sass: "sass",
      less: "less",
      // Data formats
      json: "json",
      jsonc: "jsonc",
      json5: "json5",
      yaml: "yaml",
      yml: "yaml",
      toml: "toml",
      xml: "xml",
      // Markdown
      md: "markdown",
      mdx: "mdx",
      // Programming languages
      py: "python",
      python: "python",
      rs: "rust",
      rust: "rust",
      go: "go",
      java: "java",
      kt: "kotlin",
      kotlin: "kotlin",
      swift: "swift",
      c: "c",
      cpp: "cpp",
      "c++": "cpp",
      h: "c",
      hpp: "cpp",
      cs: "csharp",
      csharp: "csharp",
      rb: "ruby",
      ruby: "ruby",
      php: "php",
      // Shell
      sh: "bash",
      bash: "bash",
      zsh: "bash",
      fish: "fish",
      ps1: "powershell",
      powershell: "powershell",
      // Database
      sql: "sql",
      // Config
      dockerfile: "dockerfile",
      docker: "dockerfile",
      makefile: "makefile",
      make: "makefile",
      nginx: "nginx",
      // Svelte/Vue/React
      svelte: "svelte",
      vue: "vue",
      // Other
      graphql: "graphql",
      gql: "graphql",
      prisma: "prisma",
    };

    const normalized = lang.toLowerCase();
    const mapped = langMap[normalized] || normalized;
    
    // Return the language if supported, otherwise fallback to plaintext
    return supportedLanguages.has(mapped) ? mapped : "plaintext";
  }

  async function highlightCode() {
    isLoading = true;
    error = null;

    try {
      const normalizedLang = normalizeLanguage(language);
      
      // Use dual themes for automatic light/dark mode support
      const html = await codeToHtml(code, {
        lang: normalizedLang,
        themes: {
          light: lightTheme,
          dark: darkTheme,
        },
        defaultColor: false, // Let CSS handle the theme switching
      });

      highlightedHtml = html;
    } catch (err) {
      console.error("Shiki highlighting error:", err);
      error = err instanceof Error ? err.message : "Failed to highlight code";
      // Fallback to plain text
      highlightedHtml = `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
    } finally {
      isLoading = false;
    }
  }

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Re-highlight when code or language changes
  $effect(() => {
    // Track dependencies
    code;
    language;
    lightTheme;
    darkTheme;
    // Highlight
    highlightCode();
  });
</script>

<div class="code-block {className}" class:loading={isLoading}>
  {#if isLoading}
    <div class="code-loading">
      <pre class="font-mono text-sm p-4 bg-muted rounded-md"><code>{code}</code></pre>
    </div>
  {:else if error}
    <div class="code-error">
      <pre class="font-mono text-sm p-4 bg-muted rounded-md"><code>{code}</code></pre>
    </div>
  {:else}
    {@html highlightedHtml}
  {/if}
</div>

<style>
  .code-block {
    width: 100%;
    overflow: auto;
  }

  .code-block :global(pre) {
    margin: 0;
    padding: 1rem;
    border-radius: 0.375rem;
    overflow-x: auto;
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .code-block :global(code) {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
      "Liberation Mono", monospace;
  }

  .code-block :global(.line) {
    display: inline-block;
    width: 100%;
    min-height: 1.5em;
  }

  .code-block.loading :global(pre) {
    opacity: 0.5;
  }

  /* Ensure proper wrapping for long lines */
  .code-block :global(pre) {
    white-space: pre;
    word-wrap: normal;
  }

  /* Dual theme support - Shiki sets --shiki-light and --shiki-dark on each span */
  /* We just need to tell spans which variable to use based on theme */
  
  /* Light mode (default) - use --shiki-light variables */
  .code-block :global(.shiki) {
    background-color: var(--shiki-light-bg) !important;
  }
  
  .code-block :global(.shiki span) {
    color: var(--shiki-light);
  }

  /* Dark mode - use --shiki-dark variables */
  :global(.dark) .code-block :global(.shiki) {
    background-color: var(--shiki-dark-bg) !important;
  }
  
  :global(.dark) .code-block :global(.shiki span) {
    color: var(--shiki-dark);
  }
</style>

