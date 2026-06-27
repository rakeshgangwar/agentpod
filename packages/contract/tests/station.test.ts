import { test, expect } from "bun:test";
import { Station, StationHealth, FsEntry, Capability } from "../src/index";
test("Station parses with a capability list", () => {
  const s = Station.parse({ key:"hermes:coder-kai", harness:"hermes", kind:"composite",
    displayName:"coder-kai", parentKey:"hermes", workspacePath:"/root/.hermes/profiles/coder-kai",
    capabilities:["health","logs","fs.read"] });
  expect(s.capabilities).toContain("logs");
});
test("Capability rejects an unknown verb", () => {
  expect(() => Capability.parse("exec")).toThrow();
});
test("FsEntry requires a type of file|dir", () => {
  expect(() => FsEntry.parse({ name:"x", path:"/x", type:"socket", size:null, modified:null })).toThrow();
});
