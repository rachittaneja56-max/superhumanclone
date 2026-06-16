"use client";

import { useUIStore } from "@/store/ui-store";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SHORTCUTS = [
  ["c", "Compose"],
  ["/", "Focus search"],
  ["j", "Move down"],
  ["k", "Move up"],
  ["Enter", "Open selected thread"],
  ["e", "Archive selected thread"],
  ["Delete", "Trash selected thread"],
  ["Backspace", "Trash selected thread"],
  ["u", "Mark unread/read"],
  ["?", "Open shortcuts"],
  ["Esc", "Close overlays"],
] as const;

export function KeyboardShortcutsDialog() {
  const { cheatsheetOpen, closeCheatsheet } = useUIStore();

  return (
    <Dialog open={cheatsheetOpen} onOpenChange={(open) => {
      if (!open) closeCheatsheet();
    }}>
      <DialogContent className="max-w-lg border-border bg-surface text-foreground">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Quick actions for the mail workspace.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {SHORTCUTS.map(([key, label]) => (
            <div key={key} className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2">
              <span className="text-sm text-foreground">{label}</span>
              <span className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground-muted">
                {key}
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
