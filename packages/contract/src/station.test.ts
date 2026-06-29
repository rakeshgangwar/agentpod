import { describe, it, expect } from "bun:test";
import { Station } from "./station";

it("Station accepts an optional nullable matrixId", () => {
  expect(Station.parse({ key:"k", harness:"hermes", kind:"leaf", displayName:"d", parentKey:null, workspacePath:null, capabilities:[], matrixId:"@a:id.agentpod.dev" }).matrixId).toBe("@a:id.agentpod.dev");
  expect(Station.parse({ key:"k", harness:"hermes", kind:"leaf", displayName:"d", parentKey:null, workspacePath:null, capabilities:[] }).matrixId).toBeUndefined();
  expect(Station.parse({ key:"k", harness:"hermes", kind:"leaf", displayName:"d", parentKey:null, workspacePath:null, capabilities:[], matrixId:null }).matrixId).toBeNull();
});
