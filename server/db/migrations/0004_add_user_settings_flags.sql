ALTER TABLE "user_settings" ADD COLUMN "ai_enabled" boolean DEFAULT true NOT NULL;
ALTER TABLE "user_settings" ADD COLUMN "draft_suggestions_enabled" boolean DEFAULT true NOT NULL;
ALTER TABLE "user_settings" ADD COLUMN "auto_tag_enabled" boolean DEFAULT true NOT NULL;
