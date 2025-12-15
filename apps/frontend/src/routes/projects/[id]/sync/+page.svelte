<script lang="ts">
  import { page } from "$app/stores";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import {
    sandboxes,
    getGitStatus,
    getGitLog,
    commitChanges
  } from "$lib/stores/sandboxes.svelte";
  import type { GitStatusResponse, GitLogResponse, GitFileStatus } from "$lib/api/tauri";
  import SandboxNotRunning from "$lib/components/sandbox-not-running.svelte";
  import { onMount } from "svelte";

  let sandboxId = $derived($page.params.id ?? "");
  let sandbox = $derived(sandboxes.list.find(s => s.id === sandboxId));
  let isRunning = $derived(sandbox?.status === "running");

  // Git state
  let gitStatus = $state<GitStatusResponse | null>(null);
  let gitLog = $state<GitLogResponse | null>(null);
  let isLoadingStatus = $state(false);
  let isLoadingLog = $state(false);
  let isCommitting = $state(false);
  let commitMessage = $state("");
  let commitError = $state<string | null>(null);
  let commitSuccess = $state(false);

  // Load git info on mount
  onMount(() => {
    if (sandboxId && sandbox?.status === "running") {
      refreshGitStatus();
      refreshGitLog();
    }
  });

  // Refresh when sandbox status changes to running
  $effect(() => {
    if (sandbox?.status === "running" && !gitStatus) {
      refreshGitStatus();
      refreshGitLog();
    }
  });

  async function refreshGitStatus() {
    if (!sandboxId) return;
    isLoadingStatus = true;
    try {
      gitStatus = await getGitStatus(sandboxId);
    } catch (e) {
      console.error("Failed to get git status:", e);
    } finally {
      isLoadingStatus = false;
    }
  }

  async function refreshGitLog() {
    if (!sandboxId) return;
    isLoadingLog = true;
    try {
      gitLog = await getGitLog(sandboxId);
    } catch (e) {
      console.error("Failed to get git log:", e);
    } finally {
      isLoadingLog = false;
    }
  }

  async function handleCommit() {
    if (!sandboxId || !commitMessage.trim()) return;

    isCommitting = true;
    commitError = null;
    commitSuccess = false;

    try {
      const result = await commitChanges(sandboxId, commitMessage.trim());
      if (result) {
        commitSuccess = true;
        commitMessage = "";
        // Refresh status and log after commit
        await Promise.all([refreshGitStatus(), refreshGitLog()]);
      }
    } catch (e) {
      commitError = e instanceof Error ? e.message : "Failed to commit changes";
    } finally {
      isCommitting = false;
    }
  }

  function getStatusBadge(file: GitFileStatus): { color: string; text: string } {
    if (file.staged === "A" || file.unstaged === "?") {
      return { color: "var(--cyber-emerald)", text: "New" };
    }
    if (file.staged === "M" || file.unstaged === "M") {
      return { color: "var(--cyber-amber)", text: "Modified" };
    }
    if (file.staged === "D" || file.unstaged === "D") {
      return { color: "var(--cyber-red)", text: "Deleted" };
    }
    if (file.staged === "R") {
      return { color: "var(--cyber-cyan)", text: "Renamed" };
    }
    return { color: "var(--cyber-magenta)", text: "Changed" };
  }

  function formatCommitDate(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function shortenSha(sha: string): string {
    return sha.substring(0, 7);
  }

  // Computed values
  let hasChanges = $derived(gitStatus?.files && gitStatus.files.length > 0);
  let stagedFiles = $derived(gitStatus?.files.filter(f => f.staged && f.staged !== " " && f.staged !== "?") ?? []);
  let unstagedFiles = $derived(gitStatus?.files.filter(f => f.unstaged && f.unstaged !== " ") ?? []);
</script>

{#if !sandbox}
  <!-- Loading State -->
  <div class="h-[calc(100vh-140px)] min-h-[500px] flex items-center justify-center animate-fade-in">
    <div class="text-center animate-fade-in-up">
      <div class="relative mx-auto w-16 h-16">
        <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
        <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
      </div>
      <p class="mt-6 text-sm font-mono text-muted-foreground tracking-wider uppercase">
        Loading sandbox<span class="typing-cursor"></span>
      </p>
    </div>
  </div>
{:else if !isRunning}
  <SandboxNotRunning {sandbox} icon="⚙" actionText="view Git status" />
{:else}
  <div class="space-y-6 animate-fade-in">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-bold">
        Git
      </h2>
      <Button
        size="sm"
        variant="outline"
        onclick={refreshGitStatus}
        disabled={isLoadingStatus}
        class="h-8 px-4 font-mono text-xs uppercase tracking-wider border-border/50
               hover:border-[var(--cyber-cyan)]/50 hover:text-[var(--cyber-cyan)]"
      >
        {isLoadingStatus ? "Loading..." : "↻ Refresh"}
      </Button>
    </div>
    <!-- Working Directory Status -->
    <div class="cyber-card corner-accent overflow-hidden">
      <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
        <div class="flex items-center justify-between">
          <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
            [working_directory]
          </h3>
          {#if hasChanges}
            <span class="px-2 py-0.5 rounded text-xs font-mono bg-[var(--cyber-amber)]/10 text-[var(--cyber-amber)] border border-[var(--cyber-amber)]/30">
              {gitStatus?.files.length} changes
            </span>
          {:else}
            <span class="px-2 py-0.5 rounded text-xs font-mono bg-[var(--cyber-emerald)]/10 text-[var(--cyber-emerald)] border border-[var(--cyber-emerald)]/30">
              Clean
            </span>
          {/if}
        </div>
        <p class="text-xs font-mono text-muted-foreground mt-1">
          Current changes in your working directory
        </p>
      </div>

      <div class="p-4">
        {#if isLoadingStatus}
          <div class="text-center py-8">
            <div class="relative mx-auto w-8 h-8">
              <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
              <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
            </div>
            <p class="mt-3 text-xs font-mono text-muted-foreground">Loading git status...</p>
          </div>
        {:else if !hasChanges}
          <div class="text-center py-8">
            <div class="font-mono text-3xl text-[var(--cyber-emerald)]/30 mb-3">✓</div>
            <p class="text-sm font-mono text-muted-foreground">
              No uncommitted changes. Your working directory is clean.
            </p>
          </div>
        {:else}
          <div class="space-y-4">
            <!-- Staged Changes -->
            {#if stagedFiles.length > 0}
              <div>
                <h4 class="text-xs font-mono uppercase tracking-wider text-[var(--cyber-emerald)] mb-2">
                  Staged ({stagedFiles.length})
                </h4>
                <div class="space-y-1">
                  {#each stagedFiles as file}
                    {@const badge = getStatusBadge(file)}
                    <div class="flex items-center justify-between py-1.5 px-3 bg-[var(--cyber-emerald)]/5
                                rounded border border-[var(--cyber-emerald)]/20 text-sm">
                      <span class="font-mono text-xs truncate">{file.path}</span>
                      <span class="px-1.5 py-0.5 rounded text-xs font-mono"
                            style="color: {badge.color}; background: color-mix(in oklch, {badge.color} 10%, transparent); border: 1px solid color-mix(in oklch, {badge.color} 30%, transparent);">
                        {badge.text}
                      </span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Unstaged Changes -->
            {#if unstagedFiles.length > 0}
              <div>
                <h4 class="text-xs font-mono uppercase tracking-wider text-[var(--cyber-amber)] mb-2">
                  Unstaged ({unstagedFiles.length})
                </h4>
                <div class="space-y-1">
                  {#each unstagedFiles as file}
                    {@const badge = getStatusBadge(file)}
                    <div class="flex items-center justify-between py-1.5 px-3 bg-[var(--cyber-amber)]/5
                                rounded border border-[var(--cyber-amber)]/20 text-sm">
                      <span class="font-mono text-xs truncate">{file.path}</span>
                      <span class="px-1.5 py-0.5 rounded text-xs font-mono"
                            style="color: {badge.color}; background: color-mix(in oklch, {badge.color} 10%, transparent); border: 1px solid color-mix(in oklch, {badge.color} 30%, transparent);">
                        {badge.text}
                      </span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <!-- Commit Form -->
    {#if hasChanges}
      <div class="cyber-card corner-accent overflow-hidden animate-fade-in-up stagger-1">
        <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
          <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
            [commit_changes]
          </h3>
          <p class="text-xs font-mono text-muted-foreground mt-1">
            Stage all changes and create a commit
          </p>
        </div>

        <div class="p-4 space-y-4">
          {#if commitError}
            <div class="p-3 rounded border border-[var(--cyber-red)]/50 bg-[var(--cyber-red)]/5">
              <span class="font-mono text-xs text-[var(--cyber-red)]">{commitError}</span>
            </div>
          {/if}
          {#if commitSuccess}
            <div class="p-3 rounded border border-[var(--cyber-emerald)]/50 bg-[var(--cyber-emerald)]/5">
              <span class="font-mono text-xs text-[var(--cyber-emerald)]">Changes committed successfully!</span>
            </div>
          {/if}
          <div class="flex gap-2">
            <Input
              type="text"
              placeholder="Commit message..."
              bind:value={commitMessage}
              disabled={isCommitting}
              onkeydown={(e) => e.key === "Enter" && handleCommit()}
              class="flex-1 h-9 font-mono text-sm bg-background/50 border-border/50
                     focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)]"
            />
            <Button
              onclick={handleCommit}
              disabled={isCommitting || !commitMessage.trim()}
              class="h-9 px-4 font-mono text-xs uppercase tracking-wider
                     bg-[var(--cyber-emerald)] hover:bg-[var(--cyber-emerald)]/90 text-black
                     disabled:opacity-30"
            >
              {isCommitting ? "..." : "Commit"}
            </Button>
          </div>
          <p class="text-xs font-mono text-muted-foreground/70">
            This will stage all changes and create a commit with the message above.
          </p>
        </div>
      </div>
    {/if}

    <!-- Commit History -->
    <div class="cyber-card corner-accent overflow-hidden animate-fade-in-up stagger-2">
      <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
        <div class="flex items-center justify-between">
          <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
            [commit_history]
          </h3>
          <Button
            size="sm"
            variant="ghost"
            onclick={refreshGitLog}
            disabled={isLoadingLog}
            class="h-6 px-2 font-mono text-xs text-muted-foreground hover:text-[var(--cyber-cyan)]"
          >
            {isLoadingLog ? "..." : "↻"}
          </Button>
        </div>
        <p class="text-xs font-mono text-muted-foreground mt-1">
          Recent commits in this repository
        </p>
      </div>

      <div class="p-4">
        {#if isLoadingLog}
          <div class="text-center py-8">
            <div class="relative mx-auto w-8 h-8">
              <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
              <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
            </div>
            <p class="mt-3 text-xs font-mono text-muted-foreground">Loading commit history...</p>
          </div>
        {:else if !gitLog?.commits || gitLog.commits.length === 0}
          <div class="text-center py-8">
            <div class="font-mono text-3xl text-[var(--cyber-cyan)]/20 mb-3">○</div>
            <p class="text-sm font-mono text-muted-foreground">No commits yet.</p>
          </div>
        {:else}
          <div class="space-y-3">
            {#each gitLog.commits.slice(0, 10) as commit, i}
              <div class="border-l-2 border-[var(--cyber-cyan)]/30 pl-4 py-2 animate-fade-in-up"
                   style="animation-delay: {i * 50}ms">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0 flex-1">
                    <p class="font-medium text-sm truncate">{commit.message.split("\n")[0]}</p>
                    <p class="text-xs font-mono text-muted-foreground mt-1">
                      <span class="text-[var(--cyber-cyan)]">{shortenSha(commit.sha)}</span>
                      <span class="mx-1">·</span>
                      <span>{commit.author.name}</span>
                      <span class="mx-1">·</span>
                      <span>{formatCommitDate(commit.timestamp)}</span>
                    </p>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
