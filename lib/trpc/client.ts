'use client'
import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import type { AppRouter } from '@/server/trpc/router'

export const trpc = createTRPCReact<AppRouter>()
export const trpcClient = createTRPCClient()
import { inferRouterOutputs } from '@trpc/server'
export type RouterOutputs = inferRouterOutputs<AppRouter>

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: '/api/trpc',
        transformer: superjson,
        headers() {
          return {
            'x-trpc-csrf': 'aethra-client',
          }
        },
      }),
    ],
  })
}
