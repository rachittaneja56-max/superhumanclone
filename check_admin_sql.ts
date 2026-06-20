import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('No DATABASE_URL found');
    return;
  }
  const sql = neon(process.env.DATABASE_URL);
  
  const result = await sql`SELECT id, email FROM users WHERE email = 'rachittaneja56@gmail.com' OR email = 'rachiitaneja56@gmail.com'`;
  
  console.log('User status:', result);
}

main().catch(console.error);
