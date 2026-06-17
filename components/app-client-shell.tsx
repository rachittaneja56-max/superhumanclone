'use client'
import { CommandPalette } from '@/components/search/CommandPalette'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useAblyChannel } from '@/hooks/useAblyChannel'
import { KeyboardShortcutsDialog } from '@/components/app/KeyboardShortcutsDialog'
import { GlobalAgentWidget } from '@/components/agent/GlobalAgentWidget'

export function AppClientShell({ userId }: { userId: string }) {
  useKeyboardShortcuts()
  useAblyChannel(userId)
  return (
    <>
      <CommandPalette />
      <KeyboardShortcutsDialog />
      <GlobalAgentWidget />
    </>
  )
}
