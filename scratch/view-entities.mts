
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

const userId = '566de13b-3646-4955-93bc-835004a5a3c7'

// Find account for this user
const accounts = await sql`SELECT * FROM corsair_accounts WHERE tenant_id = ${userId}`
console.log('Accounts for user:', accounts)

for (const acc of accounts) {
  const count = await sql`SELECT count(*) FROM corsair_entities WHERE account_id = ${acc.id}`
  console.log(`Account ${acc.id} has ${count[0].count} entities`)
  
  const entities = await sql`SELECT * FROM corsair_entities WHERE account_id = ${acc.id} LIMIT 5`
  console.log('Sample entities from Corsair:')
  entities.forEach((e: any) => {
    console.log(`ID: ${e.id}, Type: ${e.entity_type}, EntityId: ${e.entity_id}`)
    console.log('Data:', JSON.stringify(e.data, null, 2))
    console.log('------------------')
  })
}
