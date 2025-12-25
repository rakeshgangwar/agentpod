<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { confirm } from "@tauri-apps/plugin-dialog";
  import { connection } from "$lib/stores/connection.svelte";
  import { workflows, fetchWorkflows, deleteWorkflow } from "$lib/stores/workflows.svelte";
  import PageHeader from "$lib/components/page-header.svelte";
  import { Button } from "$lib/components/ui/button";
  import ThemeToggle from "$lib/components/theme-toggle.svelte";

  import WorkflowIcon from "@lucide/svelte/icons/git-branch";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import PlayIcon from "@lucide/svelte/icons/play";
  import PauseIcon from "@lucide/svelte/icons/pause";
  import EditIcon from "@lucide/svelte/icons/edit-3";
  import CopyIcon from "@lucide/svelte/icons/copy";

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      goto("/");
    }
  }

  $effect(() => {
    if (!connection.isConnected) {
      goto("/login");
    }
  });

  $effect(() => {
    if (connection.isConnected) {
      fetchWorkflows();
    }
  });

  function formatDate(dateStr?: string | Date): string {
    if (!dateStr) return "---";
    const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function handleWorkflowClick(e: MouseEvent, workflowId: string) {
    const target = e.target as HTMLElement;
    if (target.closest("button")) {
      return;
    }
    goto(`/workflows/${workflowId}`);
  }

  async function handleDelete(e: MouseEvent, workflow: { id: string; name: string }) {
    e.stopPropagation();
    const shouldDelete = await confirm(`Delete workflow "${workflow.name}"?`, {
      title: "Confirm Delete",
      kind: "warning",
    });
    if (shouldDelete) {
      await deleteWorkflow(workflow.id);
    }
  }
</script>

<div class="noise-overlay"></div>

<main class="h-screen flex flex-col grid-bg mesh-gradient overflow-hidden">
  <PageHeader
    title="Workflows"
    icon={WorkflowIcon}
    subtitle="Visual automation builder"
  >
    {#snippet leading()}
      <Button
        variant="ghost"
        size="icon"
        onclick={goBack}
        class="h-8 w-8 border border-border/30 hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]"
      >
        <ArrowLeftIcon class="h-4 w-4" />
      </Button>
    {/snippet}
    
    {#snippet actions()}
      <ThemeToggle />

      <Button
        onclick={() => goto("/workflows/new")}
        class="cyber-btn-primary px-4 h-9 font-mono text-xs uppercase tracking-wider"
      >
        <PlusIcon class="h-4 w-4 mr-2" /> New Workflow
      </Button>
    {/snippet}
  </PageHeader>

  <div class="flex-1 overflow-y-auto px-4 sm:px-6 pb-8">
    <div class="max-w-7xl mx-auto pt-6">
      {#if workflows.error}
        <div class="mb-6 animate-fade-in-up cyber-card p-4 border-[var(--cyber-red)]/50">
          <div class="flex items-center gap-3 text-[var(--cyber-red)]">
            <span class="font-mono text-xs uppercase tracking-wider">[error]</span>
            <span class="text-sm">{workflows.error}</span>
          </div>
        </div>
      {/if}

      {#if workflows.list.length > 0}
        <div class="mb-6 flex items-center justify-between animate-fade-in-up">
          <div class="flex flex-wrap gap-4 sm:gap-6 text-sm font-mono">
            <div class="flex items-center gap-2">
              <span class="text-muted-foreground">total:</span>
              <span class="text-foreground font-semibold">{workflows.total}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-muted-foreground">active:</span>
              <span class="text-[var(--cyber-emerald)] font-semibold">
                {workflows.list.filter(w => w.active).length}
              </span>
            </div>
          </div>
        </div>
      {/if}

      {#if workflows.isLoading && workflows.list.length === 0}
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {#each [1, 2, 3] as i}
            <div class="cyber-card p-6 animate-fade-in-up stagger-{i}">
              <div class="space-y-4">
                <div class="h-6 bg-muted/50 rounded w-3/4 animate-pulse"></div>
                <div class="h-4 bg-muted/30 rounded w-1/2 animate-pulse"></div>
                <div class="h-4 bg-muted/20 rounded w-full animate-pulse"></div>
              </div>
            </div>
          {/each}
        </div>
      {:else if workflows.list.length === 0}
        <div class="cyber-card corner-accent p-12 text-center animate-fade-in-up">
          <div class="max-w-md mx-auto space-y-6">
            <div class="font-mono text-6xl text-[var(--cyber-cyan)]/20">[ ]</div>
            <div class="space-y-2">
              <h2 class="text-xl font-semibold">No workflows yet</h2>
              <p class="text-muted-foreground text-sm font-mono">
                Create your first workflow to automate tasks with AI.
              </p>
            </div>
            <Button
              onclick={() => goto("/workflows/new")}
              class="cyber-btn-primary px-8 h-11 font-mono text-xs uppercase tracking-wider"
            >
              <span class="mr-2">+</span> Create Workflow
            </Button>
          </div>
        </div>
      {:else}
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {#each workflows.list as workflow, i (workflow.id)}
            <div
              class="cyber-card corner-accent cursor-pointer group animate-fade-in-up stagger-{Math.min(i + 1, 8)}"
              onclick={(e: MouseEvent) => handleWorkflowClick(e, workflow.id)}
              role="button"
              tabindex="0"
              onkeydown={(e: KeyboardEvent) => e.key === "Enter" && goto(`/workflows/${workflow.id}`)}
            >
              <div class="p-5 pb-4 border-b border-border/30">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1 flex items-center gap-3">
                    <div class="shrink-0 w-10 h-10 rounded-lg bg-[var(--cyber-cyan)]/10 border border-[var(--cyber-cyan)]/30 flex items-center justify-center">
                      <WorkflowIcon class="w-5 h-5 text-[var(--cyber-cyan)]" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <h3 class="font-semibold text-lg truncate group-hover:text-[var(--cyber-cyan)] transition-colors">
                        {workflow.name}
                      </h3>
                      {#if workflow.description}
                        <p class="text-xs text-muted-foreground truncate mt-1">
                          {workflow.description}
                        </p>
                      {/if}
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    {#if workflow.active}
                      <div class="status-indicator status-running">
                        <span class="status-dot animate-pulse-dot"></span>
                        <span>active</span>
                      </div>
                    {:else}
                      <div class="status-indicator status-stopped">
                        <span class="status-dot"></span>
                        <span>inactive</span>
                      </div>
                    {/if}
                  </div>
                </div>
              </div>

              <div class="p-5 pt-4 space-y-4">
                <div class="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div>
                    <span class="text-muted-foreground block mb-1">nodes</span>
                    <span class="text-foreground">{workflow.nodes?.length || 0}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground block mb-1">updated</span>
                    <span class="text-foreground">{formatDate(workflow.updatedAt)}</span>
                  </div>
                </div>

                {#if workflow.tags && workflow.tags.length > 0}
                  <div class="flex flex-wrap gap-1">
                    {#each workflow.tags.slice(0, 3) as tag}
                      <span class="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground border border-border/30">
                        {tag}
                      </span>
                    {/each}
                    {#if workflow.tags.length > 3}
                      <span class="text-[10px] px-1.5 py-0.5 text-muted-foreground">
                        +{workflow.tags.length - 3}
                      </span>
                    {/if}
                  </div>
                {/if}

                <div class="flex items-center gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onclick={(e: MouseEvent) => { e.stopPropagation(); goto(`/workflows/${workflow.id}`); }}
                    class="font-mono text-xs uppercase tracking-wider h-8 px-4"
                  >
                    <EditIcon class="h-3 w-3 mr-1" />
                    Edit
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onclick={(e: MouseEvent) => handleDelete(e, workflow)}
                    class="font-mono text-xs uppercase tracking-wider h-8 px-4 text-[var(--cyber-red)] hover:text-[var(--cyber-red)] hover:bg-[var(--cyber-red)]/10"
                  >
                    <Trash2Icon class="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <footer class="mt-16 pt-8 border-t border-border/30 animate-fade-in-up" style="animation-delay: 0.5s; opacity: 0;">
        <div class="flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-muted-foreground">
          <div class="flex items-center gap-4">
            <span>AgentPod Workflows</span>
            <span class="text-border">|</span>
            <span>Visual Automation Builder</span>
          </div>
        </div>
      </footer>
    </div>
  </div>
</main>
