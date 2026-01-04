# Workflow AI Integration

## Overview

This document describes the AI integration architecture for AgentPod's visual workflow builder. We implement a LangChain-inspired approach with direct API calls optimized for Cloudflare Workers.

## Decision: Direct API Clients vs OpenCode

### Previous Approach (OpenCode)

The initial implementation used OpenCode via Cloudflare Sandbox:

```typescript
const sandbox = getSandbox(env.Sandbox, sandboxId);
const { client } = await createOpencode(sandbox, { directory });
const response = await client.session.prompt({ ... });
```

**Problems:**
- 60s container startup overhead per node execution
- Heavy resource consumption (full container per AI call)
- Overkill for simple prompt → response workflows
- Health check endpoint mismatch (`/` vs `/global/health`)

### New Approach (Direct API Clients)

Use lightweight, native API clients optimized for Cloudflare Workers:

| Provider | SDK | Workers Compatible |
|----------|-----|-------------------|
| OpenAI | `openai` | Yes (fetch-based) |
| Anthropic | `@anthropic-ai/sdk` | Yes (fetch-based) |
| Ollama | Direct fetch | Yes |
| Workers AI | Native binding | Yes (native) |
| Google | `@google/generative-ai` | Yes |

**Benefits:**
- < 1s response time (no container startup)
- Minimal memory footprint
- Native Workers AI integration
- Cost-effective

### When to Use OpenCode

Keep OpenCode for:
- Interactive coding sessions (main AgentPod sandbox feature)
- Long-running development tasks
- Multi-turn conversations with file system access
- NOT for workflow automation nodes

## Architecture

### Node Types

```
cloudflare/worker/src/workflows/nodes/ai/
├── types.ts              # Shared types and interfaces
├── providers/
│   ├── openai.ts         # OpenAI chat completions
│   ├── anthropic.ts      # Claude models
│   ├── ollama.ts         # Local models (self-hosted)
│   ├── workers-ai.ts     # Cloudflare Workers AI
│   └── google.ts         # Gemini models
├── chat.ts               # AI Chat node (multi-provider)
├── agent.ts              # AI Agent with tool calling
├── embeddings.ts         # Text embeddings
└── index.ts              # Node registration
```

### AI Chat Node

The primary node for LLM interactions. Supports multiple providers via a unified interface.

**Node Configuration:**
```typescript
interface AIChatParams {
  // Provider settings
  provider: "openai" | "anthropic" | "ollama" | "workers-ai" | "google";
  model: string;
  
  // Prompt configuration
  systemPrompt?: string;
  prompt: string;  // Supports variable interpolation: {{$input.message}}
  
  // Model parameters
  temperature?: number;      // 0-2, default 0.7
  maxTokens?: number;        // Max response length
  topP?: number;             // Nucleus sampling
  frequencyPenalty?: number; // Reduce repetition
  presencePenalty?: number;  // Encourage new topics
  
  // Response format
  responseFormat?: "text" | "json";
  jsonSchema?: object;       // For structured output
  
  // Credentials (from workflow secrets)
  apiKey?: string;           // Override default
  baseUrl?: string;          // Custom endpoint (Ollama, proxies)
}
```

**Output:**
```typescript
interface AIChatOutput {
  response: string;          // Text response
  model: string;             // Model used
  provider: string;          // Provider used
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;      // "stop", "length", etc.
  metadata?: object;         // Provider-specific data
}
```

### AI Agent Node

For complex tasks requiring tool use and multi-step reasoning.

**Node Configuration:**
```typescript
interface AIAgentParams extends AIChatParams {
  // Agent settings
  agentType: "react" | "function-calling" | "plan-and-execute";
  
  // Tools available to agent
  tools: AgentTool[];
  
  // Execution limits
  maxIterations?: number;    // Default 10
  maxExecutionTime?: string; // Default "5 minutes"
  
  // Memory (optional)
  memoryType?: "buffer" | "summary" | "none";
  memoryKey?: string;        // For persistence across executions
}

interface AgentTool {
  type: "http" | "code" | "workflow" | "calculator" | "search";
  name: string;
  description: string;
  parameters: object;        // JSON Schema
  // Tool-specific config
  config?: object;
}
```

