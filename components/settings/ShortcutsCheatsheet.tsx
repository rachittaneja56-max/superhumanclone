"use client";

import { useUIStore } from "@/store/ui-store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const shortcuts = [
  { keys: ["⌘", "K"], description: "Open Command Palette" },
  { keys: ["?"], description: "Show Keyboard Shortcuts" },
  { keys: ["C"], description: "Compose Email" },
  { keys: ["J", "K"], description: "Navigate Emails" },
  { keys: ["E"], description: "Archive Email" },
  { keys: ["R"], description: "Reply" },
];

export function ShortcutsCheatsheet() {
  const { cheatsheetOpen, toggleCheatsheet } = useUIStore();

  return (
    <Dialog open={cheatsheetOpen} onOpenChange={toggleCheatsheet}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>Navigate Aethra quickly with these shortcuts.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-4">
          {shortcuts.map((shortcut, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{shortcut.description}</span>
              <div className="flex gap-1">
                {shortcut.keys.map((k, j) => (
                  <kbd key={j} className="px-2 py-1 bg-muted rounded-md text-xs font-mono text-muted-foreground border border-border shadow-sm">
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
