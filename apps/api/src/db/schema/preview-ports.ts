import { pgTable, text, integer, boolean, timestamp, index, unique } from "drizzle-orm/pg-core";
import { sandboxes } from "./sandboxes";

export const sandboxPreviewPorts = pgTable(
  "sandbox_preview_ports",
  {
    id: text("id").primaryKey(),
    sandboxId: text("sandbox_id")
      .notNull()
      .references(() => sandboxes.id, { onDelete: "cascade" }),
    port: integer("port").notNull(),
    label: text("label"),
    isPublic: boolean("is_public").default(false),
    publicToken: text("public_token"),
    publicExpiresAt: timestamp("public_expires_at", { withTimezone: true }),
    detectedFramework: text("detected_framework"),
    detectedProcess: text("detected_process"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("preview_ports_sandbox_id_idx").on(table.sandboxId),
    index("preview_ports_public_token_idx").on(table.publicToken),
    unique("preview_ports_sandbox_port_unique").on(table.sandboxId, table.port),
  ]
);
