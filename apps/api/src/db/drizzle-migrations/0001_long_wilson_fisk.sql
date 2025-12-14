ALTER TABLE "provider_credentials" DROP CONSTRAINT "provider_credentials_provider_id_unique";--> statement-breakpoint
ALTER TABLE "oauth_state" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD CONSTRAINT "oauth_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_state_user_id_idx" ON "oauth_state" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "provider_credentials_user_id_idx" ON "provider_credentials" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_user_provider_unique" UNIQUE("user_id","provider_id");