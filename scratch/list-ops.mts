import { corsair } from '../corsair'
import { getSchema } from 'corsair'

try {
  console.log('googlecalendar.api.events.getMany schema:')
  console.log(getSchema(corsair, 'googlecalendar.api.events.getMany'))
} catch (e) {
  console.error(e)
}

try {
  console.log('\ngooglecalendar.api.events.get schema:')
  console.log(getSchema(corsair, 'googlecalendar.api.events.get'))
} catch (e) {
  console.error(e)
}
