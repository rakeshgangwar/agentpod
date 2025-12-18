<script lang="ts">
  import { page } from "$app/stores";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { 
    RefreshCw, Check, GitCommitHorizontal, FolderGit2, FileCode, X,
    Columns2, LayoutList, ChevronLeft
  } from "@lucide/svelte";
  import { sandboxes } from "$lib/stores/sandboxes.svelte";
  import {
    gitStore,
    setActiveSandbox,
    fetchGitStatus,
    fetchGitLog,
    fetchBranches,
    commitChanges,
    fetchFileDiff,
    clearFileDiff,
    refreshAll as refreshGitAll
  } from "$lib/stores/git.svelte";
  import type { GitFileStatus as GitFileStatusType } from "$lib/api/tauri";
  import SandboxNotRunning from "$lib/components/sandbox-not-running.svelte";
  import { BranchSelector, CreateBranchDialog, DiffHunk, DiffHunkSideBySide, DiffStats } from "$lib/components/git";
  import { onMount } from "svelte";

  let sandboxId = $derived($page.params.id ?? "");
  let sandbox = $derived(sandboxes.list.find(s => s.id === sandboxId));
  let isRunning = $derived(sandbox?.status === "running");

  // Local state for commit form
  let isCommitting = $state(false);
  let commitMessage = $state("");
  let commitError = $state<string | null>(null);
  let commitSuccess = $state(false);
  
  // Dialog state
  let showCreateBranchDialog = $state(false);
  
  // Mobile tab state: "changes" or "history"
  let mobileActiveTab = $state<"changes" | "history">("changes");
  
  // View state: "history" or "diff"
  let rightPanelView = $state<"history" | "diff">("history");
  let selectedFile = $state<string | null>(null);
  let isLoadingFileDiff = $state(false);
  
  // Diff view mode: "unified" or "split"
  let diffViewMode = $state<"unified" | "split">("unified");

  // Derived state from git store
  let gitStatus = $derived(gitStore.status);
  let gitLog = $derived(gitStore.log);
  let isLoadingStatus = $derived(gitStore.isLoadingStatus);
  let isLoadingLog = $derived(gitStore.isLoadingLog);
  let selectedFileDiff = $derived(gitStore.selectedFileDiff);

  // Load git info on mount
  onMount(() => {
    if (sandboxId) {
      setActiveSandbox(sandboxId);
      if (sandbox?.status === "running") {
        refreshGitAll(sandboxId);
      }
    }
  });

  // Refresh when sandbox status changes to running
  $effect(() => {
    if (sandbox?.status === "running" && sandboxId) {
      if (!gitStatus) {
        fetchGitStatus(sandboxId);
        fetchGitLog(sandboxId);
        fetchBranches(sandboxId);
      }
    }
  });

  async function refreshAll() {
    if (sandboxId) {
      selectedFile = null;
      rightPanelView = "history";
      clearFileDiff();
      await refreshGitAll(sandboxId);
    }
  }

  async function handleCommit() {
    if (!sandboxId || !commitMessage.trim()) return;

    isCommitting = true;
    commitError = null;
    commitSuccess = false;

    try {
      const success = await commitChanges(commitMessage.trim(), sandboxId);
      if (success) {
        commitSuccess = true;
        commitMessage = "";
        selectedFile = null;
        rightPanelView = "history";
        clearFileDiff();
        // Clear success message after 3 seconds
        setTimeout(() => { commitSuccess = false; }, 3000);
      } else {
        commitError = "Failed to commit changes";
      }
    } catch (e) {
      commitError = e instanceof Error ? e.message : "Failed to commit changes";
    } finally {
      isCommitting = false;
    }
  }

  // Handle clicking on a file to view its diff
  async function handleFileClick(filePath: string) {
    if (selectedFile === filePath) {
      // Already selected, toggle back to history
      selectedFile = null;
      rightPanelView = "history";
      clearFileDiff();
      return;
    }
    
    selectedFile = filePath;
    rightPanelView = "diff";
    isLoadingFileDiff = true;
    
    // On mobile, switch to the history/diff tab when selecting a file
    mobileActiveTab = "history";
    
    try {
      await fetchFileDiff(filePath, sandboxId);
    } finally {
      isLoadingFileDiff = false;
    }
  }

  // Close diff view
  function closeDiffView() {
    selectedFile = null;
    rightPanelView = "history";
    clearFileDiff();
  }
  
  // Mobile: go back to changes tab
  function mobileBackToChanges() {
    mobileActiveTab = "changes";
    closeDiffView();
  }

  function getStatusBadge(file: GitFileStatusType): { color: string; text: string; icon: string } {
    // Handle full status strings from API
    if (file.staged === "added" || file.unstaged === "untracked") {
      return { color: "var(--cyber-emerald)", text: "A", icon: "+" };
    }
    if (file.staged === "modified" || file.unstaged === "modified") {
      return { color: "var(--cyber-amber)", text: "M", icon: "~" };
    }
    if (file.staged === "deleted" || file.unstaged === "deleted") {
      return { color: "var(--cyber-red)", text: "D", icon: "-" };
    }
    if (file.staged === "renamed") {
      return { color: "var(--cyber-cyan)", text: "R", icon: "→" };
    }
    // Legacy single-char support
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
  let stagedFiles = $derived(gitStatus?.files.filter(f => 
    f.staged && f.staged !== " " && f.staged !== "?" && f.staged !== "unmodified"
  ) ?? []);
  let unstagedFiles = $derived(gitStatus?.files.filter(f => 
    f.unstaged && f.unstaged !== " " && f.unstaged !== "unmodified"
  ) ?? []);
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
    <!-- Header - Responsive -->
    <div class="flex-shrink-0 border-b border-border/30 bg-background/50 backdrop-blur-sm">
      <!-- Mobile header -->
      <div class="flex items-center justify-between p-3 md:hidden">
        <div class="flex items-center gap-2">
          <FolderGit2 class="h-5 w-5 text-[var(--cyber-cyan)]" />
          <h2 class="text-base font-semibold">Git</h2>
          {#if hasChanges}
            <span class="text-xs font-mono px-1.5 py-0.5 rounded bg-[var(--cyber-amber)]/10 text-[var(--cyber-amber)]">
              {totalChanges}
            </span>
          {/if}
        </div>
        <div class="flex items-center gap-2">
          <BranchSelector 
            {sandboxId} 
            onCreateBranch={() => showCreateBranchDialog = true}
            compact
          />
          <Button
            size="sm"
            variant="ghost"
            onclick={refreshAll}
            disabled={isLoadingStatus || isLoadingLog}
            class="h-8 w-8 p-0"
          >
            <RefreshCw class="h-4 w-4 {isLoadingStatus || isLoadingLog ? 'animate-spin' : ''}" />
          </Button>
        </div>
      </div>
      
      <!-- Desktop header -->
      <div class="hidden md:flex items-center justify-between px-4 py-3">
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
        
        <div class="flex items-center gap-2">
          <BranchSelector 
            {sandboxId} 
            onCreateBranch={() => showCreateBranchDialog = true}
            compact
          />
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
      </div>
      
      <!-- Mobile Tab Bar -->
      <div class="flex md:hidden border-t border-border/20">
        <button
          type="button"
          onclick={() => mobileActiveTab = "changes"}
          class="flex-1 py-2 text-center text-xs font-mono uppercase tracking-wider transition-colors
                 {mobileActiveTab === 'changes' 
                   ? 'text-[var(--cyber-cyan)] border-b-2 border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/5' 
                   : 'text-muted-foreground border-b-2 border-transparent'}"
        >
          Changes {#if hasChanges}({totalChanges}){/if}
        </button>
        <button
          type="button"
          onclick={() => mobileActiveTab = "history"}
          class="flex-1 py-2 text-center text-xs font-mono uppercase tracking-wider transition-colors
                 {mobileActiveTab === 'history' 
                   ? 'text-[var(--cyber-cyan)] border-b-2 border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/5' 
                   : 'text-muted-foreground border-b-2 border-transparent'}"
        >
          {#if rightPanelView === "diff"}Diff{:else}History{/if}
        </button>
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 min-h-0 overflow-hidden">
      <!-- Mobile: Tab-based content -->
      <div class="h-full md:hidden">
        {#if mobileActiveTab === "changes"}
          <!-- Mobile Changes View -->
          <div class="h-full flex flex-col">
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
                      <div class="flex items-center gap-2 mb-2 px-1">
                        <span class="w-2 h-2 rounded-full bg-[var(--cyber-emerald)]"></span>
                        <span class="text-xs font-mono uppercase tracking-wider text-[var(--cyber-emerald)]">
                          Staged ({stagedFiles.length})
                        </span>
                      </div>
                      <div class="space-y-1">
                        {#each stagedFiles as file}
                          {@const badge = getStatusBadge(file)}
                          <button
                            type="button"
                            onclick={() => handleFileClick(file.path)}
                            class="w-full flex items-center gap-2 py-2 px-2 rounded text-left
                                   border transition-all cursor-pointer
                                   {selectedFile === file.path 
                                     ? 'bg-[var(--cyber-cyan)]/10 border-[var(--cyber-cyan)]/50' 
                                     : 'bg-[var(--cyber-emerald)]/5 border-transparent hover:border-[var(--cyber-emerald)]/30'}"
                          >
                            <span class="w-5 h-5 flex items-center justify-center rounded text-xs font-mono font-bold flex-shrink-0"
                                  style="color: {badge.color}; background: color-mix(in oklch, {badge.color} 15%, transparent);">
                              {badge.icon}
                            </span>
                            <span class="font-mono text-sm truncate flex-1" title={file.path}>{file.path}</span>
                            <FileCode class="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
                          </button>
                        {/each}
                      </div>
                    </div>
                  {/if}

                  <!-- Unstaged Files -->
                  {#if unstagedFiles.length > 0}
                    <div>
                      <div class="flex items-center gap-2 mb-2 px-1">
                        <span class="w-2 h-2 rounded-full bg-[var(--cyber-amber)]"></span>
                        <span class="text-xs font-mono uppercase tracking-wider text-[var(--cyber-amber)]">
                          Unstaged ({unstagedFiles.length})
                        </span>
                      </div>
                      <div class="space-y-1">
                        {#each unstagedFiles as file}
                          {@const badge = getStatusBadge(file)}
                          <button
                            type="button"
                            onclick={() => handleFileClick(file.path)}
                            class="w-full flex items-center gap-2 py-2 px-2 rounded text-left
                                   border transition-all cursor-pointer
                                   {selectedFile === file.path 
                                     ? 'bg-[var(--cyber-cyan)]/10 border-[var(--cyber-cyan)]/50' 
                                     : 'bg-[var(--cyber-amber)]/5 border-transparent hover:border-[var(--cyber-amber)]/30'}"
                          >
                            <span class="w-5 h-5 flex items-center justify-center rounded text-xs font-mono font-bold flex-shrink-0"
                                  style="color: {badge.color}; background: color-mix(in oklch, {badge.color} 15%, transparent);">
                              {badge.icon}
                            </span>
                            <span class="font-mono text-sm truncate flex-1" title={file.path}>{file.path}</span>
                            <FileCode class="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
                          </button>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>

            <!-- Mobile Commit Form -->
            {#if hasChanges}
              <div class="flex-shrink-0 border-t border-border/30 bg-background/80 backdrop-blur-sm p-3 space-y-2">
                {#if commitError}
                  <div class="px-3 py-2 rounded border border-[var(--cyber-red)]/50 bg-[var(--cyber-red)]/5">
                    <span class="font-mono text-xs text-[var(--cyber-red)]">{commitError}</span>
                  </div>
                {/if}
                {#if commitSuccess}
                  <div class="px-3 py-2 rounded border border-[var(--cyber-emerald)]/50 bg-[var(--cyber-emerald)]/5">
                    <span class="font-mono text-xs text-[var(--cyber-emerald)]">Committed!</span>
                  </div>
                {/if}
                <div class="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Commit message..."
                    bind:value={commitMessage}
                    disabled={isCommitting}
                    onkeydown={(e) => e.key === "Enter" && handleCommit()}
                    class="flex-1 h-10 font-mono text-sm"
                  />
                  <Button
                    onclick={handleCommit}
                    disabled={isCommitting || !commitMessage.trim()}
                    class="h-10 px-4 font-mono text-xs uppercase
                           bg-[var(--cyber-emerald)] hover:bg-[var(--cyber-emerald)]/90 text-black"
                  >
                    {#if isCommitting}
                      <RefreshCw class="h-4 w-4 animate-spin" />
                    {:else}
                      Commit
                    {/if}
                  </Button>
                </div>
              </div>
            {/if}
          </div>
        {:else}
          <!-- Mobile History/Diff View -->
          <div class="h-full flex flex-col">
            <!-- Mobile Diff Header -->
            {#if rightPanelView === "diff" && selectedFile}
              <div class="flex-shrink-0 px-3 py-2 border-b border-border/20 bg-muted/30 flex items-center gap-2">
                <button
                  type="button"
                  onclick={mobileBackToChanges}
                  class="p-1.5 -ml-1 rounded hover:bg-accent/50 transition-colors"
                >
                  <ChevronLeft class="h-4 w-4" />
                </button>
                <div class="flex-1 min-w-0">
                  <span class="font-mono text-xs truncate block" title={selectedFile}>
                    {selectedFile}
                  </span>
                  {#if selectedFileDiff}
                    <DiffStats 
                      additions={selectedFileDiff.additions} 
                      deletions={selectedFileDiff.deletions} 
                      compact 
                    />
                  {/if}
                </div>
                <button
                  type="button"
                  onclick={closeDiffView}
                  class="p-1.5 rounded hover:bg-accent/50 transition-colors"
                >
                  <X class="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            {/if}
            
            <!-- Mobile Content -->
            <div class="flex-1 min-h-0 overflow-y-auto">
              {#if rightPanelView === "diff"}
                <!-- Diff View -->
                {#if isLoadingFileDiff}
                  <div class="flex items-center justify-center py-12">
                    <div class="flex flex-col items-center gap-3">
                      <RefreshCw class="h-5 w-5 animate-spin text-[var(--cyber-cyan)]" />
                      <span class="text-sm font-mono text-muted-foreground">Loading diff...</span>
                    </div>
                  </div>
                {:else if selectedFileDiff}
                  {#if selectedFileDiff.hunks.length > 0}
                    <div class="p-3 space-y-3">
                      {#each selectedFileDiff.hunks as hunk, index}
                        <!-- Always use unified view on mobile -->
                        <DiffHunk {hunk} initialCollapsed={index > 2} />
                      {/each}
                    </div>
                  {:else}
                    <div class="flex flex-col items-center justify-center py-12 px-4">
                      <FileCode class="h-10 w-10 text-muted-foreground/20 mb-3" />
                      <p class="text-sm font-mono text-muted-foreground">
                        {#if selectedFileDiff.status === "added"}
                          New file (empty or binary)
                        {:else if selectedFileDiff.status === "deleted"}
                          File deleted
                        {:else}
                          No content changes
                        {/if}
                      </p>
                    </div>
                  {/if}
                {:else}
                  <div class="flex flex-col items-center justify-center py-12 px-4">
                    <p class="text-sm text-muted-foreground">Failed to load diff</p>
                  </div>
                {/if}
              {:else}
                <!-- Commit History -->
                {#if isLoadingLog}
                  <div class="flex items-center justify-center py-12">
                    <div class="relative w-6 h-6">
                      <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
                      <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
                    </div>
                  </div>
                {:else if !gitLog?.commits || gitLog.commits.length === 0}
                  <div class="flex flex-col items-center justify-center py-12 px-4">
                    <GitCommitHorizontal class="h-10 w-10 text-muted-foreground/20 mb-3" />
                    <p class="text-sm font-mono text-muted-foreground">No commits yet</p>
                    <p class="text-xs text-muted-foreground/60 mt-1">
                      Make your first commit
                    </p>
                  </div>
                {:else}
                  <div class="p-3">
                    {#each gitLog.commits.slice(0, 20) as commit, i}
                      <div class="flex gap-3 py-2.5 {i > 0 ? 'border-t border-border/10' : ''}">
                        <div class="flex-shrink-0 pt-1">
                          <div class="w-2 h-2 rounded-full bg-[var(--cyber-cyan)]/50"></div>
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-sm truncate" title={commit.message}>
                            {commit.message.split("\n")[0]}
                          </p>
                          <div class="flex items-center gap-2 mt-1 text-xs font-mono text-muted-foreground">
                            <span class="text-[var(--cyber-cyan)]">{shortenSha(commit.sha)}</span>
                            <span class="text-muted-foreground/40">•</span>
                            <span class="flex-shrink-0">{formatCommitDate(commit.timestamp)}</span>
                          </div>
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- Desktop: Side-by-side layout -->
      <div class="hidden md:grid h-full grid-cols-[minmax(280px,1fr)_minmax(400px,2fr)] divide-x divide-border/30">
        <!-- Left Column: Changes & Commit -->
        <div class="flex flex-col min-h-0 overflow-hidden">
          <div class="flex-shrink-0 px-4 py-2 border-b border-border/20 bg-muted/30">
            <h3 class="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Working Directory
            </h3>
          </div>
          
          <div class="flex-1 min-h-0 overflow-y-auto">
            {#if isLoadingStatus}
              <div class="flex items-center justify-center py-12">
                <div class="relative w-6 h-6">
                  <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
                  <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
                </div>
              </div>
            {:else if !hasChanges}
              <div class="flex flex-col items-center justify-center py-8 px-4">
                <Check class="h-8 w-8 text-[var(--cyber-emerald)]/40 mb-2" />
                <p class="text-sm font-mono text-muted-foreground text-center">
                  Working directory clean
                </p>
              </div>
            {:else}
              <div class="p-2 space-y-2">
                {#if stagedFiles.length > 0}
                  <div>
                    <div class="flex items-center gap-2 mb-1.5 px-1">
                      <span class="w-1.5 h-1.5 rounded-full bg-[var(--cyber-emerald)]"></span>
                      <span class="text-[10px] font-mono uppercase tracking-wider text-[var(--cyber-emerald)]">
                        Staged ({stagedFiles.length})
                      </span>
                    </div>
                    <div class="space-y-0.5">
                      {#each stagedFiles as file}
                        {@const badge = getStatusBadge(file)}
                        <button
                          type="button"
                          onclick={() => handleFileClick(file.path)}
                          class="w-full flex items-center gap-1.5 py-1 px-1.5 rounded text-left
                                 border transition-all cursor-pointer text-xs
                                 {selectedFile === file.path 
                                   ? 'bg-[var(--cyber-cyan)]/10 border-[var(--cyber-cyan)]/50' 
                                   : 'bg-[var(--cyber-emerald)]/5 border-transparent hover:border-[var(--cyber-emerald)]/30'}"
                        >
                          <span class="w-4 h-4 flex items-center justify-center rounded text-[10px] font-mono font-bold flex-shrink-0"
                                style="color: {badge.color}; background: color-mix(in oklch, {badge.color} 15%, transparent);">
                            {badge.icon}
                          </span>
                          <span class="font-mono truncate flex-1" title={file.path}>{file.path}</span>
                          {#if selectedFile === file.path}
                            <FileCode class="h-3 w-3 text-[var(--cyber-cyan)] flex-shrink-0" />
                          {/if}
                        </button>
                      {/each}
                    </div>
                  </div>
                {/if}

                {#if unstagedFiles.length > 0}
                  <div>
                    <div class="flex items-center gap-2 mb-1.5 px-1">
                      <span class="w-1.5 h-1.5 rounded-full bg-[var(--cyber-amber)]"></span>
                      <span class="text-[10px] font-mono uppercase tracking-wider text-[var(--cyber-amber)]">
                        Unstaged ({unstagedFiles.length})
                      </span>
                    </div>
                    <div class="space-y-0.5">
                      {#each unstagedFiles as file}
                        {@const badge = getStatusBadge(file)}
                        <button
                          type="button"
                          onclick={() => handleFileClick(file.path)}
                          class="w-full flex items-center gap-1.5 py-1 px-1.5 rounded text-left
                                 border transition-all cursor-pointer text-xs
                                 {selectedFile === file.path 
                                   ? 'bg-[var(--cyber-cyan)]/10 border-[var(--cyber-cyan)]/50' 
                                   : 'bg-[var(--cyber-amber)]/5 border-transparent hover:border-[var(--cyber-amber)]/30'}"
                        >
                          <span class="w-4 h-4 flex items-center justify-center rounded text-[10px] font-mono font-bold flex-shrink-0"
                                style="color: {badge.color}; background: color-mix(in oklch, {badge.color} 15%, transparent);">
                            {badge.icon}
                          </span>
                          <span class="font-mono truncate flex-1" title={file.path}>{file.path}</span>
                          {#if selectedFile === file.path}
                            <FileCode class="h-3 w-3 text-[var(--cyber-cyan)] flex-shrink-0" />
                          {/if}
                        </button>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </div>

          {#if hasChanges}
            <div class="flex-shrink-0 border-t border-border/30 bg-background/80 backdrop-blur-sm p-2 space-y-1.5">
              {#if commitError}
                <div class="px-2 py-1.5 rounded border border-[var(--cyber-red)]/50 bg-[var(--cyber-red)]/5">
                  <span class="font-mono text-[10px] text-[var(--cyber-red)]">{commitError}</span>
                </div>
              {/if}
              {#if commitSuccess}
                <div class="px-2 py-1.5 rounded border border-[var(--cyber-emerald)]/50 bg-[var(--cyber-emerald)]/5">
                  <span class="font-mono text-[10px] text-[var(--cyber-emerald)]">Committed!</span>
                </div>
              {/if}
              <div class="flex gap-1.5">
                <Input
                  type="text"
                  placeholder="Commit message..."
                  bind:value={commitMessage}
                  disabled={isCommitting}
                  onkeydown={(e) => e.key === "Enter" && handleCommit()}
                  class="flex-1 h-8 font-mono text-xs bg-background/50 border-border/50
                         focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)]"
                />
                <Button
                  onclick={handleCommit}
                  disabled={isCommitting || !commitMessage.trim()}
                  size="sm"
                  class="h-8 px-3 font-mono text-[10px] uppercase tracking-wider
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
            </div>
          {/if}
        </div>

        <!-- Right Column: Diff Viewer or Commit History -->
        <div class="flex flex-col min-h-0 overflow-hidden">
          <div class="flex-shrink-0 px-4 py-2 border-b border-border/20 bg-muted/30 flex items-center justify-between gap-2">
            {#if rightPanelView === "diff" && selectedFile}
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <FileCode class="h-4 w-4 text-[var(--cyber-cyan)] flex-shrink-0" />
                <span class="font-mono text-xs truncate" title={selectedFile}>
                  {selectedFile}
                </span>
                {#if selectedFileDiff}
                  <DiffStats 
                    additions={selectedFileDiff.additions} 
                    deletions={selectedFileDiff.deletions} 
                    compact 
                  />
                {/if}
              </div>
              <div class="flex items-center gap-1 flex-shrink-0">
                <div class="flex items-center border border-border/30 rounded overflow-hidden">
                  <button
                    type="button"
                    onclick={() => diffViewMode = "unified"}
                    class="p-1.5 transition-colors {diffViewMode === 'unified' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'}"
                    title="Unified view"
                  >
                    <LayoutList class="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onclick={() => diffViewMode = "split"}
                    class="p-1.5 transition-colors {diffViewMode === 'split' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'}"
                    title="Side-by-side view"
                  >
                    <Columns2 class="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onclick={closeDiffView}
                  class="p-1.5 rounded hover:bg-accent/50 transition-colors"
                  title="Close diff view"
                >
                  <X class="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            {:else}
              <h3 class="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Commit History
              </h3>
              {#if hasChanges}
                <span class="text-[10px] text-muted-foreground/60">
                  Click a file to view diff
                </span>
              {/if}
            {/if}
          </div>

          <div class="flex-1 min-h-0 overflow-y-auto">
            {#if rightPanelView === "diff"}
              {#if isLoadingFileDiff}
                <div class="flex items-center justify-center py-12">
                  <div class="flex flex-col items-center gap-3">
                    <RefreshCw class="h-5 w-5 animate-spin text-[var(--cyber-cyan)]" />
                    <span class="text-sm font-mono text-muted-foreground">Loading diff...</span>
                  </div>
                </div>
              {:else if selectedFileDiff}
                {#if selectedFileDiff.hunks.length > 0}
                  <div class="p-3 space-y-3">
                    {#each selectedFileDiff.hunks as hunk, index}
                      {#if diffViewMode === "split"}
                        <DiffHunkSideBySide {hunk} initialCollapsed={index > 3} />
                      {:else}
                        <DiffHunk {hunk} initialCollapsed={index > 3} />
                      {/if}
                    {/each}
                  </div>
                {:else}
                  <div class="flex flex-col items-center justify-center py-12 px-4">
                    <FileCode class="h-10 w-10 text-muted-foreground/20 mb-3" />
                    <p class="text-sm font-mono text-muted-foreground">
                      {#if selectedFileDiff.status === "added"}
                        New file (empty or binary)
                      {:else if selectedFileDiff.status === "deleted"}
                        File deleted
                      {:else}
                        No content changes
                      {/if}
                    </p>
                  </div>
                {/if}
              {:else}
                <div class="flex flex-col items-center justify-center py-12 px-4">
                  <p class="text-sm text-muted-foreground">Failed to load diff</p>
                </div>
              {/if}
            {:else}
              {#if isLoadingLog}
                <div class="flex items-center justify-center py-12">
                  <div class="relative w-6 h-6">
                    <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
                    <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
                  </div>
                </div>
              {:else if !gitLog?.commits || gitLog.commits.length === 0}
                <div class="flex flex-col items-center justify-center py-12 px-4">
                  <GitCommitHorizontal class="h-10 w-10 text-muted-foreground/20 mb-3" />
                  <p class="text-sm font-mono text-muted-foreground">No commits yet</p>
                  <p class="text-xs text-muted-foreground/60 mt-1">
                    Make your first commit to start tracking changes
                  </p>
                </div>
              {:else}
                <div class="p-3">
                  {#each gitLog.commits.slice(0, 20) as commit, i}
                    <div class="flex gap-3 py-2 group {i > 0 ? 'border-t border-border/10' : ''}">
                      <div class="flex-shrink-0 pt-1">
                        <div class="w-2 h-2 rounded-full bg-[var(--cyber-cyan)]/50 group-hover:bg-[var(--cyber-cyan)] transition-colors"></div>
                      </div>
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
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <CreateBranchDialog
    {sandboxId}
    open={showCreateBranchDialog}
    onOpenChange={(open) => showCreateBranchDialog = open}
  />
{/if}
