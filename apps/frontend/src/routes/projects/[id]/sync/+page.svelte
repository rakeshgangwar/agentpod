<script lang="ts">
  import { page } from "$app/stores";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { Input } from "$lib/components/ui/input";
  import { 
    sandboxes, 
    getGitStatus, 
    getGitLog, 
    commitChanges 
  } from "$lib/stores/sandboxes.svelte";
  import type { GitStatusResponse, GitLogResponse, GitCommit, GitFileStatus } from "$lib/api/tauri";
  import { onMount } from "svelte";

  let sandboxId = $derived($page.params.id ?? "");
  let sandbox = $derived(sandboxes.list.find(s => s.id === sandboxId));

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

  function getStatusBadge(file: GitFileStatus): { variant: "default" | "secondary" | "destructive" | "outline"; text: string } {
    if (file.staged === "A" || file.unstaged === "?") {
      return { variant: "default", text: "New" };
    }
    if (file.staged === "M" || file.unstaged === "M") {
      return { variant: "secondary", text: "Modified" };
    }
    if (file.staged === "D" || file.unstaged === "D") {
      return { variant: "destructive", text: "Deleted" };
    }
    if (file.staged === "R") {
      return { variant: "outline", text: "Renamed" };
    }
    return { variant: "outline", text: "Changed" };
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

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h2 class="text-xl font-semibold">Git</h2>
    <div class="flex gap-2">
      <Button 
        size="sm" 
        variant="outline" 
        onclick={refreshGitStatus}
        disabled={isLoadingStatus || sandbox?.status !== "running"}
      >
        {isLoadingStatus ? "Loading..." : "Refresh Status"}
      </Button>
    </div>
  </div>

  {#if sandbox?.status !== "running"}
    <Card.Root>
      <Card.Content class="py-12 text-center">
        <p class="text-muted-foreground">Start the sandbox to view Git status.</p>
      </Card.Content>
    </Card.Root>
  {:else}
    <!-- Working Directory Status -->
    <Card.Root>
      <Card.Header>
        <Card.Title class="flex items-center justify-between">
          <span>Working Directory</span>
          {#if hasChanges}
            <Badge variant="secondary">{gitStatus?.files.length} changes</Badge>
          {:else}
            <Badge variant="outline">Clean</Badge>
          {/if}
        </Card.Title>
        <Card.Description>
          Current changes in your working directory
        </Card.Description>
      </Card.Header>
      <Card.Content>
        {#if isLoadingStatus}
          <div class="text-sm text-muted-foreground py-4 text-center">
            Loading git status...
          </div>
        {:else if !hasChanges}
          <div class="text-sm text-muted-foreground py-4 text-center">
            No uncommitted changes. Your working directory is clean.
          </div>
        {:else}
          <div class="space-y-4">
            <!-- Staged Changes -->
            {#if stagedFiles.length > 0}
              <div>
                <h4 class="text-sm font-medium mb-2 text-green-600">Staged ({stagedFiles.length})</h4>
                <div class="space-y-1">
                  {#each stagedFiles as file}
                    {@const badge = getStatusBadge(file)}
                    <div class="flex items-center justify-between py-1 px-2 bg-green-500/10 rounded text-sm">
                      <span class="font-mono truncate">{file.path}</span>
                      <Badge variant={badge.variant} class="text-xs">{badge.text}</Badge>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Unstaged Changes -->
            {#if unstagedFiles.length > 0}
              <div>
                <h4 class="text-sm font-medium mb-2 text-orange-600">Unstaged ({unstagedFiles.length})</h4>
                <div class="space-y-1">
                  {#each unstagedFiles as file}
                    {@const badge = getStatusBadge(file)}
                    <div class="flex items-center justify-between py-1 px-2 bg-orange-500/10 rounded text-sm">
                      <span class="font-mono truncate">{file.path}</span>
                      <Badge variant={badge.variant} class="text-xs">{badge.text}</Badge>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </Card.Content>
    </Card.Root>

    <!-- Commit Form -->
    {#if hasChanges}
      <Card.Root>
        <Card.Header>
          <Card.Title>Commit Changes</Card.Title>
          <Card.Description>
            Stage all changes and create a commit
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-4">
          {#if commitError}
            <div class="p-3 bg-destructive/10 text-destructive text-sm rounded">
              {commitError}
            </div>
          {/if}
          {#if commitSuccess}
            <div class="p-3 bg-green-500/10 text-green-600 text-sm rounded">
              Changes committed successfully!
            </div>
          {/if}
          <div class="flex gap-2">
            <Input
              type="text"
              placeholder="Commit message..."
              bind:value={commitMessage}
              disabled={isCommitting}
              onkeydown={(e) => e.key === "Enter" && handleCommit()}
            />
            <Button 
              onclick={handleCommit}
              disabled={isCommitting || !commitMessage.trim()}
            >
              {isCommitting ? "Committing..." : "Commit"}
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">
            This will stage all changes and create a commit with the message above.
          </p>
        </Card.Content>
      </Card.Root>
    {/if}

    <!-- Commit History -->
    <Card.Root>
      <Card.Header>
        <Card.Title class="flex items-center justify-between">
          <span>Commit History</span>
          <Button 
            size="sm" 
            variant="ghost" 
            onclick={refreshGitLog}
            disabled={isLoadingLog}
          >
            {isLoadingLog ? "..." : "↻"}
          </Button>
        </Card.Title>
        <Card.Description>
          Recent commits in this repository
        </Card.Description>
      </Card.Header>
      <Card.Content>
        {#if isLoadingLog}
          <div class="text-sm text-muted-foreground py-4 text-center">
            Loading commit history...
          </div>
        {:else if !gitLog?.commits || gitLog.commits.length === 0}
          <div class="text-sm text-muted-foreground py-4 text-center">
            No commits yet.
          </div>
        {:else}
          <div class="space-y-3">
            {#each gitLog.commits.slice(0, 10) as commit}
              <div class="border-l-2 border-muted pl-4 py-2">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0 flex-1">
                    <p class="font-medium truncate">{commit.message.split("\n")[0]}</p>
                    <p class="text-xs text-muted-foreground mt-1">
                      <span class="font-mono">{shortenSha(commit.sha)}</span>
                      {" · "}
                      {commit.author.name}
                      {" · "}
                      {formatCommitDate(commit.timestamp)}
                    </p>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </Card.Content>
    </Card.Root>
  {/if}
</div>
