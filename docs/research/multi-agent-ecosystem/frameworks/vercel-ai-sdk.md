# Vercel AI SDK

> **Version:** 1.0.0  
> **Last Updated:** January 5, 2026  
> **Status:** Production

---

## Overview

| Attribute | Value |
|-----------|-------|
| **Provider** | Vercel |
| **Type** | TypeScript SDK |
| **Documentation** | https://sdk.vercel.ai |
| **GitHub** | https://github.com/vercel/ai |
| **Current Version** | v6 |

---

## What is Vercel AI SDK?

Vercel AI SDK is a TypeScript-first toolkit for building AI-powered applications. While not exclusively an agent framework, v6 introduced the `Agent` class for agentic workflows.

### Key Differentiators

1. **TypeScript-First** - Type-safe API design
2. **React Integration** - Hooks for UI streaming
3. **Framework Agnostic** - Works with Next.js, SvelteKit, etc.
4. **Provider Ecosystem** - 20+ LLM providers
5. **Edge Compatible** - Runs on edge runtimes

---

## Core Functions

### generateText

Simple text generation:

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const { text } = await generateText({
  model: openai('gpt-4'),
  prompt: 'What is the capital of France?'
});

console.log(text); // "Paris"
```

### streamText

Streaming text generation:

```typescript
import { streamText } from 'ai';

const { textStream } = await streamText({
  model: openai('gpt-4'),
  prompt: 'Write a story about a robot.'
});

for await (const chunk of textStream) {
  process.stdout.write(chunk);
}
```

### generateObject

Structured data generation:

```typescript
import { generateObject } from 'ai';
import { z } from 'zod';

const { object } = await generateObject({
  model: openai('gpt-4'),
  schema: z.object({
    name: z.string(),
    age: z.number(),
    city: z.string()
  }),
  prompt: 'Generate a person profile'
});

console.log(object); // { name: "John", age: 30, city: "NYC" }
```

---

## Agent Class (v6+)

### Basic Agent

```typescript
import { Agent } from 'ai';
import { openai } from '@ai-sdk/openai';

const agent = new Agent({
  model: openai('gpt-4'),
  tools: {
    weather: {
      description: 'Get weather for a location',
      parameters: z.object({
        location: z.string()
      }),
      execute: async ({ location }) => {
        return `Weather in ${location}: 72°F, sunny`;
      }
    }
  }
});

const result = await agent.run('What is the weather in Tokyo?');
console.log(result.text);
```

### Multi-Step Agent

```typescript
const agent = new Agent({
  model: openai('gpt-4'),
  maxSteps: 10,
  tools: {
    search: searchTool,
    calculate: calculateTool,
    write: writeTool
  }
});

// Agent will use multiple tools to complete the task
const result = await agent.run(
  'Research AI trends, calculate market growth, and write a summary'
);
```

### Loop Control

```typescript
const agent = new Agent({
  model: openai('gpt-4'),
  tools: {...},
  
  // Stop when condition is met
  stopWhen: (state) => state.toolCalls.length > 5,
  
  // Prepare each step
  prepareStep: (state) => ({
    ...state,
    messages: state.messages.slice(-10) // Keep last 10 messages
  })
});
```

---

## Tool Calling

### Defining Tools

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const searchTool = tool({
  description: 'Search the web for information',
  parameters: z.object({
    query: z.string().describe('Search query')
  }),
  execute: async ({ query }) => {
    const results = await searchAPI(query);
    return JSON.stringify(results);
  }
});

const calculateTool = tool({
  description: 'Perform mathematical calculations',
  parameters: z.object({
    expression: z.string().describe('Math expression')
  }),
  execute: async ({ expression }) => {
    return eval(expression).toString();
  }
});
```

### Using Tools

```typescript
import { generateText } from 'ai';

const { text, toolCalls, toolResults } = await generateText({
  model: openai('gpt-4'),
  tools: { search: searchTool, calculate: calculateTool },
  prompt: 'What is the population of Tokyo multiplied by 2?'
});

console.log(toolCalls);    // Array of tool invocations
console.log(toolResults);  // Array of tool results
console.log(text);         // Final response
```

---

## MCP Integration

### Using MCP Tools

```typescript
import { createMCPClient } from 'ai/mcp';

// Connect to MCP server
const mcpClient = await createMCPClient({
  transport: 'stdio',
  command: 'npx',
  args: ['mcp-server-github']
});

// Get tools from MCP server
const mcpTools = await mcpClient.tools();

const agent = new Agent({
  model: openai('gpt-4'),
  tools: mcpTools
});
```

---

## React Integration

### useChat Hook

```tsx
import { useChat } from 'ai/react';

function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat'
  });

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          <strong>{m.role}:</strong> {m.content}
        </div>
      ))}
      
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          disabled={isLoading}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

### Streaming UI

```tsx
import { useChat } from 'ai/react';

