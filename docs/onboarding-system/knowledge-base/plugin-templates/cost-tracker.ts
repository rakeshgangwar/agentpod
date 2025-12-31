/**
 * @id plugin_cost_tracker
 * @title Cost Tracker Plugin
 * @description Tracks API costs and token usage across sessions
 * @tags ["cost", "tokens", "usage", "monitoring", "billing"]
 * @applicable_to null
 * @priority medium
 */

import type { Plugin } from "@opencode-ai/plugin";
import { writeFileSync, readFileSync, existsSync } from "fs";

/**
 * Cost Tracker Plugin
 * 
 * This plugin tracks token usage and estimated costs for AI API calls.
 * Useful for:
 * - Budget management
 * - Usage analytics
 * - Cost optimization
 * - Team billing reports
 * 
 * Features:
 * - Tracks input/output tokens
 * - Estimates costs based on model pricing
 * - Aggregates by session, day, and total
 * - Exports usage reports
 * - Configurable cost alerts
 * 
 * Usage:
 * Place this file in .opencode/plugin/cost-tracker.ts
 * 
 * Environment Variables:
 * - COST_TRACKER_BUDGET_DAILY: Daily budget limit in USD (optional)
 * - COST_TRACKER_ALERT_THRESHOLD: Percentage of budget to alert (default: 80)
 * - COST_TRACKER_LOG_FILE: Path to save usage logs (optional)
 */

// Model pricing (USD per 1M tokens) - Update as needed
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic Claude
  "anthropic/claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "anthropic/claude-3-opus-20240229": { input: 15.0, output: 75.0 },
  "anthropic/claude-3-sonnet-20240229": { input: 3.0, output: 15.0 },
  "anthropic/claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
  "anthropic/claude-haiku": { input: 0.25, output: 1.25 },
  
  // OpenAI GPT-4
  "openai/gpt-4-turbo": { input: 10.0, output: 30.0 },
  "openai/gpt-4": { input: 30.0, output: 60.0 },
  "openai/gpt-4o": { input: 5.0, output: 15.0 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
  "openai/gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  
  // Default fallback
  "default": { input: 3.0, output: 15.0 },
};

// Configuration
const DAILY_BUDGET = process.env.COST_TRACKER_BUDGET_DAILY 
  ? parseFloat(process.env.COST_TRACKER_BUDGET_DAILY) 
  : null;
const ALERT_THRESHOLD = parseInt(process.env.COST_TRACKER_ALERT_THRESHOLD || "80", 10) / 100;
const LOG_FILE = process.env.COST_TRACKER_LOG_FILE || null;

// Types
interface UsageEntry {
  timestamp: string;
  sessionId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

interface UsageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  sessionCount: number;
  entries: UsageEntry[];
}

// State
let currentSessionId = "";
let sessionUsage: UsageStats = {
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCost: 0,
  sessionCount: 0,
  entries: [],
};

let dailyUsage: UsageStats = {
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCost: 0,
  sessionCount: 0,
  entries: [],
};

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

function loadAllTimeUsage(): UsageStats {
  if (!LOG_FILE || !existsSync(LOG_FILE)) {
    return {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      sessionCount: 0,
      entries: [],
    };
  }
  
  try {
    const data = readFileSync(LOG_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      sessionCount: 0,
      entries: [],
    };
  }
}

let allTimeUsage: UsageStats = loadAllTimeUsage();

function saveAllTimeUsage(): void {
  if (!LOG_FILE) return;
  
  try {
    writeFileSync(LOG_FILE, JSON.stringify(allTimeUsage, null, 2));
  } catch (error) {
    console.error("[cost-tracker] Failed to save usage log:", error);
  }
}

function getPricing(model: string): { input: number; output: number } {
  // Try exact match first
  if (MODEL_PRICING[model]) {
    return MODEL_PRICING[model];
  }
  
  // Try partial match (e.g., "claude-sonnet" matches "anthropic/claude-sonnet-...")
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.includes(key) || key.includes(model)) {
      return pricing;
    }
  }
  
  return MODEL_PRICING.default;
}

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = getPricing(model);
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  } else if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

function checkBudgetAlert(): void {
  if (!DAILY_BUDGET) return;
  
  const percentUsed = dailyUsage.totalCost / DAILY_BUDGET;
  
  if (percentUsed >= 1.0) {
    console.warn(`[cost-tracker] BUDGET EXCEEDED! Daily: ${formatCost(dailyUsage.totalCost)} / ${formatCost(DAILY_BUDGET)}`);
  } else if (percentUsed >= ALERT_THRESHOLD) {
    console.warn(`[cost-tracker] Budget alert: ${(percentUsed * 100).toFixed(0)}% of daily budget used (${formatCost(dailyUsage.totalCost)} / ${formatCost(DAILY_BUDGET)})`);
  }
}

