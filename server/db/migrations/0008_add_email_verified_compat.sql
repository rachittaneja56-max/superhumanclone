DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'email_verified'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "email_verified" timestamp;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'emailVerified'
  ) THEN
    EXECUTE '
      UPDATE "users"
      SET "email_verified" = COALESCE("email_verified", "emailVerified")
      WHERE "emailVerified" IS NOT NULL
    ';
  END IF;
END $$;
