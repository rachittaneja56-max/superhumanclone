import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './server/db/schema';
import { eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '.env.local') });

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('No DATABASE_URL found');
    return;
  }
  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle({ client: sql, schema });
  
  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, 'rachittaneja56@gmail.com')
  });

  if (!user) {
    console.log('User rachittaneja56@gmail.com not found in DB');
  } else {
    console.log('User found:', { email: user.email, role: user.role, isAdmin: user.isAdmin });
  }

  const user2 = await db.query.users.findFirst({
    where: eq(schema.users.email, 'rachiitaneja56@gmail.com')
  });
  if (!user2) {
    console.log('User rachiitaneja56@gmail.com not found in DB');
  } else {
    console.log('User found:', { email: user2.email, role: user2.role, isAdmin: user2.isAdmin });
  }
}

main();
