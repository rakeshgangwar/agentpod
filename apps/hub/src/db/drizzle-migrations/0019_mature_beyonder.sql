CREATE TABLE "station_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"node_id" text NOT NULL,
	"station_key" text NOT NULL,
	"verb" text NOT NULL,
	"params_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "station_audit_user_id_idx" ON "station_audit" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "station_audit_station_key_idx" ON "station_audit" USING btree ("station_key");--> statement-breakpoint
CREATE INDEX "station_audit_node_id_idx" ON "station_audit" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "station_audit_created_at_idx" ON "station_audit" USING btree ("created_at");