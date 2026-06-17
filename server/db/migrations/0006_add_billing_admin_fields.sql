ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "plan" text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS "is_admin" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_flagged" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ai_disabled" boolean NOT NULL DEFAULT false;
