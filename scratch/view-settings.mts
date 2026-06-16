import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

const settings = await sql`SELECT * FROM user_settings`
console.log('User settings:')
console.log(settings)

const accounts = await sql`SELECT * FROM corsair_accounts`
console.log('Corsair accounts in detail:')
accounts.forEach((a: any) => {
  console.log(`ID: ${a.id}, TenantId: ${a.tenant_id}, IntegrationId: ${a.integration_id}`)
})

const integrations = await sql`SELECT * FROM corsair_integrations`
console.log('Corsair integrations:')
integrations.forEach((i: any) => {
  console.log(`ID: ${i.id}, Name: ${i.name}`)
})
