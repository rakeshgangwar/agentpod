/**
 * Drizzle ORM Schema - Main Export
 *
 * Re-exports all schema modules for use with Drizzle.
 * Each module defines tables for a specific domain.
 */

// Authentication (Better Auth tables)
export * from "./auth";

// Admin (user management, resource limits, audit log)
export * from "./admin";

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

// Preview system
export * from "./preview-ports";

// Cloudflare sandbox integration
export * from "./cloudflare";

// Quick task templates
export * from "./quick-tasks";
