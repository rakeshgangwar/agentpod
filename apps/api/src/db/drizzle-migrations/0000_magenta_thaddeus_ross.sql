CREATE TYPE "public"."sandbox_status" AS ENUM('created', 'starting', 'running', 'stopping', 'stopped', 'error');--> statement-breakpoint
CREATE TYPE "public"."chat_message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."chat_message_status" AS ENUM('streaming', 'complete', 'error', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."chat_session_status" AS ENUM('active', 'archived', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."chat_source" AS ENUM('opencode', 'acp_gateway');--> statement-breakpoint
CREATE TYPE "public"."auth_type" AS ENUM('api_key', 'oauth', 'device_flow');--> statement-breakpoint
CREATE TYPE "public"."oauth_status" AS ENUM('pending', 'completed', 'expired', 'error');--> statement-breakpoint
CREATE TYPE "public"."opencode_file_extension" AS ENUM('md', 'ts', 'js');--> statement-breakpoint
CREATE TYPE "public"."opencode_file_type" AS ENUM('agent', 'command', 'tool', 'plugin');--> statement-breakpoint
CREATE TYPE "public"."theme_mode" AS ENUM('light', 'dark', 'system');--> statement-breakpoint
CREATE TYPE "public"."embedding_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."knowledge_category" AS ENUM('project_template', 'agent_pattern', 'command_template', 'tool_template', 'plugin_template', 'mcp_template', 'workflow_pattern', 'best_practice', 'provider_guide');--> statement-breakpoint
CREATE TYPE "public"."onboarding_status" AS ENUM('pending', 'started', 'gathering', 'generating', 'applying', 'completed', 'skipped', 'failed');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sandboxes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"repo_name" text NOT NULL,
	"github_url" text,
	"resource_tier_id" text DEFAULT 'starter',
	"flavor_id" text DEFAULT 'fullstack',
	"addon_ids" text DEFAULT '[]',
	"container_id" text,
	"container_name" text,
	"status" "sandbox_status" DEFAULT 'created',
	"error_message" text,
	"opencode_url" text,
	"acp_gateway_url" text,
	"vnc_url" text,
	"code_server_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp,
	CONSTRAINT "sandboxes_user_slug_unique" UNIQUE("user_id","slug")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"external_message_id" text,
	"role" "chat_message_role" NOT NULL,
	"content" text NOT NULL,
	"tool_calls" text,
	"tool_results" text,
	"thinking" text,
	"model_provider" text,
	"model_id" text,
	"agent_id" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"status" "chat_message_status" DEFAULT 'complete',
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"sandbox_id" text NOT NULL,
	"user_id" text NOT NULL,
	"source" "chat_source" NOT NULL,
	"opencode_session_id" text,
	"acp_session_id" text,
	"acp_agent_id" text,
	"title" text,
	"status" "chat_session_status" DEFAULT 'active',
	"message_count" integer DEFAULT 0,
	"user_message_count" integer DEFAULT 0,
	"assistant_message_count" integer DEFAULT 0,
	"total_input_tokens" integer DEFAULT 0,
	"total_output_tokens" integer DEFAULT 0,
	"last_message_at" timestamp,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_sessions_opencode_unique" UNIQUE("sandbox_id","opencode_session_id"),
	CONSTRAINT "chat_sessions_acp_unique" UNIQUE("sandbox_id","acp_session_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_state" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"device_code" text NOT NULL,
	"user_code" text NOT NULL,
	"verification_uri" text NOT NULL,
	"interval_seconds" integer DEFAULT 5,
	"expires_at" timestamp NOT NULL,
	"status" "oauth_status" DEFAULT 'pending',
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"auth_type" "auth_type" NOT NULL,
	"api_key_encrypted" text,
	"access_token_encrypted" text,
	"refresh_token_encrypted" text,
	"token_expires_at" timestamp,
	"oauth_provider" text,
	"oauth_scopes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "provider_credentials_provider_id_unique" UNIQUE("provider_id")
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"api_key" text,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"is_default" boolean DEFAULT false,
	"is_configured" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_opencode_config" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"settings" text DEFAULT '{}' NOT NULL,
	"agents_md" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_opencode_config_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_opencode_files" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "opencode_file_type" NOT NULL,
	"name" text NOT NULL,
	"extension" "opencode_file_extension" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_opencode_files_unique" UNIQUE("user_id","type","name")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"theme_mode" "theme_mode" DEFAULT 'system',
	"theme_preset" text DEFAULT 'default-neutral',
	"auto_refresh_interval" integer DEFAULT 30,
	"in_app_notifications" boolean DEFAULT true,
	"system_notifications" boolean DEFAULT true,
	"default_resource_tier_id" text DEFAULT 'starter',
	"default_flavor_id" text DEFAULT 'fullstack',
	"default_addon_ids" text DEFAULT '["code-server"]',
	"default_agent_id" text DEFAULT 'opencode',
	"settings_version" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "container_addons" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"image_size_mb" integer,
	"port" integer,
	"requires_gpu" boolean DEFAULT false NOT NULL,
	"requires_flavor" text,
	"price_monthly" real DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "container_flavors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"languages" text DEFAULT '[]' NOT NULL,
	"image_size_mb" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "container_tiers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_type" text NOT NULL,
	"cpu_limit" text NOT NULL,
	"memory_limit" text NOT NULL,
	"memory_reservation" text,
	"storage_gb" integer NOT NULL,
	"has_desktop_access" boolean DEFAULT false,
	"is_default" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_tiers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"cpu_cores" integer NOT NULL,
	"memory_gb" integer NOT NULL,
	"storage_gb" integer NOT NULL,
	"price_monthly" real DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"metadata" text,
	"ip_address" text,
	"user_agent" text,
	"anonymized" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_log_archive" (
	"id" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"metadata" text,
	"original_created_at" timestamp NOT NULL,
	"archived_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"category" "knowledge_category" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"content" text NOT NULL,
	"tags" text DEFAULT '[]',
	"applicable_to" text,
	"metadata" text DEFAULT '{}',
	"embedding" vector(1536),
	"embedding_status" "embedding_status" DEFAULT 'pending',
	"version" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sandbox_id" text,
	"status" "onboarding_status" DEFAULT 'pending' NOT NULL,
	"project_type" text,
	"project_name" text,
	"project_description" text,
	"gathered_requirements" text,
	"generated_config" text,
	"selected_model" text,
	"selected_small_model" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "onboarding_sandbox_unique" UNIQUE("sandbox_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandboxes" ADD CONSTRAINT "sandboxes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_sandbox_id_sandboxes_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "public"."sandboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_opencode_config" ADD CONSTRAINT "user_opencode_config_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_opencode_files" ADD CONSTRAINT "user_opencode_files_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_sessions" ADD CONSTRAINT "onboarding_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_sessions" ADD CONSTRAINT "onboarding_sessions_sandbox_id_sandboxes_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "public"."sandboxes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_provider_id_idx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "sandboxes_user_id_idx" ON "sandboxes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sandboxes_status_idx" ON "sandboxes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sandboxes_container_id_idx" ON "sandboxes" USING btree ("container_id");--> statement-breakpoint
CREATE INDEX "chat_messages_session_idx" ON "chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "chat_messages_external_idx" ON "chat_messages" USING btree ("session_id","external_message_id");--> statement-breakpoint
CREATE INDEX "chat_messages_created_idx" ON "chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chat_sessions_user_idx" ON "chat_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_sessions_sandbox_idx" ON "chat_sessions" USING btree ("sandbox_id");--> statement-breakpoint
CREATE INDEX "chat_sessions_status_idx" ON "chat_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "oauth_state_provider_id_idx" ON "oauth_state" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "oauth_state_status_idx" ON "oauth_state" USING btree ("status");--> statement-breakpoint
CREATE INDEX "provider_credentials_provider_id_idx" ON "provider_credentials" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "providers_is_default_idx" ON "providers" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "user_opencode_config_user_id_idx" ON "user_opencode_config" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_opencode_files_user_id_idx" ON "user_opencode_files" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_opencode_files_type_idx" ON "user_opencode_files" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "user_preferences_user_id_idx" ON "user_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "container_addons_category_idx" ON "container_addons" USING btree ("category");--> statement-breakpoint
CREATE INDEX "container_flavors_is_default_idx" ON "container_flavors" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "container_tiers_is_default_idx" ON "container_tiers" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "resource_tiers_is_default_idx" ON "resource_tiers" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "activity_log_user_idx" ON "activity_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_log_action_idx" ON "activity_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "activity_log_entity_idx" ON "activity_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "activity_log_created_idx" ON "activity_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "activity_archive_action_idx" ON "activity_log_archive" USING btree ("action");--> statement-breakpoint
CREATE INDEX "activity_archive_original_idx" ON "activity_log_archive" USING btree ("original_created_at");--> statement-breakpoint
CREATE INDEX "knowledge_category_idx" ON "knowledge_documents" USING btree ("category");--> statement-breakpoint
CREATE INDEX "knowledge_updated_idx" ON "knowledge_documents" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "knowledge_embedding_status_idx" ON "knowledge_documents" USING btree ("embedding_status");--> statement-breakpoint
CREATE INDEX "onboarding_user_id_idx" ON "onboarding_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "onboarding_sandbox_id_idx" ON "onboarding_sessions" USING btree ("sandbox_id");--> statement-breakpoint
CREATE INDEX "onboarding_status_idx" ON "onboarding_sessions" USING btree ("status");