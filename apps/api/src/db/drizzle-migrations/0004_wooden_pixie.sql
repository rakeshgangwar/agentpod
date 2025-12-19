CREATE TABLE "sandbox_preview_ports" (
	"id" text PRIMARY KEY NOT NULL,
	"sandbox_id" text NOT NULL,
	"port" integer NOT NULL,
	"label" text,
	"is_public" boolean DEFAULT false,
	"public_token" text,
	"public_expires_at" timestamp with time zone,
	"detected_framework" text,
	"detected_process" text,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preview_ports_sandbox_port_unique" UNIQUE("sandbox_id","port")
);
--> statement-breakpoint
ALTER TABLE "sandbox_preview_ports" ADD CONSTRAINT "sandbox_preview_ports_sandbox_id_sandboxes_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "public"."sandboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "preview_ports_sandbox_id_idx" ON "sandbox_preview_ports" USING btree ("sandbox_id");--> statement-breakpoint
CREATE INDEX "preview_ports_public_token_idx" ON "sandbox_preview_ports" USING btree ("public_token");