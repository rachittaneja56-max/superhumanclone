'use client'
import { CommandPalette } from '@/components/search/CommandPalette'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useAblyChannel } from '@/hooks/useAblyChannel'

export function AppClientShell({ userId }: { userId: string }) {
  useKeyboardShortcuts()
  useAblyChannel(userId)
  return (
    <>
      <CommandPalette />
    </>
  )
}
