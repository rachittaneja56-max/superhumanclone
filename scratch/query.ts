import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED });

async function main() {
  const res = await pool.query(`
    SELECT * FROM user_settings LIMIT 1
  `);
  console.log(res.rows);
  process.exit(0);
}
main().catch(console.error);
