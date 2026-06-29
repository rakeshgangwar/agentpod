CREATE TYPE "public"."runtime_status" AS ENUM('provisioning', 'online', 'stopped', 'error', 'destroyed');--> statement-breakpoint
CREATE TABLE "provisioned_runtimes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_id" text,
	"status" "runtime_status" DEFAULT 'provisioning' NOT NULL,
	"node_id" text,
	"name" text NOT NULL,
	"resource_tier" text DEFAULT 'small' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enrollment_tokens" ADD COLUMN "provisioned_runtime_id" text;--> statement-breakpoint
ALTER TABLE "provisioned_runtimes" ADD CONSTRAINT "provisioned_runtimes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioned_runtimes" ADD CONSTRAINT "provisioned_runtimes_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provisioned_runtimes_user_id_idx" ON "provisioned_runtimes" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "enrollment_tokens" ADD CONSTRAINT "enrollment_tokens_provisioned_runtime_id_provisioned_runtimes_id_fk" FOREIGN KEY ("provisioned_runtime_id") REFERENCES "public"."provisioned_runtimes"("id") ON DELETE set null ON UPDATE no action;