import { pgTable, text, timestamp, index, uniqueIndex, jsonb, AnyPgColumn } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { nodes } from "./nodes";

export const stations = pgTable("stations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  nodeId: text("node_id").notNull().references(() => nodes.id, { onDelete: "cascade" }),
  harness: text("harness").notNull(),
  stationKey: text("station_key").notNull(),
  kind: text("kind").notNull(),
  parentStationId: text("parent_station_id").references((): AnyPgColumn => stations.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  workspacePath: text("workspace_path"),
  capabilities: jsonb("capabilities").$type<string[]>(),
  adoptedAt: timestamp("adopted_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("stations_node_id_station_key_idx").on(t.nodeId, t.stationKey),
  index("stations_node_id_idx").on(t.nodeId),
  index("stations_user_id_idx").on(t.userId),
]);
