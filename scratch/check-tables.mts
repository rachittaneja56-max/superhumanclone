import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

// Check what columns exist in each table
const accountCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'account' ORDER BY ordinal_position`
const accountsCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'accounts' ORDER BY ordinal_position`

console.log('account (singular) columns:', accountCols.map((c: any) => c.column_name))
console.log('accounts (plural) columns:', accountsCols.map((c: any) => c.column_name))

// Show existing rows in accounts (plural) to understand data
const rows = await sql`SELECT * FROM accounts LIMIT 5`
console.log('\nExisting rows in accounts (plural):')
rows.forEach((r: any) => console.log(JSON.stringify(r)))
