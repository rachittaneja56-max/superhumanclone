import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

console.log('Cleaning up empty emails from emails table...')
const deleted = await sql`DELETE FROM emails WHERE from_address = '' OR subject IS NULL`
console.log('Successfully deleted empty emails:', deleted)

// Also let's set gmail_connected to true for the users who have a gmail account in corsair_accounts
console.log('Updating user_settings connection flags based on corsair_accounts...')
const accounts = await sql`
  SELECT tenant_id, name FROM corsair_accounts a
  INNER JOIN corsair_integrations i ON a.integration_id = i.id
`

for (const acc of accounts) {
  if (acc.name === 'gmail') {
    await sql`
      UPDATE user_settings SET gmail_connected = true WHERE user_id = ${acc.tenant_id}
    `
    console.log(`Set gmail_connected to true for user ${acc.tenant_id}`)
  } else if (acc.name === 'googlecalendar') {
    await sql`
      UPDATE user_settings SET calendar_connected = true WHERE user_id = ${acc.tenant_id}
    `
    console.log(`Set calendar_connected to true for user ${acc.tenant_id}`)
  }
}
