import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

const userId = '566de13b-3646-4955-93bc-835004a5a3c7'
const emails = await sql`SELECT id, from_address, subject FROM emails WHERE user_id = ${userId}`
console.log(`User has ${emails.length} emails:`)
emails.forEach(e => console.log(JSON.stringify(e)))
