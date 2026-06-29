import type { NodeSummary } from "@agentpod/contract";
import * as api from "$lib/api/client";

let list = $state<NodeSummary[]>([]);
let isLoading = $state(false);
let error = $state<string | null>(null);

export const nodes = {
  get list() { return list; },
  get isLoading() { return isLoading; },
  get error() { return error; },
};

export async function fetchNodes(): Promise<void> {
  isLoading = true; error = null;
  try { list = await api.listNodes(); }
  catch (e) { error = e instanceof Error ? e.message : "failed to load nodes"; }
  finally { isLoading = false; }
}
