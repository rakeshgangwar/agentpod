<script lang="ts">
  import { page } from "$app/stores";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { RefreshCw, Check, Circle, GitCommit, FolderGit2 } from "@lucide/svelte";
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

  async function refreshAll() {
    await Promise.all([refreshGitStatus(), refreshGitLog()]);
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
        // Clear success message after 3 seconds
        setTimeout(() => { commitSuccess = false; }, 3000);
      }
    } catch (e) {
      commitError = e instanceof Error ? e.message : "Failed to commit changes";
    } finally {
      isCommitting = false;
    }
  }

  function getStatusBadge(file: GitFileStatus): { color: string; text: string; icon: string } {
    if (file.staged === "A" || file.unstaged === "?") {
      return { color: "var(--cyber-emerald)", text: "A", icon: "+" };
    }
    if (file.staged === "M" || file.unstaged === "M") {
      return { color: "var(--cyber-amber)", text: "M", icon: "~" };
    }
    if (file.staged === "D" || file.unstaged === "D") {
      return { color: "var(--cyber-red)", text: "D", icon: "-" };
    }
    if (file.staged === "R") {
      return { color: "var(--cyber-cyan)", text: "R", icon: "→" };
    }
    return { color: "var(--cyber-magenta)", text: "?", icon: "?" };
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
  let totalChanges = $derived((stagedFiles?.length ?? 0) + (unstagedFiles?.length ?? 0));
</script>

{#if !sandbox}
  <!-- Loading State -->
  <div class="h-full flex items-center justify-center animate-fade-in">
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
  <SandboxNotRunning {sandbox} icon="🔀" actionText="view Git status" />
{:else}
  <div class="h-full flex flex-col animate-fade-in">
    <!-- Compact Header -->
    <div class="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border/30 bg-background/50 backdrop-blur-sm">
      <div class="flex items-center gap-3">
        <FolderGit2 class="h-5 w-5 text-[var(--cyber-cyan)]" />
        <div>
          <h2 class="text-base font-semibold">Git</h2>
          <p class="text-xs font-mono text-muted-foreground">
            {#if hasChanges}
              <span class="text-[var(--cyber-amber)]">{totalChanges} uncommitted changes</span>
            {:else}
              <span class="text-[var(--cyber-emerald)]">Working directory clean</span>
            {/if}
          </p>
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onclick={refreshAll}
        disabled={isLoadingStatus || isLoadingLog}
        class="h-8 w-8 p-0 hover:text-[var(--cyber-cyan)]"
      >
        <RefreshCw class="h-4 w-4 {isLoadingStatus || isLoadingLog ? 'animate-spin' : ''}" />
      </Button>
    </div>

    <!-- Main Content - Two Column Layout -->
    <div class="flex-1 min-h-0 overflow-hidden">
      <div class="h-full grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border/30">
        
        <!-- Left Column: Changes & Commit -->
        <div class="flex flex-col min-h-0 overflow-hidden">
          <!-- Section Header -->
          <div class="flex-shrink-0 px-4 py-2 border-b border-border/20 bg-muted/30">
            <h3 class="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Working Directory
            </h3>
          </div>
          
          <!-- Changes List -->
          <div class="flex-1 min-h-0 overflow-y-auto">
            {#if isLoadingStatus}
              <div class="flex items-center justify-center py-12">
                <div class="relative w-6 h-6">
                  <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
                  <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
                </div>
              </div>
            {:else if !hasChanges}
              <div class="flex flex-col items-center justify-center py-12 px-4">
                <Check class="h-10 w-10 text-[var(--cyber-emerald)]/40 mb-3" />
                <p class="text-sm font-mono text-muted-foreground text-center">
                  Working directory clean
                </p>
                <p class="text-xs text-muted-foreground/60 mt-1">
                  No uncommitted changes
                </p>
              </div>
            {:else}
              <div class="p-3 space-y-3">
                <!-- Staged Files -->
                {#if stagedFiles.length > 0}
                  <div>
                    <div class="flex items-center gap-2 mb-2">
                      <span class="w-2 h-2 rounded-full bg-[var(--cyber-emerald)]"></span>
                      <span class="text-xs font-mono uppercase tracking-wider text-[var(--cyber-emerald)]">
                        Staged ({stagedFiles.length})
                      </span>
                    </div>
                    <div class="space-y-1">
                      {#each stagedFiles as file}
                        {@const badge = getStatusBadge(file)}
                        <div class="flex items-center gap-2 py-1 px-2 rounded bg-[var(--cyber-emerald)]/5 
                                    border border-[var(--cyber-emerald)]/10 group hover:border-[var(--cyber-emerald)]/30 transition-colors">
                          <span class="w-5 h-5 flex items-center justify-center rounded text-xs font-mono font-bold"
                                style="color: {badge.color}; background: color-mix(in oklch, {badge.color} 15%, transparent);">
                            {badge.icon}
                          </span>
                          <span class="font-mono text-xs truncate flex-1" title={file.path}>{file.path}</span>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}

                <!-- Unstaged Files -->
                {#if unstagedFiles.length > 0}
                  <div>
                    <div class="flex items-center gap-2 mb-2">
                      <span class="w-2 h-2 rounded-full bg-[var(--cyber-amber)]"></span>
                      <span class="text-xs font-mono uppercase tracking-wider text-[var(--cyber-amber)]">
                        Unstaged ({unstagedFiles.length})
                      </span>
                    </div>
                    <div class="space-y-1">
                      {#each unstagedFiles as file}
                        {@const badge = getStatusBadge(file)}
                        <div class="flex items-center gap-2 py-1 px-2 rounded bg-[var(--cyber-amber)]/5 
                                    border border-[var(--cyber-amber)]/10 group hover:border-[var(--cyber-amber)]/30 transition-colors">
                          <span class="w-5 h-5 flex items-center justify-center rounded text-xs font-mono font-bold"
                                style="color: {badge.color}; background: color-mix(in oklch, {badge.color} 15%, transparent);">
                            {badge.icon}
                          </span>
                          <span class="font-mono text-xs truncate flex-1" title={file.path}>{file.path}</span>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </div>

          <!-- Commit Form - Fixed at bottom -->
          {#if hasChanges}
            <div class="flex-shrink-0 border-t border-border/30 bg-background/80 backdrop-blur-sm p-3 space-y-2">
              {#if commitError}
                <div class="px-3 py-2 rounded border border-[var(--cyber-red)]/50 bg-[var(--cyber-red)]/5">
                  <span class="font-mono text-xs text-[var(--cyber-red)]">{commitError}</span>
                </div>
              {/if}
              {#if commitSuccess}
                <div class="px-3 py-2 rounded border border-[var(--cyber-emerald)]/50 bg-[var(--cyber-emerald)]/5">
                  <span class="font-mono text-xs text-[var(--cyber-emerald)]">Committed successfully!</span>
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
                  {#if isCommitting}
                    <RefreshCw class="h-3 w-3 animate-spin" />
                  {:else}
                    Commit
                  {/if}
                </Button>
              </div>
              <p class="text-xs font-mono text-muted-foreground/60">
                Stages all changes and commits
              </p>
            </div>
          {/if}
        </div>

        <!-- Right Column: Commit History -->
        <div class="flex flex-col min-h-0 overflow-hidden">
          <!-- Section Header -->
          <div class="flex-shrink-0 px-4 py-2 border-b border-border/20 bg-muted/30">
            <h3 class="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Commit History
            </h3>
          </div>

          <!-- Commits List -->
          <div class="flex-1 min-h-0 overflow-y-auto">
            {#if isLoadingLog}
              <div class="flex items-center justify-center py-12">
                <div class="relative w-6 h-6">
                  <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
                  <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
                </div>
              </div>
            {:else if !gitLog?.commits || gitLog.commits.length === 0}
              <div class="flex flex-col items-center justify-center py-12 px-4">
                <GitCommit class="h-10 w-10 text-muted-foreground/20 mb-3" />
                <p class="text-sm font-mono text-muted-foreground">No commits yet</p>
                <p class="text-xs text-muted-foreground/60 mt-1">
                  Make your first commit to start tracking changes
                </p>
              </div>
            {:else}
              <div class="p-3">
                {#each gitLog.commits.slice(0, 15) as commit, i}
                  <div class="flex gap-3 py-2 group {i > 0 ? 'border-t border-border/10' : ''}">
                    <!-- Timeline dot -->
                    <div class="flex-shrink-0 pt-1">
                      <div class="w-2 h-2 rounded-full bg-[var(--cyber-cyan)]/50 group-hover:bg-[var(--cyber-cyan)] transition-colors"></div>
                    </div>
                    <!-- Commit info -->
                    <div class="flex-1 min-w-0">
                      <p class="text-sm truncate group-hover:text-foreground transition-colors" title={commit.message}>
                        {commit.message.split("\n")[0]}
                      </p>
                      <div class="flex items-center gap-2 mt-1 text-xs font-mono text-muted-foreground">
                        <span class="text-[var(--cyber-cyan)]">{shortenSha(commit.sha)}</span>
                        <span class="text-muted-foreground/40">•</span>
                        <span class="truncate">{commit.author.name}</span>
                        <span class="text-muted-foreground/40">•</span>
                        <span class="flex-shrink-0">{formatCommitDate(commit.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
