/**
 * Station Audit Schema
 *
 * Records every write operation and terminal session event per station.
 * Rows are written with result:"pending" when the operation starts; the
 * caller finalises the result via recordAudit().done(result, error?).
 *
 * Added in P2 Task 6.
 */

import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const stationAudit = pgTable(
  "station_audit",
  {
    id:           text("id").primaryKey(),
    userId:       text("user_id").notNull(),
    nodeId:       text("node_id").notNull(),
    stationKey:   text("station_key").notNull(),
    verb:         text("verb").notNull(),
    paramsSummary: jsonb("params_summary").$type<Record<string, unknown>>().notNull().default({}),
    result:       text("result").notNull().default("pending"), // "pending" | "ok" | "error"
    error:        text("error"),                              // null unless result == "error"
    createdAt:    timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("station_audit_user_id_idx").on(t.userId),
    index("station_audit_station_key_idx").on(t.stationKey),
    index("station_audit_node_id_idx").on(t.nodeId),
    index("station_audit_created_at_idx").on(t.createdAt),
  ]
);
