import { createCorsair } from 'corsair'
import { gmail } from '@corsair-dev/gmail'
import { googlecalendar } from '@corsair-dev/googlecalendar'
import pg from 'pg'
const { Pool } = pg

// DATABASE_URL_UNPOOLED for persistent TCP connection
// Corsair needs a real pg Pool, not Neon HTTP driver
const pool = new Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
})

export const corsair = createCorsair({
  plugins: [
    gmail({
      credentials: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    }),
    googlecalendar({
      credentials: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    }),
  ],
  database: pool,
  kek: process.env.CORSAIR_KEK!,
  multiTenancy: true,
})

// Validate critical env vars at startup
if (!process.env.CORSAIR_KEK) {
  throw new Error(
    'CORSAIR_KEK is not set. Generate with: openssl rand -hex 32\n' +
    'WARNING: Losing this key permanently breaks all user connections.'
  )
}
if (!process.env.DATABASE_URL_UNPOOLED && !process.env.DATABASE_URL) {
  throw new Error('A database URL is required for Corsair SDK')
}
