import { pgTable, text, timestamp, index, boolean, jsonb } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const taskTemplates = pgTable(
  "task_templates",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    category: text("category").notNull(),
    prompt: text("prompt").notNull(),
    placeholders: jsonb("placeholders"),
    isSystem: boolean("is_system").default(false).notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("task_templates_category_idx").on(table.category),
    index("task_templates_user_id_idx").on(table.userId),
    index("task_templates_is_system_idx").on(table.isSystem),
  ]
);

export type TaskTemplate = typeof taskTemplates.$inferSelect;
export type NewTaskTemplate = typeof taskTemplates.$inferInsert;

export interface TemplatePlaceholder {
  name: string;
  label: string;
  type: "text" | "textarea" | "select";
  options?: string[];
  required?: boolean;
  defaultValue?: string;
}
