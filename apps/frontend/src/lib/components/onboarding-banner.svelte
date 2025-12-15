<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { OnboardingStatus } from "$lib/api/onboarding";

  interface Props {
    /** Current onboarding status */
    status: OnboardingStatus;
    /** Whether actions are loading */
    isLoading?: boolean;
    /** Error message if any */
    error?: string | null;
    /** Called when user clicks "Start Setup" */
    onStart?: () => void;
    /** Called when user clicks "Skip" */
    onSkip?: () => void;
    /** Called when user dismisses error */
    onDismissError?: () => void;
  }

  let {
    status,
    isLoading = false,
    error = null,
    onStart,
    onSkip,
    onDismissError,
  }: Props = $props();

  // Derived state for UI
  let showBanner = $derived(status === "pending");
  let showInProgress = $derived(["started", "gathering", "generating", "applying"].includes(status));
  let showCompleted = $derived(status === "completed");
  let showFailed = $derived(status === "failed");

  // Status message for in-progress states
  function getStatusMessage(s: OnboardingStatus): string {
    switch (s) {
      case "started":
        return "Setting up your workspace...";
      case "gathering":
        return "Understanding your project...";
      case "generating":
        return "Generating configuration...";
      case "applying":
        return "Applying configuration...";
      default:
        return "";
    }
  }
</script>

{#if showBanner}
  <!-- Welcome Banner - Shows when onboarding is pending -->
  <div class="rounded border border-[var(--cyber-cyan)]/30 bg-gradient-to-r from-[var(--cyber-cyan)]/5 to-[var(--cyber-cyan)]/10 p-4">
    <div class="flex items-start gap-4">
      <!-- Icon -->
      <div class="flex-shrink-0">
        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--cyber-cyan)]/10 border border-[var(--cyber-cyan)]/30 shadow-[0_0_12px_var(--cyber-cyan)/20]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="text-[var(--cyber-cyan)]"
          >
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            <path d="M19 3v4" />
            <path d="M21 5h-4" />
          </svg>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <h3 class="font-mono font-semibold text-[var(--cyber-cyan)]">[welcome] Let's set up your workspace</h3>
        <p class="mt-1 text-sm text-muted-foreground font-mono">
          I'll ask a few questions to configure your AI assistant for this project.
          This takes about 2 minutes.
        </p>

        {#if error}
          <div class="mt-3 flex items-center gap-2 text-sm font-mono text-[var(--cyber-red)] bg-[var(--cyber-red)]/10 border border-[var(--cyber-red)]/30 p-2 rounded">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" x2="12" y1="8" y2="12" />
              <line x1="12" x2="12.01" y1="16" y2="16" />
            </svg>
            <span class="flex-1">{error}</span>
            {#if onDismissError}
              <button
                class="text-[var(--cyber-red)]/70 hover:text-[var(--cyber-red)]"
                onclick={onDismissError}
                aria-label="Dismiss error"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            {/if}
          </div>
        {/if}

        <!-- Actions -->
        <div class="mt-4 flex items-center gap-3">
          <Button
            size="sm"
            class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-black"
            onclick={onStart}
            disabled={isLoading}
          >
            {#if isLoading}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="animate-spin mr-2"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Starting...
            {:else}
              Start Setup
            {/if}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="font-mono text-xs uppercase tracking-wider hover:bg-[var(--cyber-cyan)]/10 hover:text-[var(--cyber-cyan)]"
            onclick={onSkip}
            disabled={isLoading}
          >
            Skip for now
          </Button>
        </div>
      </div>
    </div>
  </div>
{:else if showInProgress}
  <!-- In Progress Banner -->
  <div class="rounded border border-[var(--cyber-cyan)]/30 bg-[var(--cyber-cyan)]/5 p-3">
    <div class="flex items-center gap-3">
      <div class="flex-shrink-0">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-[var(--cyber-cyan)] animate-pulse"
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          <path d="M19 3v4" />
          <path d="M21 5h-4" />
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-mono font-medium text-[var(--cyber-cyan)]">
          Workspace setup in progress
        </p>
        <p class="text-xs text-muted-foreground font-mono mt-0.5">
          The onboarding assistant is helping configure your project
        </p>
      </div>
    </div>
  </div>
{:else if showFailed}
  <!-- Failed Banner -->
  <div class="rounded border border-[var(--cyber-red)]/30 bg-[var(--cyber-red)]/5 p-3">
    <div class="flex items-center gap-3">
      <div class="flex-shrink-0">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-[var(--cyber-red)]"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-mono font-medium text-[var(--cyber-red)]">
          Setup failed
        </p>
        {#if error}
          <p class="text-xs text-[var(--cyber-red)]/80 font-mono mt-0.5">
            {error}
          </p>
        {/if}
      </div>
      <Button
        class="font-mono text-xs uppercase tracking-wider border border-[var(--cyber-cyan)]/50 bg-transparent hover:bg-[var(--cyber-cyan)]/10 text-[var(--cyber-cyan)]"
        size="sm"
        onclick={onStart}
        disabled={isLoading}
      >
        Try Again
      </Button>
    </div>
  </div>
{:else if showCompleted}
  <!-- This is usually not shown - completion is indicated by toast -->
  <!-- But we include it for completeness -->
{/if}
