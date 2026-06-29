import type { GatewayServerMessage } from "@agentpod/contract";

export type Send = (msg: GatewayServerMessage) => void;

export interface NodeConnectionManager {
  register(nodeId: string, send: Send): void;
  unregister(nodeId: string): void;
  isOnline(nodeId: string): boolean;
  onlineNodeIds(): string[];
  send(nodeId: string, msg: GatewayServerMessage): boolean;
}

export class InMemoryConnectionManager implements NodeConnectionManager {
  private conns = new Map<string, Send>();

  register(nodeId: string, send: Send) {
    this.conns.set(nodeId, send);
  }

  unregister(nodeId: string) {
    this.conns.delete(nodeId);
  }

  isOnline(nodeId: string) {
    return this.conns.has(nodeId);
  }

  onlineNodeIds() {
    return [...this.conns.keys()];
  }

  send(nodeId: string, msg: GatewayServerMessage) {
    const s = this.conns.get(nodeId);
    if (!s) return false;
    s(msg);
    return true;
  }
}

// Swap target later (Redis pub/sub or Durable Object) without touching callers.
export const connectionManager: NodeConnectionManager = new InMemoryConnectionManager();
