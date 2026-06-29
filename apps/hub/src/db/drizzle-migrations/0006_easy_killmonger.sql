CREATE TYPE "public"."agent_routing_type" AS ENUM('single', 'team', 'workflow');--> statement-breakpoint
CREATE TYPE "public"."agent_session_status" AS ENUM('active', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."agent_source" AS ENUM('default', 'marketplace', 'custom', 'gift');--> statement-breakpoint
CREATE TYPE "public"."agent_squad" AS ENUM('orchestration', 'development', 'product', 'operations', 'security', 'data');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('active', 'deprecated', 'hidden', 'pending_review');--> statement-breakpoint
CREATE TYPE "public"."agent_tier" AS ENUM('central', 'foundation', 'specialized', 'premium');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'published', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'cancelled', 'expired');--> statement-breakpoint
ALTER TYPE "public"."sandbox_status" ADD VALUE 'sleeping' BEFORE 'error';--> statement-breakpoint
CREATE TABLE "agent_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"rating" integer,
	"helpful" integer,
	"feedback" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_name" text NOT NULL,
	"date" timestamp NOT NULL,
	"total_sessions" integer DEFAULT 0,
	"completed_sessions" integer DEFAULT 0,
	"abandoned_sessions" integer DEFAULT 0,
	"total_messages" integer DEFAULT 0,
	"avg_messages_per_session" real,
	"avg_session_duration_sec" real,
	"routed_from_central" integer DEFAULT 0,
	"escalated_to_other" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_routing_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sandbox_id" text NOT NULL,
	"session_id" text,
	"user_message" text NOT NULL,
	"routing_type" "agent_routing_type" NOT NULL,
	"selected_agents" text[] NOT NULL,
	"workflow_id" text,
	"intent" jsonb,
	"reasoning" text,
	"processing_time_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sandbox_id" text NOT NULL,
	"chat_session_id" text,
	"agent_name" text NOT NULL,
	"agent_role" text NOT NULL,
	"agent_squad" text NOT NULL,
	"routing_type" "agent_routing_type" NOT NULL,
	"workflow_id" text,
	"status" "agent_session_status" DEFAULT 'active',
	"message_count" integer DEFAULT 0,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"last_activity_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_presets" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"agent_slugs" text[] NOT NULL,
	"sort_order" integer DEFAULT 0,
	"is_default" boolean DEFAULT false,
	"is_system" boolean DEFAULT true,
	"user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_presets_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "agent_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"user_id" text NOT NULL,
	"rating" integer NOT NULL,
	"title" text,
	"review" text,
	"status" "review_status" DEFAULT 'published',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_reviews_agent_user_unique" UNIQUE("agent_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"emoji" text,
	"description" text,
	"squad" "agent_squad" NOT NULL,
	"tier" "agent_tier" DEFAULT 'foundation',
	"tags" text[],
	"category" text,
	"is_builtin" boolean DEFAULT true,
	"is_premium" boolean DEFAULT false,
	"price_monthly" real,
	"price_yearly" real,
	"publisher_id" text,
	"publisher_name" text,
	"install_count" integer DEFAULT 0,
	"rating_avg" real,
	"rating_count" integer DEFAULT 0,
	"config" jsonb NOT NULL,
	"opencode_content" text NOT NULL,
	"status" "agent_status" DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agents_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sandbox_agents" (
	"id" text PRIMARY KEY NOT NULL,
	"sandbox_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"enabled" boolean DEFAULT true,
	"priority" integer DEFAULT 0,
	"settings" jsonb,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"added_by" text,
	CONSTRAINT "sandbox_agents_sandbox_agent_unique" UNIQUE("sandbox_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "user_agents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"source" "agent_source" DEFAULT 'default',
	"subscription_status" "subscription_status",
	"subscription_started_at" timestamp,
	"subscription_expires_at" timestamp,
	"subscription_plan" "subscription_plan",
	"custom_name" text,
	"custom_config" jsonb,
	"acquired_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_agents_user_agent_unique" UNIQUE("user_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "task_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"category" text NOT NULL,
	"prompt" text NOT NULL,
	"placeholders" jsonb,
	"is_system" boolean DEFAULT false NOT NULL,
	"user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_feedback" ADD CONSTRAINT "agent_feedback_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_feedback" ADD CONSTRAINT "agent_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_routing_logs" ADD CONSTRAINT "agent_routing_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_routing_logs" ADD CONSTRAINT "agent_routing_logs_sandbox_id_sandboxes_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "public"."sandboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_routing_logs" ADD CONSTRAINT "agent_routing_logs_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_sandbox_id_sandboxes_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "public"."sandboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_chat_session_id_chat_sessions_id_fk" FOREIGN KEY ("chat_session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_presets" ADD CONSTRAINT "agent_presets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_reviews" ADD CONSTRAINT "agent_reviews_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_reviews" ADD CONSTRAINT "agent_reviews_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_publisher_id_user_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_agents" ADD CONSTRAINT "sandbox_agents_sandbox_id_sandboxes_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "public"."sandboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_agents" ADD CONSTRAINT "sandbox_agents_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_agents" ADD CONSTRAINT "sandbox_agents_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agents" ADD CONSTRAINT "user_agents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agents" ADD CONSTRAINT "user_agents_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_feedback_session_idx" ON "agent_feedback" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "agent_feedback_agent_idx" ON "agent_feedback" USING btree ("agent_name");--> statement-breakpoint
CREATE INDEX "agent_metrics_agent_idx" ON "agent_metrics" USING btree ("agent_name");--> statement-breakpoint
CREATE INDEX "agent_metrics_date_idx" ON "agent_metrics" USING btree ("date");--> statement-breakpoint
CREATE INDEX "agent_routing_logs_user_idx" ON "agent_routing_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_routing_logs_created_idx" ON "agent_routing_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_sessions_user_idx" ON "agent_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_sessions_sandbox_idx" ON "agent_sessions" USING btree ("sandbox_id");--> statement-breakpoint
CREATE INDEX "agent_sessions_agent_idx" ON "agent_sessions" USING btree ("agent_name");--> statement-breakpoint
CREATE INDEX "agent_sessions_status_idx" ON "agent_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_presets_user_idx" ON "agent_presets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_presets_is_default_idx" ON "agent_presets" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "agent_presets_is_system_idx" ON "agent_presets" USING btree ("is_system");--> statement-breakpoint
CREATE INDEX "agent_reviews_agent_idx" ON "agent_reviews" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_reviews_status_idx" ON "agent_reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agents_squad_idx" ON "agents" USING btree ("squad");--> statement-breakpoint
CREATE INDEX "agents_tier_idx" ON "agents" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "agents_category_idx" ON "agents" USING btree ("category");--> statement-breakpoint
CREATE INDEX "agents_is_builtin_idx" ON "agents" USING btree ("is_builtin");--> statement-breakpoint
CREATE INDEX "agents_status_idx" ON "agents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agents_publisher_idx" ON "agents" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX "sandbox_agents_sandbox_idx" ON "sandbox_agents" USING btree ("sandbox_id");--> statement-breakpoint
CREATE INDEX "sandbox_agents_agent_idx" ON "sandbox_agents" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "sandbox_agents_enabled_idx" ON "sandbox_agents" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "user_agents_user_idx" ON "user_agents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_agents_source_idx" ON "user_agents" USING btree ("source");--> statement-breakpoint
CREATE INDEX "user_agents_subscription_idx" ON "user_agents" USING btree ("subscription_status");--> statement-breakpoint
CREATE INDEX "task_templates_category_idx" ON "task_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "task_templates_user_id_idx" ON "task_templates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_templates_is_system_idx" ON "task_templates" USING btree ("is_system");