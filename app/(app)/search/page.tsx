'use client'
import { useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import { useDebounce } from '@/hooks/useDebounce'
import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 200)
  const router = useRouter()

  const { data: results, isLoading } = trpc.search.vectorSearch.useQuery(
    { query: debouncedQuery, limit: 20 },
    {
      enabled: debouncedQuery.length >= 3,
      staleTime: 10000,
    }
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-subtle" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search emails..."
            className="w-full pl-9 pr-4 h-10 bg-surface-raised border border-border rounded-lg text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {query.length < 3 && (
          <p className="text-sm text-foreground-subtle text-center pt-8">
            Type at least 3 characters to search
          </p>
        )}
        {isLoading && (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-surface-raised rounded-lg animate-pulse" />
            ))}
          </div>
        )}
        {results?.map((result: any) => (
          <div
            key={result.id}
            onClick={() => router.push('/inbox/' + result.threadId)}
            className="p-3 rounded-lg hover:bg-surface-overlay cursor-pointer border border-transparent hover:border-border transition-all mb-1"
          >
            <p className="text-sm font-medium text-foreground truncate">
              {result.subject}
            </p>
            <p className="text-xs text-foreground-muted truncate mt-0.5">
              {result.fromName || result.fromAddress}
            </p>
          </div>
        ))}
        {results?.length === 0 && query.length >= 3 && !isLoading && (
          <p className="text-sm text-foreground-subtle text-center pt-8">
            No results for &quot;{query}&quot;
          </p>
        )}
      </div>
    </div>
  )
}
