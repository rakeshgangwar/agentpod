CREATE TYPE "public"."permission_status" AS ENUM('pending', 'resolved', 'expired');--> statement-breakpoint
CREATE TABLE "sandbox_permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"sandbox_id" text NOT NULL,
	"session_id" text NOT NULL,
	"permission_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text,
	"status" "permission_status" DEFAULT 'pending' NOT NULL,
	"created_at" bigint NOT NULL,
	"resolved_at" bigint,
	CONSTRAINT "sandbox_permissions_unique" UNIQUE("sandbox_id","permission_id")
);
--> statement-breakpoint
ALTER TABLE "sandbox_permissions" ADD CONSTRAINT "sandbox_permissions_sandbox_id_sandboxes_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "public"."sandboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sandbox_permissions_sandbox_id_idx" ON "sandbox_permissions" USING btree ("sandbox_id");--> statement-breakpoint
CREATE INDEX "sandbox_permissions_status_idx" ON "sandbox_permissions" USING btree ("sandbox_id","status");