### AI Embeddings Node

For vector embeddings (RAG, semantic search).

**Node Configuration:**
```typescript
interface AIEmbeddingsParams {
  provider: "openai" | "ollama" | "workers-ai";
  model: string;
  input: string | string[];  // Text(s) to embed
  dimensions?: number;       // For models that support it
}
```

**Output:**
```typescript
interface AIEmbeddingsOutput {
  embeddings: number[][];    // Vector arrays
  model: string;
  usage: {
    totalTokens: number;
  };
}
```

## Implementation Plan

### Phase 1: Core AI Chat (Week 1)

**Goal:** Replace `ai-prompt` node with functional multi-provider chat.

1. **Create base types** (`types.ts`)
   - Provider interface
   - Common message types
   - Error handling

2. **Implement OpenAI provider** (`providers/openai.ts`)
   - Chat completions API
   - Streaming support (optional)
   - Token counting

3. **Implement Anthropic provider** (`providers/anthropic.ts`)
   - Messages API
   - System prompt handling
   - Token counting

4. **Implement Workers AI** (`providers/workers-ai.ts`)
   - Native binding usage
   - No external dependencies
   - Cost-effective default

5. **Create AI Chat node** (`chat.ts`)
   - Provider selection
   - Variable interpolation
   - Error handling

### Phase 2: AI Agent with Tools (Week 2)

**Goal:** Enable multi-step reasoning with tool calling.

1. **Implement tool registry** (`tools/registry.ts`)
   - Tool definition format
   - Validation

2. **Built-in tools:**
   - `http` - Make HTTP requests
   - `code` - Execute JavaScript
   - `calculator` - Math operations
   - `workflow` - Call other workflows

3. **Agent execution loop:**
   - ReAct pattern implementation
   - Function calling for OpenAI/Anthropic
   - Iteration limits

### Phase 3: Ollama & Local Models (Week 3)

**Goal:** Support self-hosted models.

1. **Implement Ollama provider** (`providers/ollama.ts`)
   - Compatible API format
   - Custom endpoint support
   - Model management

2. **Configuration:**
   - Base URL setting
   - Model selection
   - Timeout handling

### Phase 4: Embeddings & Vector Search (Week 4)

**Goal:** Enable RAG workflows.

1. **Embeddings node** (`embeddings.ts`)
   - Multi-provider support
   - Batch processing

2. **Integration points:**
   - PGVector (via API)
   - In-memory vector store

## Provider Configuration

### Environment Variables

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Google
GOOGLE_API_KEY=...

# Ollama (self-hosted)
OLLAMA_BASE_URL=http://localhost:11434

# Workers AI (automatic via binding)
# No configuration needed
```

### Workflow Secrets

Users can store API keys in workflow secrets:

```typescript
// In workflow definition
{
  "secrets": {
    "OPENAI_API_KEY": "encrypted:...",
    "ANTHROPIC_API_KEY": "encrypted:..."
  }
}

