CREATE TYPE "public"."agent_task_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."cloudflare_sandbox_status" AS ENUM('creating', 'running', 'sleeping', 'stopped', 'error');--> statement-breakpoint
CREATE TYPE "public"."sandbox_provider" AS ENUM('docker', 'cloudflare');--> statement-breakpoint
CREATE TABLE "agent_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sandbox_id" text NOT NULL,
	"provider" "sandbox_provider" DEFAULT 'cloudflare' NOT NULL,
	"status" "agent_task_status" DEFAULT 'pending' NOT NULL,
	"message" text NOT NULL,
	"response" text,
	"git_url" text,
	"model_provider" text,
	"model_id" text,
	"session_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"error" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "cloudflare_sandboxes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" "cloudflare_sandbox_status" DEFAULT 'sleeping' NOT NULL,
	"worker_url" text NOT NULL,
	"config_hash" text,
	"workspace_synced_at" timestamp,
	"last_active_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "sandboxes" ADD COLUMN "provider" "sandbox_provider" DEFAULT 'docker';--> statement-breakpoint
ALTER TABLE "sandboxes" ADD COLUMN "cloudflare_sandbox_id" text;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloudflare_sandboxes" ADD CONSTRAINT "cloudflare_sandboxes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_tasks_user_id_idx" ON "agent_tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_tasks_status_idx" ON "agent_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_tasks_sandbox_id_idx" ON "agent_tasks" USING btree ("sandbox_id");--> statement-breakpoint
CREATE INDEX "agent_tasks_created_at_idx" ON "agent_tasks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cloudflare_sandboxes_user_id_idx" ON "cloudflare_sandboxes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cloudflare_sandboxes_status_idx" ON "cloudflare_sandboxes" USING btree ("status");