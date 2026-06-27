import { test, expect } from "bun:test";
import { HostInfo, EnrollRequest, GatewayClientMessage } from "../src/index";

test("HostInfo parses a valid payload", () => {
  const v = HostInfo.parse({ hostname: "vps1", os: "linux", arch: "amd64", cpuCount: 4 });
  expect(v.hostname).toBe("vps1");
});

test("EnrollRequest rejects a missing token", () => {
  expect(() => EnrollRequest.parse({ hostInfo: { hostname: "x", os: "linux", arch: "amd64", cpuCount: 1 } })).toThrow();
});

test("GatewayClientMessage accepts a heartbeat and rejects unknown type", () => {
  expect(GatewayClientMessage.parse({ type: "heartbeat", ts: 1 }).type).toBe("heartbeat");
  expect(() => GatewayClientMessage.parse({ type: "nope" })).toThrow();
});
