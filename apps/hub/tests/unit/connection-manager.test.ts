import { test, expect } from "bun:test";
import { InMemoryConnectionManager } from "../../src/services/connection-manager";

test("register/isOnline/unregister + send routes to the registered sink", () => {
  const cm = new InMemoryConnectionManager();
  const sent: unknown[] = [];
  cm.register("node_1", (m) => sent.push(m));
  expect(cm.isOnline("node_1")).toBe(true);
  expect(cm.send("node_1", { type: "ack", ts: 1 })).toBe(true);
  expect(sent).toEqual([{ type: "ack", ts: 1 }]);
  cm.unregister("node_1");
  expect(cm.isOnline("node_1")).toBe(false);
  expect(cm.send("node_1", { type: "ack", ts: 2 })).toBe(false);
});
