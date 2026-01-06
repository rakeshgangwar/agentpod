CREATE TYPE "public"."mcp_auth_type" AS ENUM('none', 'api_key', 'bearer_token', 'oauth2', 'env_vars');--> statement-breakpoint
CREATE TYPE "public"."mcp_endpoint_auth_type" AS ENUM('api_key', 'oauth');--> statement-breakpoint
CREATE TYPE "public"."mcp_server_type" AS ENUM('STDIO', 'SSE', 'STREAMABLE_HTTP');--> statement-breakpoint
CREATE TABLE "mcp_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint_id" text,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"description" text,
	"scopes" jsonb DEFAULT '[]'::jsonb,
	"expires_at" timestamp,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_connection_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"server_id" text,
	"endpoint_id" text,
	"status" text NOT NULL,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_endpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"namespace_id" text NOT NULL,
	"name" text NOT NULL,
	"auth_enabled" boolean DEFAULT true NOT NULL,
	"auth_type" "mcp_endpoint_auth_type" DEFAULT 'api_key' NOT NULL,
	"metamcp_endpoint_id" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_endpoints_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "mcp_namespace_servers" (
	"namespace_id" text NOT NULL,
	"server_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "mcp_namespace_servers_pk" UNIQUE("namespace_id","server_id")
);
--> statement-breakpoint
CREATE TABLE "mcp_namespaces" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"metamcp_namespace_id" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_namespaces_user_name_unique" UNIQUE("user_id","name")
);
--> statement-breakpoint
CREATE TABLE "mcp_servers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" "mcp_server_type" NOT NULL,
	"command" text,
	"args" jsonb DEFAULT '[]'::jsonb,
	"url" text,
	"auth_type" "mcp_auth_type" DEFAULT 'none' NOT NULL,
	"auth_config" jsonb DEFAULT '{}'::jsonb,
	"environment" jsonb DEFAULT '{}'::jsonb,
	"metamcp_server_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_servers_user_name_unique" UNIQUE("user_id","name")
);
--> statement-breakpoint
CREATE TABLE "mcp_tool_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"namespace_id" text NOT NULL,
	"server_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"override_name" text,
	"override_description" text,
	"annotations" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "mcp_tool_overrides_unique" UNIQUE("namespace_id","server_id","tool_name")
);
--> statement-breakpoint
ALTER TABLE "mcp_api_keys" ADD CONSTRAINT "mcp_api_keys_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_api_keys" ADD CONSTRAINT "mcp_api_keys_endpoint_id_mcp_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."mcp_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_connection_logs" ADD CONSTRAINT "mcp_connection_logs_server_id_mcp_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."mcp_servers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_connection_logs" ADD CONSTRAINT "mcp_connection_logs_endpoint_id_mcp_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."mcp_endpoints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_endpoints" ADD CONSTRAINT "mcp_endpoints_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_endpoints" ADD CONSTRAINT "mcp_endpoints_namespace_id_mcp_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."mcp_namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_namespace_servers" ADD CONSTRAINT "mcp_namespace_servers_namespace_id_mcp_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."mcp_namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_namespace_servers" ADD CONSTRAINT "mcp_namespace_servers_server_id_mcp_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."mcp_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_namespaces" ADD CONSTRAINT "mcp_namespaces_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tool_overrides" ADD CONSTRAINT "mcp_tool_overrides_namespace_id_mcp_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."mcp_namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tool_overrides" ADD CONSTRAINT "mcp_tool_overrides_server_id_mcp_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."mcp_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_api_keys_user_id_idx" ON "mcp_api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mcp_api_keys_endpoint_idx" ON "mcp_api_keys" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "mcp_api_keys_prefix_idx" ON "mcp_api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX "mcp_connection_logs_server_idx" ON "mcp_connection_logs" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "mcp_connection_logs_endpoint_idx" ON "mcp_connection_logs" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "mcp_connection_logs_timestamp_idx" ON "mcp_connection_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "mcp_endpoints_user_id_idx" ON "mcp_endpoints" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mcp_endpoints_namespace_idx" ON "mcp_endpoints" USING btree ("namespace_id");--> statement-breakpoint
CREATE INDEX "mcp_namespace_servers_namespace_idx" ON "mcp_namespace_servers" USING btree ("namespace_id");--> statement-breakpoint
CREATE INDEX "mcp_namespace_servers_server_idx" ON "mcp_namespace_servers" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "mcp_namespaces_user_id_idx" ON "mcp_namespaces" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mcp_servers_user_id_idx" ON "mcp_servers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mcp_servers_type_idx" ON "mcp_servers" USING btree ("type");--> statement-breakpoint
CREATE INDEX "mcp_servers_enabled_idx" ON "mcp_servers" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "mcp_tool_overrides_namespace_idx" ON "mcp_tool_overrides" USING btree ("namespace_id");