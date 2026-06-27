CREATE TABLE "stations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"node_id" text NOT NULL,
	"harness" text NOT NULL,
	"station_key" text NOT NULL,
	"kind" text NOT NULL,
	"parent_station_id" text,
	"display_name" text NOT NULL,
	"workspace_path" text,
	"capabilities" jsonb,
	"adopted_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_parent_station_id_stations_id_fk" FOREIGN KEY ("parent_station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stations_node_id_station_key_idx" ON "stations" USING btree ("node_id","station_key");--> statement-breakpoint
CREATE INDEX "stations_node_id_idx" ON "stations" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "stations_user_id_idx" ON "stations" USING btree ("user_id");