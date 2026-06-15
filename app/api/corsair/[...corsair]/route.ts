import { toNextJsHandler } from 'corsair'
import { corsair } from '@/corsair'

const handler = toNextJsHandler(corsair)

export const { GET, POST } = handler
