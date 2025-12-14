/**
 * Drizzle ORM Schema - Main Export
 *
 * Re-exports all schema modules for use with Drizzle.
 * Each module defines tables for a specific domain.
 */

// Authentication (Better Auth tables)
export * from "./auth";

// Core entities
export * from "./sandboxes";
export * from "./chat";
export * from "./providers";
export * from "./settings";
export * from "./containers";
export * from "./activity";

// Onboarding system (new)
export * from "./knowledge";
export * from "./onboarding";
