# Workflow Nodes Catalog

> **Purpose:** Blueprint for frontend NodeTypeRegistry, PropertiesPanel forms, and backend executors
> **Created:** December 2025
> **Total Nodes:** 32 (11 implemented, 21 planned)

---

## Table of Contents

1. [Implementation Status Summary](#implementation-status-summary)
2. [Node Categories](#node-categories)
3. [Triggers](#triggers)
4. [HTTP/API](#httpapi)
5. [Logic & Flow Control](#logic--flow-control)
6. [Data Transform](#data-transform)
7. [AI & Machine Learning](#ai--machine-learning)
8. [Code Execution](#code-execution)
9. [Notifications](#notifications)
10. [Storage & Files](#storage--files)
11. [Database](#database)
12. [Utility](#utility)

---

## Implementation Status Summary

| Status | Count | Description |
|--------|-------|-------------|
| **Implemented** | 11 | Full backend executor + frontend support |
| **Planned** | 15 | High priority, will implement soon |
| **Future** | 6 | Lower priority, for later phases |

### Currently Implemented Nodes

| Node Type | Category | Backend | Frontend |
|-----------|----------|---------|----------|
| `manual-trigger` | Trigger | `trigger.ts` | `TriggerNode.svelte` |
| `webhook-trigger` | Trigger | `trigger.ts` | `TriggerNode.svelte` |
| `schedule-trigger` | Trigger | `trigger.ts` | `TriggerNode.svelte` |
| `http-request` | HTTP/API | `http.ts` | `ActionNode.svelte` |
| `condition` | Logic | `condition.ts` | `ConditionNode.svelte` |
| `switch` | Logic | `condition.ts` | `ConditionNode.svelte` |
| `javascript` | Code | `code.ts` | `ActionNode.svelte` |
| `merge` | Logic | `code.ts` | `ActionNode.svelte` |
| `loop` | Logic | `code.ts` | `ActionNode.svelte` |
| `ai-agent` | AI | `ai-agent.ts` | `AIAgentNode.svelte` |
| `ai-prompt` | AI | `ai-agent.ts` | `AIAgentNode.svelte` |

---

## Node Categories

| Category | Icon | Color | Description |
|----------|------|-------|-------------|
| `trigger` | `Zap` | Orange | Start workflow execution |
| `http` | `Globe` | Blue | HTTP requests and webhooks |
| `logic` | `GitBranch` | Purple | Flow control and branching |
| `transform` | `ArrowRightLeft` | Teal | Data manipulation |
| `ai` | `Bot` | Violet | AI/ML operations |
| `code` | `Code` | Gray | Custom code execution |
| `notification` | `Bell` | Yellow | Alerts and messaging |
| `storage` | `HardDrive` | Green | File and object storage |
| `database` | `Database` | Indigo | Database operations |
| `utility` | `Wrench` | Slate | Helper utilities |

---

## Triggers

### manual-trigger

**Display Name:** Manual Trigger
**Icon:** `Play`
**Status:** Implemented
**Description:** Start workflow manually from the UI

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `inputData` | `object` | No | `{}` | Data to pass to workflow |

**Outputs:**
```typescript
{
  triggered: boolean;
  triggerType: "manual";
  timestamp: string;
  data: object;
}
```

**Example Use Case:** Testing workflows, one-off executions

---

### webhook-trigger

**Display Name:** Webhook Trigger
**Icon:** `Webhook`
**Status:** Implemented
**Description:** Trigger workflow via HTTP webhook

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `path` | `string` | No | Auto-generated | Webhook URL path |
| `method` | `enum` | No | `POST` | HTTP method to accept |
| `authentication` | `object` | No | `none` | Auth configuration |

**Authentication Options:**
- `none` - No authentication
- `header` - Require specific header value
- `basic` - HTTP Basic Auth

**Outputs:**
```typescript
{
  triggered: boolean;
  triggerType: "webhook";
  method: string;
  headers: Record<string, string>;
  body: unknown;
  query: Record<string, string>;
}
```

**Example Use Case:** GitHub webhooks, Stripe events, API integrations

---

### schedule-trigger

**Display Name:** Schedule Trigger
**Icon:** `Clock`
**Status:** Implemented
**Description:** Run workflow on a schedule (cron)

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `cron` | `string` | Yes | - | Cron expression |
| `timezone` | `string` | No | `UTC` | IANA timezone |

**Outputs:**
```typescript
{
  triggered: boolean;
  triggerType: "schedule";
  cron: string;
  scheduledTime: string;
}
```

**Example Use Case:** Daily reports, periodic data sync, cleanup jobs

---

### event-trigger

**Display Name:** Event Trigger
**Icon:** `Radio`
**Status:** Planned
**Description:** Listen for custom events from other workflows or systems

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `eventType` | `string` | Yes | - | Event type to listen for |
| `filter` | `object` | No | - | Filter conditions |
| `timeout` | `string` | No | `24h` | Max wait time |

**Outputs:**
```typescript
{
  triggered: boolean;
  triggerType: "event";
  eventType: string;
  eventData: unknown;
}
```

**Example Use Case:** Chained workflows, pub/sub patterns

---

## HTTP/API

### http-request

**Display Name:** HTTP Request
**Icon:** `Globe`
**Status:** Implemented
**Description:** Make HTTP requests to external APIs

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `url` | `string` | Yes | - | Request URL |
| `method` | `enum` | No | `GET` | HTTP method |
| `headers` | `object` | No | `{}` | Request headers |
| `body` | `any` | No | - | Request body |
| `authentication` | `object` | No | `none` | Auth config |
| `responseType` | `enum` | No | `json` | Expected response type |
| `timeout` | `number` | No | `30000` | Timeout in ms |

**Authentication Types:**
- `none` - No authentication
- `bearer` - Bearer token
- `basic` - Username/password
- `api-key` - Custom header

**Outputs:**
```typescript
{
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
  ok: boolean;
}
```

**Example Use Case:** REST API calls, fetching data, sending notifications

---

### http-response

**Display Name:** HTTP Response
**Icon:** `Send`
**Status:** Planned
**Description:** Send custom HTTP response (for webhook-triggered workflows)

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `statusCode` | `number` | No | `200` | HTTP status code |
| `headers` | `object` | No | `{}` | Response headers |
| `body` | `any` | No | - | Response body |

**Example Use Case:** Custom webhook responses, API endpoints

---

### graphql-request

**Display Name:** GraphQL Request
**Icon:** `Braces`
**Status:** Future
**Description:** Execute GraphQL queries and mutations

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `endpoint` | `string` | Yes | - | GraphQL endpoint URL |
| `query` | `string` | Yes | - | GraphQL query/mutation |
| `variables` | `object` | No | `{}` | Query variables |
| `headers` | `object` | No | `{}` | Request headers |

**Example Use Case:** GitHub GraphQL API, Hasura, Contentful

---

## Logic & Flow Control

### condition

**Display Name:** Condition (If/Else)
**Icon:** `GitBranch`
**Status:** Implemented
**Description:** Branch workflow based on conditions

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `conditions` | `array` | Yes | - | List of conditions to evaluate |
| `defaultBranch` | `string` | No | `default` | Branch if no conditions match |
| `mode` | `enum` | No | `first` | `first` or `all` matching |

**Condition Object:**
```typescript
{
  field: string;      // e.g., "steps.http-123.data.status"
  operator: string;   // equals, contains, greaterThan, etc.
  value: unknown;     // comparison value
  outputBranch: string; // branch name
}
```

**Operators:**
- `equals`, `notEquals`
- `contains`, `notContains`
- `startsWith`, `endsWith`
- `greaterThan`, `lessThan`, `greaterThanOrEqual`, `lessThanOrEqual`
- `isEmpty`, `isNotEmpty`
- `isTrue`, `isFalse`
- `regex`

**Outputs:**
```typescript
{
  branch: string;
  matched: boolean;
  matchedCondition?: object;
}
```

**Example Use Case:** Route based on API response, error handling branches

---

### switch

**Display Name:** Switch
**Icon:** `Route`
**Status:** Implemented
**Description:** Multi-way branching based on value

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `field` | `string` | Yes | - | Field to switch on |
| `cases` | `array` | Yes | - | Case definitions |
| `defaultCase` | `string` | No | `default` | Default branch |

**Case Object:**
```typescript
{
  value: unknown;
  outputBranch: string;
}
```

**Outputs:**
```typescript
{
  branch: string;
  matched: boolean;
  value: unknown;
  matchedCase?: unknown;
}
```

**Example Use Case:** Route by status code, handle different event types

---

### loop

**Display Name:** Loop (For Each)
**Icon:** `Repeat`
**Status:** Implemented
**Description:** Iterate over array items

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `items` | `array` | No | - | Direct array input |
| `itemsPath` | `string` | No | - | Path to array in context |
| `batchSize` | `number` | No | `1` | Items per batch |

**Outputs:**
```typescript
{
  totalItems: number;
  batchCount: number;
  batchSize: number;
  batches: unknown[][];
  items: unknown[];
}
```

**Example Use Case:** Process list of users, batch API calls

---

### merge

**Display Name:** Merge
**Icon:** `GitMerge`
**Status:** Implemented
**Description:** Join parallel branches

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `mode` | `enum` | No | `wait` | `wait` for all or `first` to complete |
| `inputCount` | `number` | No | `2` | Expected number of inputs |

**Outputs:**
```typescript
{
  merged: boolean;
  data: Record<string, unknown>;
  inputCount: number;
}
```

**Example Use Case:** Combine results from parallel API calls

---

### filter

**Display Name:** Filter
**Icon:** `Filter`
**Status:** Planned
**Description:** Filter array items based on conditions

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `items` | `array` | No | - | Direct array input |
| `itemsPath` | `string` | No | - | Path to array |
| `conditions` | `array` | Yes | - | Filter conditions |

**Outputs:**
```typescript
{
  items: unknown[];
  originalCount: number;
  filteredCount: number;
}
```

**Example Use Case:** Filter active users, remove nulls

---

### split

**Display Name:** Split
**Icon:** `Split`
**Status:** Planned
**Description:** Split single input into multiple parallel branches

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `branches` | `number` | No | `2` | Number of output branches |

**Example Use Case:** Parallel processing, fan-out patterns

---

## Data Transform

### set-variable

**Display Name:** Set Variable
**Icon:** `Variable`
**Status:** Planned
**Description:** Set or modify workflow variables

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `variables` | `array` | Yes | - | Variables to set |

**Variable Object:**
```typescript
{
  name: string;
  value: unknown;
  type?: "string" | "number" | "boolean" | "object" | "array";
}
```

**Example Use Case:** Store computed values, accumulate results

---

### transform

**Display Name:** Transform Data
**Icon:** `ArrowRightLeft`
**Status:** Planned
**Description:** Transform data structure using mapping

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `input` | `string` | Yes | - | Input data path |
| `mapping` | `object` | Yes | - | Field mappings |
| `mode` | `enum` | No | `map` | `map`, `pick`, `omit` |

**Outputs:**
```typescript
{
  data: unknown;
  fieldsTransformed: number;
}
```

**Example Use Case:** Reshape API response, rename fields

---

### parse-json

**Display Name:** Parse JSON
**Icon:** `FileJson`
**Status:** Planned
**Description:** Parse JSON string to object

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `input` | `string` | Yes | - | JSON string or path |
| `errorHandling` | `enum` | No | `error` | `error` or `default` |
| `defaultValue` | `any` | No | `null` | Value on parse error |

**Example Use Case:** Parse webhook body, handle stringified data

---

### aggregate

**Display Name:** Aggregate
**Icon:** `Calculator`
**Status:** Planned
**Description:** Aggregate array data (sum, avg, count, etc.)

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `items` | `string` | Yes | - | Path to array |
| `operations` | `array` | Yes | - | Aggregation operations |

**Operations:**
- `count` - Count items
- `sum` - Sum numeric field
- `avg` - Average numeric field
- `min` / `max` - Min/max values
- `first` / `last` - First/last item
- `concat` - Concatenate arrays

**Example Use Case:** Calculate order totals, get statistics

---

## AI & Machine Learning

### ai-agent

**Display Name:** AI Agent
**Icon:** `Bot`
**Status:** Implemented
**Description:** Execute AI agent in Cloudflare Sandbox

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `prompt` | `string` | Yes | - | Agent instruction |
| `model` | `object` | No | - | Model configuration |
| `sandboxConfig` | `object` | No | - | Sandbox settings |
| `timeout` | `string` | No | `5 minutes` | Execution timeout |

**Model Object:**
```typescript
{
  providerId: string;  // "anthropic", "openai", "google"
  modelId: string;     // "claude-sonnet-4-20250514"
}
```

**Sandbox Config:**
```typescript
{
  gitUrl?: string;      // Clone repository
  workspaceId?: string; // Use existing workspace
  directory?: string;   // Working directory
}
```

**Outputs:**
```typescript
{
  sessionId: string;
  sandboxId: string;
  response: string;
  parts: unknown[];
}
```

**Example Use Case:** Code generation, complex reasoning, multi-step tasks

---

### ai-prompt

**Display Name:** AI Prompt
**Icon:** `MessageSquare`
**Status:** Implemented (Stub)
**Description:** Direct LLM call without sandbox

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `prompt` | `string` | Yes | - | Prompt text |
| `model` | `object` | No | - | Model configuration |
| `temperature` | `number` | No | `0.7` | Creativity (0-1) |
| `maxTokens` | `number` | No | `1024` | Max response tokens |
| `systemPrompt` | `string` | No | - | System instruction |

**Outputs:**
```typescript
{
  response: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
}
```

**Example Use Case:** Quick text generation, classification, extraction

---

### ai-classify

**Display Name:** AI Classifier
**Icon:** `Tags`
**Status:** Planned
**Description:** Classify text into categories

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `input` | `string` | Yes | - | Text to classify |
| `categories` | `array` | Yes | - | Category definitions |
| `multiLabel` | `boolean` | No | `false` | Allow multiple labels |

**Category Object:**
```typescript
{
  name: string;
  description: string;
  examples?: string[];
}
```

**Outputs:**
```typescript
{
  category: string;
  confidence: number;
  allScores: Record<string, number>;
}
```

**Example Use Case:** Sentiment analysis, ticket routing, content moderation

---

### ai-extract

**Display Name:** AI Extract
**Icon:** `FileSearch`
**Status:** Planned
**Description:** Extract structured data from text

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `input` | `string` | Yes | - | Text to extract from |
| `schema` | `object` | Yes | - | JSON Schema for output |
| `instructions` | `string` | No | - | Additional instructions |

**Outputs:**
```typescript
{
  data: object;  // Matches schema
  confidence: number;
}
```

**Example Use Case:** Parse emails, extract entities, structured data from unstructured

---

### embeddings

**Display Name:** Generate Embeddings
**Icon:** `Binary`
**Status:** Future
**Description:** Generate vector embeddings for text

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `input` | `string` | Yes | - | Text to embed |
| `model` | `string` | No | - | Embedding model |

**Outputs:**
```typescript
{
  embedding: number[];
  dimensions: number;
}
```

**Example Use Case:** Semantic search, similarity matching

---

### vector-search

**Display Name:** Vector Search
**Icon:** `Search`
**Status:** Future
**Description:** Search Vectorize index

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `query` | `string` | Yes | - | Search query |
| `index` | `string` | Yes | - | Vectorize index name |
| `topK` | `number` | No | `10` | Results to return |
| `filter` | `object` | No | - | Metadata filters |

**Outputs:**
```typescript
{
  results: Array<{
    id: string;
    score: number;
    metadata: object;
  }>;
}
```

**Example Use Case:** RAG retrieval, semantic search, recommendations

---

## Code Execution

### javascript

**Display Name:** JavaScript Code
**Icon:** `Code`
**Status:** Implemented
**Description:** Execute custom JavaScript code

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `code` | `string` | Yes | - | JavaScript code |
| `inputs` | `object` | No | `{}` | Input mappings |

**Available Context:**
- `trigger` - Trigger data
- `steps` - Previous step results
- `inputs` - Mapped inputs
- `console` - Logging

**Code Template:**
```javascript
// Access previous step data
const httpData = steps['http-request-123'].data;

// Transform and return
return {
  processed: true,
  count: httpData.items.length
};
```

**Outputs:**
```typescript
{
  output: unknown;
  executedAt: string;
}
```

**Example Use Case:** Custom logic, data transformation, calculations

---

### python

**Display Name:** Python Code
**Icon:** `FileCode`
**Status:** Future
**Description:** Execute Python code in sandbox

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `code` | `string` | Yes | - | Python code |
| `inputs` | `object` | No | `{}` | Input mappings |
| `packages` | `array` | No | `[]` | pip packages to install |

**Example Use Case:** Data science, ML inference, complex computations

---

## Notifications

### email

**Display Name:** Send Email
**Icon:** `Mail`
**Status:** Planned
**Description:** Send email via SMTP or provider

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `to` | `string` | Yes | - | Recipient(s) |
| `subject` | `string` | Yes | - | Email subject |
| `body` | `string` | Yes | - | Email body (HTML/text) |
| `from` | `string` | No | - | Sender address |
| `provider` | `enum` | No | `smtp` | Email provider |
| `attachments` | `array` | No | `[]` | File attachments |

**Providers:** `smtp`, `sendgrid`, `resend`, `mailgun`

**Example Use Case:** Notifications, reports, alerts

---

### slack

**Display Name:** Slack Message
**Icon:** `MessageSquare`
**Status:** Planned
**Description:** Send message to Slack channel

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `channel` | `string` | Yes | - | Channel ID or name |
| `message` | `string` | Yes | - | Message text |
| `blocks` | `array` | No | - | Block Kit blocks |
| `threadTs` | `string` | No | - | Reply to thread |

**Example Use Case:** Alerts, notifications, team updates

---

### discord

**Display Name:** Discord Message
**Icon:** `MessageCircle`
**Status:** Future
**Description:** Send message to Discord channel

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `webhookUrl` | `string` | Yes | - | Discord webhook URL |
| `content` | `string` | No | - | Message content |
| `embeds` | `array` | No | - | Rich embeds |

**Example Use Case:** Bot notifications, community alerts

---

## Storage & Files

### r2-upload

**Display Name:** R2 Upload
**Icon:** `Upload`
**Status:** Planned
**Description:** Upload file to Cloudflare R2

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `bucket` | `string` | Yes | - | R2 bucket name |
| `key` | `string` | Yes | - | Object key/path |
| `content` | `string` | Yes | - | File content or path |
| `contentType` | `string` | No | - | MIME type |

**Outputs:**
```typescript
{
  key: string;
  size: number;
  etag: string;
  url: string;
}
```

**Example Use Case:** Store reports, save generated files

---

### r2-download

**Display Name:** R2 Download
**Icon:** `Download`
**Status:** Planned
**Description:** Download file from Cloudflare R2

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `bucket` | `string` | Yes | - | R2 bucket name |
| `key` | `string` | Yes | - | Object key/path |

**Outputs:**
```typescript
{
  content: string;
  contentType: string;
  size: number;
  metadata: object;
}
```

**Example Use Case:** Retrieve stored files, process uploads

---

## Database

### d1-query

**Display Name:** D1 Query
**Icon:** `Database`
**Status:** Planned
**Description:** Execute SQL query on Cloudflare D1

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `database` | `string` | Yes | - | D1 database binding |
| `query` | `string` | Yes | - | SQL query |
| `params` | `array` | No | `[]` | Query parameters |

**Outputs:**
```typescript
{
  results: unknown[];
  meta: {
    duration: number;
    changes: number;
    lastRowId: number;
  };
}
```

**Example Use Case:** Data lookup, store results, CRUD operations

---

### kv-get

**Display Name:** KV Get
**Icon:** `Key`
**Status:** Planned
**Description:** Get value from Cloudflare KV

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `namespace` | `string` | Yes | - | KV namespace binding |
| `key` | `string` | Yes | - | Key to retrieve |
| `type` | `enum` | No | `text` | `text`, `json`, `arrayBuffer` |

**Outputs:**
```typescript
{
  value: unknown;
  metadata: object | null;
}
```

**Example Use Case:** Config lookup, caching, state management

---

### kv-set

**Display Name:** KV Set
**Icon:** `KeySquare`
**Status:** Planned
**Description:** Set value in Cloudflare KV

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `namespace` | `string` | Yes | - | KV namespace binding |
| `key` | `string` | Yes | - | Key to set |
| `value` | `any` | Yes | - | Value to store |
| `expirationTtl` | `number` | No | - | TTL in seconds |
| `metadata` | `object` | No | - | Key metadata |

**Example Use Case:** Store results, caching, flags

---

## Utility

### wait

**Display Name:** Wait / Delay
**Icon:** `Timer`
**Status:** Planned
**Description:** Pause workflow execution

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `duration` | `string` | Yes | - | Wait duration (e.g., "5 seconds", "1 hour") |

**Outputs:**
```typescript
{
  waitedMs: number;
  resumedAt: string;
}
```

**Example Use Case:** Rate limiting, scheduled delays, retry backoff

---

### approval

**Display Name:** Wait for Approval
**Icon:** `UserCheck`
**Status:** Planned
**Description:** Pause workflow until human approval

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `message` | `string` | Yes | - | Approval request message |
| `approvers` | `array` | No | - | Allowed approver user IDs |
| `timeout` | `string` | No | `24h` | Approval timeout |
| `notificationChannel` | `string` | No | - | Where to send notification |

**Outputs:**
```typescript
{
  approved: boolean;
  approvedBy: string;
  reason?: string;
  approvedAt: string;
}
```

**Example Use Case:** Human review, sensitive operations, compliance

---

### error-handler

**Display Name:** Error Handler
**Icon:** `ShieldAlert`
**Status:** Planned
**Description:** Handle errors from previous nodes

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `onError` | `enum` | No | `continue` | `continue`, `stop`, `retry` |
| `maxRetries` | `number` | No | `3` | Max retry attempts |
| `retryDelay` | `string` | No | `5s` | Delay between retries |
| `fallbackValue` | `any` | No | - | Value on error |

**Example Use Case:** Graceful degradation, retry logic, error recovery

---

### note

**Display Name:** Note / Comment
**Icon:** `StickyNote`
**Status:** Planned
**Description:** Add documentation note (no execution)

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `content` | `string` | Yes | - | Note content (markdown) |
| `color` | `string` | No | `yellow` | Note background color |

**Example Use Case:** Documentation, workflow explanation

---

## Frontend Component Mapping

| Node Type | Frontend Component | Visual Style |
|-----------|-------------------|--------------|
| `*-trigger` | `TriggerNode.svelte` | Orange border, Zap icon |
| `http-*`, `email`, `slack`, `discord` | `ActionNode.svelte` | Blue border |
| `condition`, `switch`, `filter`, `split` | `ConditionNode.svelte` | Purple border, diamond shape |
| `ai-*` | `AIAgentNode.svelte` | Violet border, gradient |
| `javascript`, `python` | `ActionNode.svelte` (code variant) | Gray border, monospace |
| `loop`, `merge` | `ActionNode.svelte` | Purple border |
| `*` (default) | `ActionNode.svelte` | Default style |

---

## Known Issues

### Switch Node Bug (CRITICAL)

**File:** `cloudflare/worker/src/workflows/nodes/condition.ts`
**Issue:** `resolveField` function doesn't handle undefined `field` parameter
**Error:** `Cannot read properties of undefined (reading 'startsWith')`

**Fix Required:**
```typescript
function resolveField(field: string | undefined, context: ExecutionContext): unknown {
  if (!field || typeof field !== 'string') {
    return undefined;
  }
  if (field.startsWith("trigger.")) {
    return getValueByPath(context.trigger, field.substring(8));
  }
  // ... rest of function
}
```

### AI Prompt Node (Stub)

**File:** `cloudflare/worker/src/workflows/nodes/ai-agent.ts`
**Issue:** Returns stub response, no actual LLM call
**Action:** Implement Workers AI integration or external provider calls

---

## Implementation Priority

### Phase 1: Core Nodes (Current)
- [x] manual-trigger
- [x] webhook-trigger
- [x] schedule-trigger
- [x] http-request
- [x] condition
- [x] switch
- [x] javascript
- [x] loop
- [x] merge
- [x] ai-agent
- [x] ai-prompt (stub)

### Phase 2: Essential Additions
- [ ] event-trigger
- [ ] http-response
- [ ] filter
- [ ] split
- [ ] set-variable
- [ ] transform
- [ ] parse-json
- [ ] wait
- [ ] approval
- [ ] error-handler

### Phase 3: Integrations
- [ ] email
- [ ] slack
- [ ] r2-upload
- [ ] r2-download
- [ ] d1-query
- [ ] kv-get
- [ ] kv-set
- [ ] ai-classify
- [ ] ai-extract

### Phase 4: Advanced
- [ ] graphql-request
- [ ] python
- [ ] discord
- [ ] aggregate
- [ ] embeddings
- [ ] vector-search
- [ ] note

---

## TypeScript Types

```typescript
// packages/types/src/workflow-nodes.ts

export type NodeCategory = 
  | 'trigger'
  | 'http'
  | 'logic'
  | 'transform'
  | 'ai'
  | 'code'
  | 'notification'
  | 'storage'
  | 'database'
  | 'utility';

export type ImplementationStatus = 'implemented' | 'planned' | 'future';

export interface NodeTypeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: NodeCategory;
  status: ImplementationStatus;
  
  // Schema
  parameters: JSONSchema7;
  outputs: JSONSchema7;
  
  // Defaults
  defaultParameters: Record<string, unknown>;
  
  // Execution
  isTrigger?: boolean;
  hasBranches?: boolean;
  branchCount?: number;
  
  // UI
  component?: string;
  color?: string;
}

export const NODE_REGISTRY: Record<string, NodeTypeDefinition> = {
  'manual-trigger': { /* ... */ },
  'webhook-trigger': { /* ... */ },
  // ... all nodes
};
```

---

## References

- [Cloudflare Workflows Documentation](https://developers.cloudflare.com/workflows/)
- [SvelteFlow Documentation](https://svelteflow.dev/)
- [n8n Node Types](https://docs.n8n.io/integrations/) (inspiration)
- [Workflow Builder Plan](./workflow-builder-plan.md)
