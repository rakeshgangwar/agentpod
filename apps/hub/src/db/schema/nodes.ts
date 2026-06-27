import { pgTable, text, integer, timestamp, index, pgEnum } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const nodeStatusEnum = pgEnum("node_status", ["online", "offline"]);

export const nodes = pgTable("nodes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  hostname: text("hostname").notNull(),
  os: text("os").notNull(),
  arch: text("arch").notNull(),
  cpuCount: integer("cpu_count").notNull().default(0),
  secretHash: text("secret_hash").notNull(),
  status: nodeStatusEnum("status").notNull().default("offline"),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("nodes_user_id_idx").on(t.userId)]);

export const enrollmentTokens = pgTable("enrollment_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("enrollment_tokens_user_id_idx").on(t.userId)]);
