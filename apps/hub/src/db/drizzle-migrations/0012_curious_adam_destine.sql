CREATE TYPE "public"."fork_creator" AS ENUM('user', 'system');--> statement-breakpoint
CREATE TYPE "public"."fork_type" AS ENUM('explicit', 'auto-edit', 'auto-regenerate');--> statement-breakpoint
CREATE TABLE "message_branches" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "message_branches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sandbox_id" text NOT NULL,
	"session_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"message_id" text NOT NULL,
	"branch_number" integer NOT NULL,
	"parent_branch_id" text,
	"is_current" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "message_branches_session_branch_unique" UNIQUE("session_id","branch_id"),
	CONSTRAINT "message_branches_session_message_branch_unique" UNIQUE("session_id","message_id","branch_number")
);
--> statement-breakpoint
CREATE TABLE "session_forks" (
	"id" text PRIMARY KEY NOT NULL,
	"sandbox_id" text NOT NULL,
	"parent_session_id" text,
	"forked_at_message_id" text,
	"fork_type" "fork_type" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" "fork_creator" DEFAULT 'user' NOT NULL,
	"tags" text[] DEFAULT '{}',
	"reason" text,
	"agent_config" jsonb,
	"merged_into" text,
	"original_title" text
);
--> statement-breakpoint
CREATE INDEX "message_branches_sandbox_id_idx" ON "message_branches" USING btree ("sandbox_id");--> statement-breakpoint
CREATE INDEX "message_branches_session_id_idx" ON "message_branches" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "message_branches_message_id_idx" ON "message_branches" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "session_forks_sandbox_id_idx" ON "session_forks" USING btree ("sandbox_id");--> statement-breakpoint
CREATE INDEX "session_forks_parent_session_id_idx" ON "session_forks" USING btree ("parent_session_id");--> statement-breakpoint
CREATE INDEX "session_forks_created_at_idx" ON "session_forks" USING btree ("created_at");