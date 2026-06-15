'use client'
import { CommandPalette } from '@/components/search/CommandPalette'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

export function AppClientShell({ userId }: { userId: string }) {
  useKeyboardShortcuts()
  return (
    <>
      <CommandPalette />
      {/* Add Ably connection here when Day 4 is built */}
    </>
  )
}
