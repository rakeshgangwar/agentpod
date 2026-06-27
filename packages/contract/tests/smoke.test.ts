import { test, expect } from "bun:test";
import { CONTRACT_VERSION } from "../src/index";

test("contract exposes a version", () => {
  expect(CONTRACT_VERSION).toBe("0.0.1");
});
