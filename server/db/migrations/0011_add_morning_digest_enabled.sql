ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "morning_digest_enabled" boolean NOT NULL DEFAULT false;
