import "../setup.ts";

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { rawSql } from "../../src/db/drizzle";
import { createTestUser } from "../helpers/database";
import { app } from "../../src/index.ts";

const AUTH_HEADER = { Authorization: "Bearer test-token" };
const JSON_HEADERS = { ...AUTH_HEADER, "Content-Type": "application/json" };
const TEST_USER_ID = "default-user"; // Must match what auth middleware resolves test-token to

async function cleanupTestData() {
  await rawSql`DELETE FROM workflow_step_logs`;
  await rawSql`DELETE FROM workflow_executions`;
  await rawSql`DELETE FROM workflow_webhooks`;
  await rawSql`DELETE FROM workflows`;
}

function createTestWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test Workflow",
    description: "A test workflow",
    nodes: [
      {
        id: "trigger-1",
        name: "Start Trigger",
        type: "manual-trigger",
        position: [0, 0],
        parameters: {},
      },
      {
        id: "http-1",
        name: "API Call",
        type: "http-request",
        position: [200, 0],
        parameters: { url: "https://api.example.com" },
      },
    ],
    connections: {
      "trigger-1": {
        main: [[{ node: "http-1", type: "main", index: 0 }]],
      },
    },
    ...overrides,
  };
}

describe("Workflow Routes Integration Tests", () => {
  beforeAll(async () => {
    await createTestUser({
      id: TEST_USER_ID,
      email: "workflow-test@example.com",
      name: "Workflow Test User",
    });
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  describe("Authentication", () => {
    test("should return 401 without auth header", async () => {
      const res = await app.request("/api/workflows");
      expect(res.status).toBe(401);
    });

    test("should return 401 with invalid token", async () => {
      const res = await app.request("/api/workflows", {
        headers: { Authorization: "Bearer invalid-token" },
      });
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/workflows", () => {
    test("should create a workflow with valid data", async () => {
      const workflow = createTestWorkflow();

      const res = await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(workflow),
      });

      expect(res.status).toBe(201);
      const data = await res.json();

      expect(data.workflow).toBeDefined();
      expect(data.workflow.id).toBeDefined();
      expect(data.workflow.name).toBe("Test Workflow");
      expect(data.workflow.nodes).toHaveLength(2);
      expect(data.workflow.active).toBe(false);
    });

    test("should return 400 without name", async () => {
      const workflow = createTestWorkflow({ name: undefined });

      const res = await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(workflow),
      });

      expect(res.status).toBe(400);
    });

    test("should return 400 without nodes", async () => {
      const workflow = createTestWorkflow({ nodes: undefined });

      const res = await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(workflow),
      });

      expect(res.status).toBe(400);
    });

    test("should return 400 with empty nodes array", async () => {
      const workflow = createTestWorkflow({ nodes: [] });

      const res = await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(workflow),
      });

      expect(res.status).toBe(400);
    });

    test("should return 400 without trigger node", async () => {
      const workflow = createTestWorkflow({
        nodes: [
          {
            id: "http-1",
            name: "HTTP",
            type: "http-request",
            position: [0, 0],
            parameters: {},
          },
        ],
      });

      const res = await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(workflow),
      });

      expect(res.status).toBe(400);
    });

    test("should prevent duplicate workflow names for same user", async () => {
      const workflow = createTestWorkflow();

      await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(workflow),
      });

      const res = await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(workflow),
      });

      expect(res.status).toBe(409);
    });
  });

  describe("GET /api/workflows", () => {
    test("should list workflows for authenticated user", async () => {
      await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(createTestWorkflow({ name: "Workflow 1" })),
      });
      await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(createTestWorkflow({ name: "Workflow 2" })),
      });

      const res = await app.request("/api/workflows", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.workflows).toBeDefined();
      expect(data.workflows).toHaveLength(2);
      expect(data.total).toBe(2);
    });

    test("should return empty list when no workflows", async () => {
      const res = await app.request("/api/workflows", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.workflows).toEqual([]);
      expect(data.total).toBe(0);
    });

    test("should support pagination", async () => {
      for (let i = 1; i <= 5; i++) {
        await app.request("/api/workflows", {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify(createTestWorkflow({ name: `Workflow ${i}` })),
        });
      }

      const res = await app.request("/api/workflows?page=1&limit=2", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.workflows).toHaveLength(2);
      expect(data.total).toBe(5);
      expect(data.page).toBe(1);
      expect(data.limit).toBe(2);
    });

    test("should filter by active status", async () => {
      const workflow1 = await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(createTestWorkflow({ name: "Active Workflow" })),
      });
      const wf1Data = await workflow1.json();

      await app.request(`/api/workflows/${wf1Data.workflow.id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ active: true }),
      });

      await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(createTestWorkflow({ name: "Inactive Workflow" })),
      });

      const res = await app.request("/api/workflows?active=true", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.workflows).toHaveLength(1);
      expect(data.workflows[0].name).toBe("Active Workflow");
    });
  });

  describe("GET /api/workflows/:id", () => {
    test("should get workflow by id", async () => {
      const createRes = await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(createTestWorkflow()),
      });
      const created = await createRes.json();

      const res = await app.request(`/api/workflows/${created.workflow.id}`, {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.workflow.id).toBe(created.workflow.id);
      expect(data.workflow.name).toBe("Test Workflow");
    });

    test("should return 404 for non-existent workflow", async () => {
      const res = await app.request("/api/workflows/non-existent-id", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/workflows/:id", () => {
    test("should update workflow name", async () => {
      const createRes = await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(createTestWorkflow()),
      });
      const created = await createRes.json();

      const res = await app.request(`/api/workflows/${created.workflow.id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name: "Updated Name" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.workflow.name).toBe("Updated Name");
    });

    test("should update workflow active status", async () => {
      const createRes = await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(createTestWorkflow()),
      });
      const created = await createRes.json();

      const res = await app.request(`/api/workflows/${created.workflow.id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ active: true }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.workflow.active).toBe(true);
    });

    test("should update workflow nodes", async () => {
      const createRes = await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(createTestWorkflow()),
      });
      const created = await createRes.json();

      const newNodes = [
        {
          id: "trigger-1",
          name: "New Trigger",
          type: "webhook-trigger",
          position: [0, 0],
          parameters: {},
        },
      ];

      const res = await app.request(`/api/workflows/${created.workflow.id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ nodes: newNodes, connections: {} }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.workflow.nodes).toHaveLength(1);
      expect(data.workflow.nodes[0].name).toBe("New Trigger");
    });

    test("should increment version on update", async () => {
      const createRes = await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(createTestWorkflow()),
      });
      const created = await createRes.json();

      expect(created.workflow.version).toBe(1);

      const res = await app.request(`/api/workflows/${created.workflow.id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name: "Updated" }),
      });
      const updated = await res.json();

      expect(updated.workflow.version).toBe(2);
    });

    test("should return 404 for non-existent workflow", async () => {
      const res = await app.request("/api/workflows/non-existent-id", {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name: "Updated" }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/workflows/:id", () => {
    test("should delete workflow", async () => {
      const createRes = await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(createTestWorkflow()),
      });
      const created = await createRes.json();

      const res = await app.request(`/api/workflows/${created.workflow.id}`, {
        method: "DELETE",
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const getRes = await app.request(`/api/workflows/${created.workflow.id}`, {
        headers: AUTH_HEADER,
      });
      expect(getRes.status).toBe(404);
    });

    test("should return 404 for non-existent workflow", async () => {
      const res = await app.request("/api/workflows/non-existent-id", {
        method: "DELETE",
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/workflows/:id/execute", () => {
    test("should execute workflow and return execution id", async () => {
      const createRes = await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(createTestWorkflow()),
      });
      const created = await createRes.json();

      const res = await app.request(`/api/workflows/${created.workflow.id}/execute`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(202);
      const data = await res.json();

      expect(data.execution).toBeDefined();
      expect(data.execution.id).toBeDefined();
      expect(data.execution.workflowId).toBe(created.workflow.id);
      expect(data.execution.status).toBe("queued");
    });

    test("should accept trigger data", async () => {
      const createRes = await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(createTestWorkflow()),
      });
      const created = await createRes.json();

      const triggerData = { input: "test value" };

      const res = await app.request(`/api/workflows/${created.workflow.id}/execute`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ triggerData }),
      });

      expect(res.status).toBe(202);
      const data = await res.json();

      expect(data.execution.triggerData).toEqual(triggerData);
    });

    test("should return 404 for non-existent workflow", async () => {
      const res = await app.request("/api/workflows/non-existent-id/execute", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/workflows/:id/executions", () => {
    test("should list executions for workflow", async () => {
      const createRes = await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(createTestWorkflow()),
      });
      const created = await createRes.json();

      await app.request(`/api/workflows/${created.workflow.id}/execute`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({}),
      });
      await app.request(`/api/workflows/${created.workflow.id}/execute`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({}),
      });

      const res = await app.request(`/api/workflows/${created.workflow.id}/executions`, {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.executions).toHaveLength(2);
      expect(data.total).toBe(2);
    });

    test("should return empty list for workflow with no executions", async () => {
      const createRes = await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(createTestWorkflow()),
      });
      const created = await createRes.json();

      const res = await app.request(`/api/workflows/${created.workflow.id}/executions`, {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.executions).toEqual([]);
      expect(data.total).toBe(0);
    });
  });

  describe("GET /api/workflows/executions/:executionId", () => {
    test("should get execution details", async () => {
      const createRes = await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(createTestWorkflow()),
      });
      const created = await createRes.json();

      const execRes = await app.request(`/api/workflows/${created.workflow.id}/execute`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({}),
      });
      const execution = await execRes.json();

      const res = await app.request(`/api/workflows/executions/${execution.execution.id}`, {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.execution.id).toBe(execution.execution.id);
      expect(data.execution.workflowId).toBe(created.workflow.id);
    });

    test("should return 404 for non-existent execution", async () => {
      const res = await app.request("/api/workflows/executions/non-existent-id", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/workflows/:id/validate", () => {
    test("should validate a valid workflow", async () => {
      const createRes = await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(createTestWorkflow()),
      });
      const created = await createRes.json();

      const res = await app.request(`/api/workflows/${created.workflow.id}/validate`, {
        method: "POST",
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.valid).toBe(true);
      expect(data.errors).toHaveLength(0);
    });

    test("should return validation errors for invalid workflow", async () => {
      const workflow = createTestWorkflow({
        nodes: [
          {
            id: "trigger-1",
            name: "Trigger",
            type: "manual-trigger",
            position: [0, 0],
            parameters: {},
          },
          {
            id: "orphan-1",
            name: "Orphan Node",
            type: "http-request",
            position: [400, 0],
            parameters: {},
          },
        ],
        connections: {},
      });

      const createRes = await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(workflow),
      });
      const created = await createRes.json();

      const res = await app.request(`/api/workflows/${created.workflow.id}/validate`, {
        method: "POST",
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("POST /api/workflows/:id/duplicate", () => {
    test("should duplicate workflow with new name", async () => {
      const createRes = await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(createTestWorkflow()),
      });
      const created = await createRes.json();

      const res = await app.request(`/api/workflows/${created.workflow.id}/duplicate`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name: "Duplicated Workflow" }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();

      expect(data.workflow.id).not.toBe(created.workflow.id);
      expect(data.workflow.name).toBe("Duplicated Workflow");
      expect(data.workflow.nodes).toEqual(created.workflow.nodes);
      expect(data.workflow.forkedFromId).toBe(created.workflow.id);
    });

    test("should auto-generate name if not provided", async () => {
      const createRes = await app.request("/api/workflows", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(createTestWorkflow()),
      });
      const created = await createRes.json();

      const res = await app.request(`/api/workflows/${created.workflow.id}/duplicate`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(201);
      const data = await res.json();

      expect(data.workflow.name).toContain("Copy");
    });
  });
});
