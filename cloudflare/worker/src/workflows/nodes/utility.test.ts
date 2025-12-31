import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { waitExecutor, errorHandlerExecutor } from "./utility";
import type { NodeExecutionParams } from "../utils/context";

function createParams(parameters: Record<string, unknown>, context?: Partial<NodeExecutionParams["context"]>): NodeExecutionParams {
  return {
    nodeId: "utility-1",
    nodeName: "Utility",
    nodeType: "utility",
    parameters,
    context: {
      trigger: context?.trigger ?? { type: "manual", data: {}, timestamp: new Date() },
      steps: context?.steps ?? {},
      env: {} as NodeExecutionParams["context"]["env"],
      ...context,
    },
  };
}

describe("waitExecutor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("validation", () => {
    it("requires duration", () => {
      const errors = waitExecutor.validate!({});
      expect(errors).toContain("Duration is required");
    });

    it("rejects negative duration", () => {
      const errors = waitExecutor.validate!({ duration: "-1 second" });
      expect(errors).toContain("Duration must be a positive value");
    });

    it("rejects duration over 24 hours", () => {
      const errors = waitExecutor.validate!({ duration: "25 hours" });
      expect(errors).toContain("Duration cannot exceed 24 hours");
    });

    it("passes with valid duration", () => {
      const errors = waitExecutor.validate!({ duration: "5 seconds" });
      expect(errors).toHaveLength(0);
    });
  });

  describe("duration parsing", () => {
    it("parses milliseconds", async () => {
      const promise = waitExecutor.execute(createParams({ duration: "100ms" }));
      vi.advanceTimersByTime(100);
      const result = await promise;

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).waitedMs).toBe(100);
    });

    it("parses seconds", async () => {
      const promise = waitExecutor.execute(createParams({ duration: "5 seconds" }));
      vi.advanceTimersByTime(5000);
      const result = await promise;

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).waitedMs).toBe(5000);
    });

    it("parses minutes", async () => {
      const promise = waitExecutor.execute(createParams({ duration: "2 minutes" }));
      vi.advanceTimersByTime(120000);
      const result = await promise;

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).waitedMs).toBe(120000);
    });

    it("parses hours", async () => {
      const promise = waitExecutor.execute(createParams({ duration: "1 hour" }));
      vi.advanceTimersByTime(3600000);
      const result = await promise;

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).waitedMs).toBe(3600000);
    });

    it("parses days", async () => {
      const promise = waitExecutor.execute(createParams({ duration: "0.5 days" }));
      vi.advanceTimersByTime(12 * 60 * 60 * 1000);
      const result = await promise;

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).waitedMs).toBe(12 * 60 * 60 * 1000);
    });

    it("parses short forms (s, m, h)", async () => {
      const promise = waitExecutor.execute(createParams({ duration: "3s" }));
      vi.advanceTimersByTime(3000);
      const result = await promise;

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).waitedMs).toBe(3000);
    });

    it("handles numeric string as milliseconds", async () => {
      const promise = waitExecutor.execute(createParams({ duration: "500" }));
      vi.advanceTimersByTime(500);
      const result = await promise;

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).waitedMs).toBe(500);
    });
  });

  describe("execution", () => {
    it("returns timestamps", async () => {
      const promise = waitExecutor.execute(createParams({ duration: "1s" }));
      vi.advanceTimersByTime(1000);
      const result = await promise;

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).startedAt).toBeDefined();
      expect((result.data as Record<string, unknown>).resumedAt).toBeDefined();
    });

    it("returns error for invalid duration", async () => {
      const result = await waitExecutor.execute(createParams({ duration: "invalid" }));

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid duration");
    });

    it("returns error for duration over 24 hours", async () => {
      const result = await waitExecutor.execute(createParams({ duration: "25 hours" }));

      expect(result.success).toBe(false);
      expect(result.error).toContain("cannot exceed 24 hours");
    });
  });
});

