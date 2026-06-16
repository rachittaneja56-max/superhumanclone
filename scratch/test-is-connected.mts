import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)
const userId = '566de13b-3646-4955-93bc-835004a5a3c7'

const gmailConnected = await sql`
  SELECT 1 FROM corsair_accounts a
  INNER JOIN corsair_integrations i ON a.integration_id = i.id
  WHERE a.tenant_id = ${userId} AND i.name = 'gmail'
`

const calConnected = await sql`
  SELECT 1 FROM corsair_accounts a
  INNER JOIN corsair_integrations i ON a.integration_id = i.id
  WHERE a.tenant_id = ${userId} AND i.name = 'googlecalendar'
`

console.log('gmailConnected:', gmailConnected.length > 0)
console.log('calConnected:', calConnected.length > 0)
