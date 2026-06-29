CREATE TYPE "public"."mcp_oauth_status" AS ENUM('pending', 'authorized', 'expired', 'error');--> statement-breakpoint
CREATE TABLE "mcp_oauth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"mcp_server_id" text NOT NULL,
	"user_id" text NOT NULL,
	"resource_url" text,
	"authorization_server_url" text,
	"client_id" text,
	"client_secret" text,
	"access_token" text,
	"refresh_token" text,
	"token_type" text DEFAULT 'Bearer',
	"expires_at" timestamp,
	"scope" text,
	"code_verifier" text,
	"state" text,
	"status" "mcp_oauth_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_oauth_sessions_server_user_unique" UNIQUE("mcp_server_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "mcp_oauth_sessions" ADD CONSTRAINT "mcp_oauth_sessions_mcp_server_id_mcp_servers_id_fk" FOREIGN KEY ("mcp_server_id") REFERENCES "public"."mcp_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_oauth_sessions" ADD CONSTRAINT "mcp_oauth_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_oauth_sessions_server_idx" ON "mcp_oauth_sessions" USING btree ("mcp_server_id");--> statement-breakpoint
CREATE INDEX "mcp_oauth_sessions_user_idx" ON "mcp_oauth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mcp_oauth_sessions_status_idx" ON "mcp_oauth_sessions" USING btree ("status");