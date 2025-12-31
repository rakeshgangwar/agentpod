CREATE TYPE "public"."agent_mode" AS ENUM('primary', 'subagent');--> statement-breakpoint
ALTER TYPE "public"."agent_squad" ADD VALUE 'research' BEFORE 'data';--> statement-breakpoint
ALTER TYPE "public"."agent_squad" ADD VALUE 'communication' BEFORE 'data';--> statement-breakpoint
ALTER TABLE "agent_presets" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "agent_presets" CASCADE;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "mode" "agent_mode" DEFAULT 'subagent';--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "is_mandatory" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "version" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "version_history" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
CREATE INDEX "agents_mode_idx" ON "agents" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "agents_is_mandatory_idx" ON "agents" USING btree ("is_mandatory");