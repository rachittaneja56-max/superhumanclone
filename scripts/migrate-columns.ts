import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function main() {
  await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS gmail_connected BOOLEAN DEFAULT false NOT NULL`);
  await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS calendar_connected BOOLEAN DEFAULT false NOT NULL`);
  console.log("Columns added successfully");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
