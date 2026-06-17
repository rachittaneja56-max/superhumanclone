ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'user';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_role_check"
      CHECK ("role" IN ('user', 'admin', 'superadmin'));
  END IF;
END $$;

UPDATE "users"
SET "role" = 'superadmin',
    "is_admin" = true
WHERE lower("email") = 'rachiitaneja56@gmail.com';

UPDATE "users"
SET "role" = 'admin',
    "is_admin" = true
WHERE "is_admin" = true
  AND "role" = 'user'
  AND lower("email") <> 'rachiitaneja56@gmail.com';

ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'admin_promoted';
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'admin_demoted';
