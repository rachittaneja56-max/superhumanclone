DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'isAdmin'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "isAdmin" boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'is_admin'
  ) THEN
    EXECUTE '
      UPDATE "users"
      SET "isAdmin" = COALESCE("isAdmin", "is_admin")
      WHERE "is_admin" IS NOT NULL
    ';
  END IF;
END $$;
