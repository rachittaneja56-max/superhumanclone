import { neon } from "@neondatabase/serverless";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  
  try {
    await sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_admin" boolean DEFAULT false NOT NULL`;
    console.log("Migration successful: added is_admin");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}
main();