function recordUsage(model: string, inputTokens: number, outputTokens: number): void {
  const cost = calculateCost(model, inputTokens, outputTokens);
  
  const entry: UsageEntry = {
    timestamp: new Date().toISOString(),
    sessionId: currentSessionId,
    model,
    inputTokens,
    outputTokens,
    cost,
  };
  
  // Update session stats
  sessionUsage.totalInputTokens += inputTokens;
  sessionUsage.totalOutputTokens += outputTokens;
  sessionUsage.totalCost += cost;
  sessionUsage.entries.push(entry);
  
  // Update daily stats
  dailyUsage.totalInputTokens += inputTokens;
  dailyUsage.totalOutputTokens += outputTokens;
  dailyUsage.totalCost += cost;
  dailyUsage.entries.push(entry);
  
  // Update all-time stats
  allTimeUsage.totalInputTokens += inputTokens;
  allTimeUsage.totalOutputTokens += outputTokens;
  allTimeUsage.totalCost += cost;
  allTimeUsage.entries.push(entry);
  
  // Save to file
  saveAllTimeUsage();
  
  // Check budget
  checkBudgetAlert();
  
  // Log usage
  console.log(`[cost-tracker] ${model}: ${formatTokens(inputTokens)} in, ${formatTokens(outputTokens)} out = ${formatCost(cost)} (Session: ${formatCost(sessionUsage.totalCost)}, Today: ${formatCost(dailyUsage.totalCost)})`);
}

function printSessionSummary(): void {
  console.log("\n[cost-tracker] Session Summary:");
  console.log(`  Input tokens:  ${formatTokens(sessionUsage.totalInputTokens)}`);
  console.log(`  Output tokens: ${formatTokens(sessionUsage.totalOutputTokens)}`);
  console.log(`  Total cost:    ${formatCost(sessionUsage.totalCost)}`);
  console.log(`  API calls:     ${sessionUsage.entries.length}`);
}

/**
 * Cost Tracker Plugin
 * 
 * Uses the event handler to track message updates which contain
 * token usage information.
 */
export const CostTrackerPlugin: Plugin = async ({ project, directory }) => {
  console.log(`[cost-tracker] Initialized for ${project?.name || directory}`);
  console.log(`[cost-tracker] Daily budget: ${DAILY_BUDGET ? formatCost(DAILY_BUDGET) : "unlimited"}`);
  
  return {
    event: async ({ event }) => {
      const { type, properties } = event;
      
      switch (type) {
        case "session.created":
          // Reset session stats
          currentSessionId = (properties?.sessionId as string) || `session-${Date.now()}`;
          sessionUsage = {
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalCost: 0,
            sessionCount: 1,
            entries: [],
          };
          
          // Reset daily stats if new day
          const today = getToday();
          const lastEntryDate = dailyUsage.entries.length > 0
            ? dailyUsage.entries[dailyUsage.entries.length - 1].timestamp.split("T")[0]
            : today;
          
          if (lastEntryDate !== today) {
            dailyUsage = {
              totalInputTokens: 0,
              totalOutputTokens: 0,
              totalCost: 0,
              sessionCount: 0,
              entries: [],
            };
          }
          
          dailyUsage.sessionCount++;
          allTimeUsage.sessionCount++;
          
          console.log(`[cost-tracker] Session started. Today's cost so far: ${formatCost(dailyUsage.totalCost)}`);
          break;
          
        case "message.updated":
          // Track token usage from assistant messages
          const message = properties?.message as {
            role?: string;
            usage?: { inputTokens?: number; outputTokens?: number };
            model?: string;
          } | undefined;
          
          if (message?.role === "assistant" && message?.usage) {
            const { inputTokens = 0, outputTokens = 0 } = message.usage;
            const model = message.model || "default";
            
            if (inputTokens > 0 || outputTokens > 0) {
              recordUsage(model, inputTokens, outputTokens);
            }
          }
          break;
          
        case "session.idle":
          // Print summary when session becomes idle for a while
          const duration = properties?.duration as number | undefined;
          if (duration && duration >= 60000) {
            printSessionSummary();
          }
          break;
      }
    },
  };
};

export default CostTrackerPlugin;
