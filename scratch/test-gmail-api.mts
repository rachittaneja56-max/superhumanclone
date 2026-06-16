import { corsair } from '../corsair'

const userId = '566de13b-3646-4955-93bc-835004a5a3c7'

const t = corsair.withTenant(userId) as any

try {
  console.log('Fetching live events using getMany...')
  const eventsResult = await t.googlecalendar.api.events.getMany({
    calendarId: 'primary',
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 50,
  })
  console.log('Success! Events:', JSON.stringify(eventsResult, null, 2))
} catch (err) {
  console.error('Error fetching events:', err)
}