function Chat() {
  const { messages } = useChat();

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          {m.toolInvocations?.map((tool) => (
            <ToolCallDisplay 
              key={tool.toolCallId}
              name={tool.toolName}
              args={tool.args}
              result={tool.result}
              status={tool.state}
            />
          ))}
          {m.content}
        </div>
      ))}
    </div>
  );
}
```

### API Route (Next.js)

```typescript
// app/api/chat/route.ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await streamText({
    model: openai('gpt-4'),
    messages,
    tools: {
      weather: weatherTool,
      search: searchTool
    }
  });

  return result.toDataStreamResponse();
}
```

---

## Provider Support

### Official Providers

| Provider | Package |
|----------|---------|
| OpenAI | `@ai-sdk/openai` |
| Anthropic | `@ai-sdk/anthropic` |
| Google | `@ai-sdk/google` |
| Mistral | `@ai-sdk/mistral` |
| Cohere | `@ai-sdk/cohere` |
| Amazon Bedrock | `@ai-sdk/amazon-bedrock` |
| Azure OpenAI | `@ai-sdk/azure` |

### Using Multiple Providers

```typescript
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';

// Use different models for different tasks
const fastModel = openai('gpt-3.5-turbo');
const smartModel = anthropic('claude-3-opus');
const cheapModel = google('gemini-pro');

// Router based on task
async function route(task: string) {
  if (task.includes('simple')) return fastModel;
  if (task.includes('complex')) return smartModel;
  return cheapModel;
}
```

---

## Svelte Integration

Since AgentPod uses SvelteKit, here's the Svelte integration:

```svelte
<script>
  import { useChat } from '@ai-sdk/svelte';
  
  const { messages, input, handleSubmit, isLoading } = useChat({
    api: '/api/chat'
  });
</script>

<div class="chat">
  {#each $messages as message}
    <div class="message {message.role}">
      {message.content}
    </div>
  {/each}
  
  <form on:submit={handleSubmit}>
    <input 
      bind:value={$input} 
      disabled={$isLoading}
      placeholder="Type a message..."
    />
    <button type="submit">Send</button>
  </form>
</div>
```

---

## Comparison with Other Frameworks

| Feature | Vercel AI SDK | LangChain | CrewAI |
|---------|---------------|-----------|--------|
| **Primary Language** | TypeScript | Python | Python |
| **Agent Support** | ✅ (v6+) | ✅ | ✅ |
| **Multi-Agent** | ⚠️ Limited | ✅ | ✅ |
| **React Integration** | ✅ Native | ❌ | ❌ |
| **Streaming** | ✅ First-class | ✅ | ✅ |
| **MCP** | ✅ | ✅ | ✅ |
| **Type Safety** | ✅ Excellent | ⚠️ | ⚠️ |

---

## Limitations

| Limitation | Details |
|------------|---------|
| **Multi-Agent** | Limited compared to LangGraph/CrewAI |
| **A2A Protocol** | Not supported |
| **Complex Workflows** | No graph-based orchestration |
| **State Management** | Manual implementation needed |

---

## AgentPod Integration

### High Relevance

Vercel AI SDK is highly relevant for AgentPod because:
1. **TypeScript-first** matches AgentPod's frontend stack
2. **React hooks** work well with assistant-ui
3. **MCP support** aligns with tool integration plans
4. **Streaming** matches SSE architecture

### Potential Integration

```typescript
// In AgentPod frontend
import { useChat } from '@ai-sdk/svelte';

// Connect to AgentPod backend
const { messages, input, handleSubmit } = useChat({
  api: '/api/sandbox/${sandboxId}/chat',
  streamProtocol: 'data' // Use Vercel AI SDK stream protocol
});
```

### Backend Integration

```typescript
// apps/api/src/routes/chat.ts
import { streamText } from 'ai';
import { Hono } from 'hono';

const chatRoutes = new Hono();

chatRoutes.post('/sandbox/:sandboxId/chat', async (c) => {
  const { messages } = await c.req.json();
  const sandboxId = c.req.param('sandboxId');
  
  const result = await streamText({
    model: openai('gpt-4'),
    messages,
    tools: getSandboxTools(sandboxId)
  });
  
  return result.toDataStreamResponse();
});
```

---

## Resources

- **Documentation:** https://sdk.vercel.ai
- **GitHub:** https://github.com/vercel/ai
- **Examples:** https://sdk.vercel.ai/examples
- **Cookbook:** https://sdk.vercel.ai/cookbook
- **Providers:** https://sdk.vercel.ai/providers

---

## Related Documentation

- [AG-UI Protocol](../protocols/ag-ui.md) - Similar streaming patterns
- [MCP Protocol](../protocols/mcp.md) - Tool integration
- [Open Source Frameworks](./open-source.md) - Alternative frameworks

---

*Part of AgentPod Multi-Agent Ecosystem Research*
