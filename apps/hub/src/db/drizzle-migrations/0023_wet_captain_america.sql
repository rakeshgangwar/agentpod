DROP TABLE "user_resource_limits" CASCADE;--> statement-breakpoint
DROP TABLE "sandbox_permissions" CASCADE;--> statement-breakpoint
DROP TABLE "sandboxes" CASCADE;--> statement-breakpoint
DROP TABLE "chat_messages" CASCADE;--> statement-breakpoint
DROP TABLE "chat_sessions" CASCADE;--> statement-breakpoint
DROP TABLE "oauth_state" CASCADE;--> statement-breakpoint
DROP TABLE "provider_credentials" CASCADE;--> statement-breakpoint
DROP TABLE "providers" CASCADE;--> statement-breakpoint
DROP TABLE "settings" CASCADE;--> statement-breakpoint
DROP TABLE "user_opencode_config" CASCADE;--> statement-breakpoint
DROP TABLE "user_opencode_files" CASCADE;--> statement-breakpoint
DROP TABLE "user_preferences" CASCADE;--> statement-breakpoint
DROP TABLE "container_addons" CASCADE;--> statement-breakpoint
DROP TABLE "container_flavors" CASCADE;--> statement-breakpoint
DROP TABLE "container_tiers" CASCADE;--> statement-breakpoint
DROP TABLE "resource_tiers" CASCADE;--> statement-breakpoint
DROP TABLE "activity_log" CASCADE;--> statement-breakpoint
DROP TABLE "activity_log_archive" CASCADE;--> statement-breakpoint
DROP TABLE "agent_feedback" CASCADE;--> statement-breakpoint
DROP TABLE "agent_metrics" CASCADE;--> statement-breakpoint
DROP TABLE "agent_routing_logs" CASCADE;--> statement-breakpoint
DROP TABLE "agent_sessions" CASCADE;--> statement-breakpoint
DROP TABLE "agent_reviews" CASCADE;--> statement-breakpoint
DROP TABLE "agents" CASCADE;--> statement-breakpoint
DROP TABLE "sandbox_agents" CASCADE;--> statement-breakpoint
DROP TABLE "user_agents" CASCADE;--> statement-breakpoint
DROP TABLE "knowledge_documents" CASCADE;--> statement-breakpoint
DROP TABLE "onboarding_sessions" CASCADE;--> statement-breakpoint
DROP TABLE "sandbox_preview_ports" CASCADE;--> statement-breakpoint
DROP TABLE "task_templates" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_executions" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_step_logs" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_webhooks" CASCADE;--> statement-breakpoint
DROP TABLE "workflows" CASCADE;--> statement-breakpoint
DROP TABLE "message_branches" CASCADE;--> statement-breakpoint
DROP TABLE "session_forks" CASCADE;--> statement-breakpoint
DROP TABLE "mcp_api_keys" CASCADE;--> statement-breakpoint
DROP TABLE "mcp_connection_logs" CASCADE;--> statement-breakpoint
DROP TABLE "mcp_endpoints" CASCADE;--> statement-breakpoint
DROP TABLE "mcp_namespace_servers" CASCADE;--> statement-breakpoint
DROP TABLE "mcp_namespaces" CASCADE;--> statement-breakpoint
DROP TABLE "mcp_oauth_sessions" CASCADE;--> statement-breakpoint
DROP TABLE "mcp_servers" CASCADE;--> statement-breakpoint
DROP TABLE "mcp_tool_overrides" CASCADE;--> statement-breakpoint
DROP TYPE "public"."permission_status";--> statement-breakpoint
DROP TYPE "public"."sandbox_status";--> statement-breakpoint
DROP TYPE "public"."chat_message_role";--> statement-breakpoint
DROP TYPE "public"."chat_message_status";--> statement-breakpoint
DROP TYPE "public"."chat_session_status";--> statement-breakpoint
DROP TYPE "public"."chat_source";--> statement-breakpoint
DROP TYPE "public"."auth_type";--> statement-breakpoint
DROP TYPE "public"."oauth_status";--> statement-breakpoint
DROP TYPE "public"."opencode_file_extension";--> statement-breakpoint
DROP TYPE "public"."opencode_file_type";--> statement-breakpoint
DROP TYPE "public"."theme_mode";--> statement-breakpoint
DROP TYPE "public"."agent_routing_type";--> statement-breakpoint
DROP TYPE "public"."agent_session_status";--> statement-breakpoint
DROP TYPE "public"."agent_mode";--> statement-breakpoint
DROP TYPE "public"."agent_source";--> statement-breakpoint
DROP TYPE "public"."agent_squad";--> statement-breakpoint
DROP TYPE "public"."agent_status";--> statement-breakpoint
DROP TYPE "public"."agent_tier";--> statement-breakpoint
DROP TYPE "public"."review_status";--> statement-breakpoint
DROP TYPE "public"."subscription_plan";--> statement-breakpoint
DROP TYPE "public"."subscription_status";--> statement-breakpoint
DROP TYPE "public"."embedding_status";--> statement-breakpoint
DROP TYPE "public"."knowledge_category";--> statement-breakpoint
DROP TYPE "public"."onboarding_status";--> statement-breakpoint
DROP TYPE "public"."workflow_execution_status";--> statement-breakpoint
DROP TYPE "public"."workflow_step_status";--> statement-breakpoint
DROP TYPE "public"."workflow_trigger_type";--> statement-breakpoint
DROP TYPE "public"."fork_creator";--> statement-breakpoint
DROP TYPE "public"."fork_type";--> statement-breakpoint
DROP TYPE "public"."mcp_auth_type";--> statement-breakpoint
DROP TYPE "public"."mcp_endpoint_auth_type";--> statement-breakpoint
DROP TYPE "public"."mcp_oauth_status";--> statement-breakpoint
DROP TYPE "public"."mcp_server_type";