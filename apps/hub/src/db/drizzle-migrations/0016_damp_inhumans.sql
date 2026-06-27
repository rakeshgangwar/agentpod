CREATE TYPE "public"."node_status" AS ENUM('online', 'offline');--> statement-breakpoint
ALTER TYPE "public"."mcp_auth_type" ADD VALUE 'provider_link';--> statement-breakpoint
CREATE TABLE "enrollment_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"hostname" text NOT NULL,
	"os" text NOT NULL,
	"arch" text NOT NULL,
	"cpu_count" integer DEFAULT 0 NOT NULL,
	"secret_hash" text NOT NULL,
	"status" "node_status" DEFAULT 'offline' NOT NULL,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enrollment_tokens" ADD CONSTRAINT "enrollment_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enrollment_tokens_user_id_idx" ON "enrollment_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "nodes_user_id_idx" ON "nodes" USING btree ("user_id");