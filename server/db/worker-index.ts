import pg from 'pg';
const { Pool } = pg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

if (!process.env.DATABASE_URL_UNPOOLED) {
  throw new Error('DATABASE_URL_UNPOOLED environment variable is missing.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED });
export const workerDb = drizzle(pool, { schema });