// In node params, reference via
{
  "apiKey": "{{$secrets.OPENAI_API_KEY}}"
}
```

## Usage Examples

### Simple Chat

```json
{
  "type": "ai-chat",
  "params": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "systemPrompt": "You are a helpful assistant.",
    "prompt": "Summarize this text: {{$input.text}}",
    "maxTokens": 500
  }
}
```

### Structured Output

```json
{
  "type": "ai-chat",
  "params": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "prompt": "Extract entities from: {{$input.text}}",
    "responseFormat": "json",
    "jsonSchema": {
      "type": "object",
      "properties": {
        "people": { "type": "array", "items": { "type": "string" } },
        "places": { "type": "array", "items": { "type": "string" } },
        "dates": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

### Agent with Tools

```json
{
  "type": "ai-agent",
  "params": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022",
    "agentType": "function-calling",
    "prompt": "Research {{$input.topic}} and summarize findings",
    "tools": [
      {
        "type": "http",
        "name": "search",
        "description": "Search the web for information",
        "parameters": {
          "type": "object",
          "properties": {
            "query": { "type": "string" }
          },
          "required": ["query"]
        },
        "config": {
          "url": "https://api.search.example/search",
          "method": "GET"
        }
      }
    ],
    "maxIterations": 5
  }
}
```

### Local Model (Ollama)

```json
{
  "type": "ai-chat",
  "params": {
    "provider": "ollama",
    "model": "llama3.2",
    "baseUrl": "http://localhost:11434",
    "prompt": "{{$input.question}}",
    "temperature": 0.7
  }
}
```

### Workers AI (Cost-Effective)

```json
{
  "type": "ai-chat",
  "params": {
    "provider": "workers-ai",
    "model": "@cf/meta/llama-3.1-8b-instruct",
    "prompt": "{{$input.message}}"
  }
}
```

## Error Handling

### Common Errors

| Error | Cause | Handling |
|-------|-------|----------|
| `INVALID_API_KEY` | Missing/wrong API key | Check secrets, show setup guide |
| `RATE_LIMITED` | Too many requests | Exponential backoff, retry |
| `MODEL_NOT_FOUND` | Invalid model name | Validate against provider list |
| `CONTEXT_LENGTH_EXCEEDED` | Input too long | Truncate or chunk |
| `TIMEOUT` | Response took too long | Increase timeout, retry |

### Retry Strategy

```typescript
const retryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    "RATE_LIMITED",
    "TIMEOUT",
    "SERVICE_UNAVAILABLE"
  ]
};
```

## Migration from OpenCode Nodes

### Before (OpenCode)

```json
{
  "type": "ai-agent",
  "params": {
    "prompt": "Analyze this code",
    "sandboxConfig": {
      "gitUrl": "https://github.com/...",
      "directory": "/workspace"
    }
  }
}
```

### After (AI Chat)

```json
{
  "type": "ai-chat",
  "params": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022",
    "systemPrompt": "You are a code analysis expert.",
    "prompt": "Analyze this code:\n\n{{$input.code}}"
  }
}
```

### When OpenCode is Still Needed

Use the sandbox feature (not workflow nodes) when you need:
- File system access
- Command execution
- Interactive development
- Multi-file operations

## Testing

### Unit Tests

```typescript
// providers/openai.test.ts
describe("OpenAI Provider", () => {
  it("should generate chat completion", async () => {
    const result = await openaiProvider.chat({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hello" }]
    });
    expect(result.response).toBeDefined();
  });
});
```

### Integration Tests

```typescript
// ai-chat.test.ts
describe("AI Chat Node", () => {
  it("should interpolate variables in prompt", async () => {
    const result = await aiChatExecutor.execute({
      parameters: {
        provider: "openai",
        model: "gpt-4o-mini",
        prompt: "Hello {{$input.name}}"
      },
      context: { input: { name: "World" } }
    });
    // Verify prompt was "Hello World"
  });
});
```

## Observability

### Logging

```typescript
// Log AI calls for debugging
console.log(JSON.stringify({
  type: "ai_call",
  provider: "openai",
  model: "gpt-4o-mini",
  promptTokens: 100,
  completionTokens: 50,
  latencyMs: 1234,
  success: true
}));
```

### Metrics

Track per workflow:
- Total AI calls
- Token usage by provider/model
- Latency percentiles
- Error rates

## Security Considerations

1. **API Key Storage**: Use encrypted workflow secrets, never in node params
2. **Input Sanitization**: Escape user input in prompts to prevent injection
3. **Output Validation**: Validate JSON responses match expected schema
4. **Rate Limiting**: Implement per-user/workflow limits
5. **Cost Controls**: Set max tokens, track usage

## Future Enhancements

### Planned

- [ ] Streaming responses
- [ ] Conversation memory (Redis-backed)
- [ ] Fine-tuned model support
- [ ] Image generation (DALL-E, Stability)
- [ ] Speech-to-text / Text-to-speech
- [ ] RAG with PGVector integration

### Considering

- MCP (Model Context Protocol) integration
- Multi-modal inputs (images, audio)
- Model routing (cost optimization)
- A/B testing for prompts

## References

- [OpenAI API Docs](https://platform.openai.com/docs/api-reference)
- [Anthropic API Docs](https://docs.anthropic.com/en/api)
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [n8n AI Nodes](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.lmchatgroq/)
