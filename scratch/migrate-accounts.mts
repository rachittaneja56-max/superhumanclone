import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

console.log('Migrating OAuth accounts from "accounts" (plural) to "account" (singular)...')

// Read all existing rows from the wrong table
const rows = await sql`SELECT * FROM accounts`
console.log(`Found ${rows.length} rows to migrate`)

if (rows.length === 0) {
  console.log('Nothing to migrate.')
  process.exit(0)
}

// Insert into the correct "account" table with correct camelCase column names
for (const row of rows as any[]) {
  try {
    await sql`
      INSERT INTO account (
        "userId",
        "type",
        "provider",
        "providerAccountId",
        "refresh_token",
        "access_token",
        "expires_at",
        "token_type",
        "scope",
        "id_token",
        "session_state"
      ) VALUES (
        ${row.user_id},
        ${row.type},
        ${row.provider},
        ${row.provider_account_id},
        ${row.refresh_token},
        ${row.access_token},
        ${row.expires_at},
        ${row.token_type},
        ${row.scope},
        ${row.id_token},
        ${row.session_state}
      )
      ON CONFLICT (provider, "providerAccountId") DO NOTHING
    `
    console.log(`✅ Migrated: ${row.provider}:${row.provider_account_id} (user: ${row.user_id})`)
  } catch (e: any) {
    console.error(`❌ Failed for ${row.provider_account_id}:`, e.message)
  }
}

// Verify
const [count] = await sql`SELECT COUNT(*) as count FROM account`
console.log(`\nDone! "account" table now has ${count.count} rows`)