describe("errorHandlerExecutor", () => {
  describe("validation", () => {
    it("accepts valid onError modes", () => {
      expect(errorHandlerExecutor.validate!({ onError: "continue" })).toHaveLength(0);
      expect(errorHandlerExecutor.validate!({ onError: "stop" })).toHaveLength(0);
      expect(errorHandlerExecutor.validate!({ onError: "retry" })).toHaveLength(0);
      expect(errorHandlerExecutor.validate!({ onError: "fallback" })).toHaveLength(0);
    });

    it("rejects invalid onError mode", () => {
      const errors = errorHandlerExecutor.validate!({ onError: "invalid" });
      expect(errors).toContain("onError must be one of: continue, stop, retry, fallback");
    });

    it("requires positive maxRetries for retry mode", () => {
      const errors = errorHandlerExecutor.validate!({ onError: "retry", maxRetries: 0 });
      expect(errors).toContain("maxRetries must be a positive number");
    });
  });

  describe("no error case", () => {
    it("passes through when no errors exist", async () => {
      const result = await errorHandlerExecutor.execute(createParams(
        { onError: "continue" },
        {
          steps: {
            "step-1": { success: true, data: { result: "ok" } },
          },
        }
      ));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).handled).toBe(false);
      expect((result.data as Record<string, unknown>).reason).toBe("no_error");
    });
  });

  describe("continue mode", () => {
    it("continues workflow on error", async () => {
      const result = await errorHandlerExecutor.execute(createParams(
        { onError: "continue" },
        {
          steps: {
            "step-1": { success: false, error: "Something went wrong" },
          },
        }
      ));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).handled).toBe(true);
      expect((result.data as Record<string, unknown>).action).toBe("continue");
      expect((result.data as Record<string, unknown>).error).toBe("Something went wrong");
    });
  });

  describe("stop mode", () => {
    it("stops workflow on error", async () => {
      const result = await errorHandlerExecutor.execute(createParams(
        { onError: "stop" },
        {
          steps: {
            "step-1": { success: false, error: "Critical failure" },
          },
        }
      ));

      expect(result.success).toBe(false);
      expect(result.error).toContain("Workflow stopped due to error");
      expect(result.error).toContain("Critical failure");
    });
  });

  describe("retry mode", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("signals retry when under max retries", async () => {
      const promise = errorHandlerExecutor.execute(createParams(
        { onError: "retry", maxRetries: 3, retryDelay: "100ms" },
        {
          steps: {
            "step-1": { success: false, error: "Temporary failure" },
          },
        }
      ));

      vi.advanceTimersByTime(100);
      const result = await promise;

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).action).toBe("retry");
      expect((result.data as Record<string, unknown>).shouldRetry).toBe(true);
    });

    it("signals exhausted after max retries", async () => {
      const params = createParams(
        { onError: "retry", maxRetries: 1 },
        {
          steps: {
            "utility-1": { success: false, error: "Failed", attempts: 1 },
            "step-1": { success: false, error: "Persistent failure" },
          },
        }
      );

      const result = await errorHandlerExecutor.execute(params);

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).action).toBe("exhausted");
      expect((result.data as Record<string, unknown>).shouldRetry).toBe(false);
    });
  });

  describe("fallback mode", () => {
    it("returns fallback value on error", async () => {
      const fallbackValue = { default: "value", status: "fallback" };
      const result = await errorHandlerExecutor.execute(createParams(
        { onError: "fallback", fallbackValue },
        {
          steps: {
            "step-1": { success: false, error: "API unavailable" },
          },
        }
      ));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).action).toBe("fallback");
      expect((result.data as Record<string, unknown>).fallbackValue).toEqual(fallbackValue);
    });

    it("returns null fallback by default", async () => {
      const result = await errorHandlerExecutor.execute(createParams(
        { onError: "fallback" },
        {
          steps: {
            "step-1": { success: false, error: "Error" },
          },
        }
      ));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).fallbackValue).toBeNull();
    });
  });

  describe("errorPath", () => {
    it("finds error from custom path", async () => {
      const result = await errorHandlerExecutor.execute(createParams(
        { onError: "continue", errorPath: "steps.specific-step.error" },
        {
          steps: {
            "other-step": { success: true, data: {} },
            "specific-step": { success: false, error: "Specific error" },
          },
        }
      ));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).error).toBe("Specific error");
    });
  });

  describe("errorNodeId tracking", () => {
    it("returns the ID of the failed node", async () => {
      const result = await errorHandlerExecutor.execute(createParams(
        { onError: "continue" },
        {
          steps: {
            "step-1": { success: true, data: {} },
            "step-2": { success: false, error: "Failed here" },
            "step-3": { success: true, data: {} },
          },
        }
      ));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).errorNodeId).toBe("step-2");
    });
  });
});
