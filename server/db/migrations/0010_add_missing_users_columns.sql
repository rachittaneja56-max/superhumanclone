DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'role'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "role" text NOT NULL DEFAULT 'user';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'isAdmin'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "isAdmin" boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'plan'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "plan" text NOT NULL DEFAULT 'free';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'is_flagged'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "is_flagged" boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'ai_disabled'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "ai_disabled" boolean NOT NULL DEFAULT false;
  END IF;
END $$;

UPDATE "users"
SET "role" = 'superadmin',
    "isAdmin" = true
WHERE lower("email") = 'rachiitaneja56@gmail.com';

