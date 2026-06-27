import { test, expect } from "bun:test";
import { GatewayServerMessage, GatewayClientMessage, RequestMsg, StreamMsg } from "../src/index";
test("server→node union includes req", () => {
  const m = GatewayServerMessage.parse({ type:"req", id:"r1", verb:"detect", params:{} });
  expect(m.type).toBe("req");
});
test("node→hub union includes stream + res, still accepts heartbeat", () => {
  expect(GatewayClientMessage.parse({ type:"stream", id:"r1", seq:0, chunk:"x", eof:false }).type).toBe("stream");
  expect(GatewayClientMessage.parse({ type:"res", id:"r1", ok:true, data:[] }).type).toBe("res");
  expect(GatewayClientMessage.parse({ type:"heartbeat", ts:1 }).type).toBe("heartbeat");
});
test("RequestMsg requires id+verb", () => {
  expect(() => RequestMsg.parse({ type:"req", verb:"detect", params:{} })).toThrow();
});
test("GatewayClientMessage accepts terminal eof stream frame with chunk:null", () => {
  const m = GatewayClientMessage.parse({ type:"stream", id:"r1", seq:5, chunk:null, eof:true });
  expect(m.type).toBe("stream");
  if (m.type === "stream") {
    expect(m.chunk).toBeNull();
    expect(m.eof).toBe(true);
  }
});
