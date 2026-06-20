import { sql } from "drizzle-orm";
import { db } from "./server/db";

async function main() {
  const result = await db.execute(sql`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name='users';
  `);
  console.log(result.map(r => r.column_name));
  process.exit(0);
}
main();
