import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function main() {
  await db.execute(sql`ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'email_archived'`);
  console.log("Enum altered successfully");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
