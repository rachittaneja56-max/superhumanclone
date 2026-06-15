'use client'
import { trpc } from '@/lib/trpc/client'
import { useState } from 'react'
import { X } from 'lucide-react'

export function MorningDigestBanner() {
  const [dismissed, setDismissed] = useState(false)
  const { data, isLoading } = trpc.email.getMorningDigest.useQuery({}, {
    staleTime: 3600000,
    retry: 1,
  } as any)

  if (dismissed || isLoading || !data?.digest) return null

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border bg-accent/5">
      <span className="text-accent text-lg flex-shrink-0">✦</span>
      <p className="text-sm text-foreground flex-1 line-clamp-2">
        {data.digest}
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="text-foreground-subtle hover:text-foreground flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
