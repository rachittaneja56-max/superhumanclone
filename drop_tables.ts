import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  try {
    await sql`DROP SCHEMA public CASCADE;`;
    await sql`CREATE SCHEMA public;`;
    await sql`CREATE EXTENSION IF NOT EXISTS vector;`;
    console.log("All tables dropped successfully, vector extension restored.");
  } catch (e) {
    console.error("Error dropping tables:", e);
  }
}
main();
