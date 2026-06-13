'use client'

import { useTransition } from 'react'
import { acceptPrivacyPolicy } from './actions'

export function PrivacyButton() {
  const [isPending, startTransition] = useTransition()

  return (
    <button 
      onClick={() => startTransition(() => acceptPrivacyPolicy())}
      disabled={isPending}
      className="flex w-full items-center justify-center h-10 rounded-lg bg-accent text-accent-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
    >
      {isPending ? 'Saving...' : 'I Understand & Agree →'}
    </button>
  )
}
