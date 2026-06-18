"use client";

import { Keyboard, X } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUIStore } from "@/store/ui-store";

type ShortcutItem = {
  label: string;
  keys: string[];
  delimiter?: "plus" | "then" | "slash";
};

type ShortcutSection = {
  title: string;
  description: string;
  shortcuts: ShortcutItem[];
};

const SECTIONS: ShortcutSection[] = [
  {
    title: "Navigation",
    description: "Move through mail and close overlays without reaching for the mouse.",
    shortcuts: [
      { label: "Next email", keys: ["j"] },
      { label: "Previous email", keys: ["k"] },
      { label: "Open selected thread", keys: ["Enter"] },
      { label: "Close modal or composer", keys: ["Esc"] },
      { label: "Focus mail search", keys: ["/"] },
      { label: "Open shortcuts", keys: ["?"] },
    ],
  },
  {
    title: "Email actions",
    description: "Compose and manage the current message from the keyboard.",
    shortcuts: [
      { label: "Compose", keys: ["c"] },
      { label: "Reply", keys: ["r"] },
      { label: "Reply all", keys: ["a"] },
      { label: "Forward", keys: ["f"] },
    ],
  },
  {
    title: "App navigation",
    description: "Jump between the main app surfaces from anywhere.",
    shortcuts: [
      { label: "Open command palette", keys: ["Cmd/Ctrl", "K"], delimiter: "plus" },
      { label: "Go to Inbox", keys: ["g", "i"], delimiter: "then" },
      { label: "Go to Calendar", keys: ["g", "c"], delimiter: "then" },
      { label: "Go to Billing", keys: ["g", "b"], delimiter: "then" },
      { label: "Go to Dashboard", keys: ["g", "d"], delimiter: "then" },
      { label: "Go to Settings", keys: ["g", "s"], delimiter: "then" },
      { label: "Open Agent", keys: ["g", "a"], delimiter: "then" },
    ],
  },
];

export function KeyboardShortcutsDialog() {
  const cheatsheetOpen = useUIStore((state) => state.cheatsheetOpen);
  const closeCheatsheet = useUIStore((state) => state.closeCheatsheet);

  return (
    <Dialog
      open={cheatsheetOpen}
      onOpenChange={(open) => {
        if (!open) closeCheatsheet();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="w-[min(92vw,56rem)] max-w-none overflow-hidden border-border bg-surface p-0 text-foreground shadow-[0_30px_100px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/80 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent">
              <Keyboard className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <DialogTitle className="font-display text-xl font-semibold tracking-tight text-foreground">
                Keyboard Shortcuts
              </DialogTitle>
              <DialogDescription className="max-w-xl text-sm leading-6 text-foreground-muted">
                Keep the app moving with quick keys for navigation, mail actions, and app jumps.
              </DialogDescription>
            </div>
          </div>

          <button
            type="button"
            onClick={closeCheatsheet}
            aria-label="Close keyboard shortcuts"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground-muted transition-colors hover:bg-surface-overlay hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-6 overflow-y-auto px-6 py-6">
          {SECTIONS.map((section) => (
            <section key={section.title} className="space-y-3">
              <div className="space-y-1">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
                  {section.title}
                </h3>
                <p className="text-sm leading-6 text-foreground-muted">{section.description}</p>
              </div>

              <div className="grid gap-3">
                {section.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.label}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-background/80 px-4 py-3"
                  >
                    <span className="min-w-0 text-sm font-medium text-foreground">{shortcut.label}</span>
                    <ShortcutKeys keys={shortcut.keys} delimiter={shortcut.delimiter} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="flex items-center justify-end border-t border-border/80 bg-background/70 px-6 py-4">
          <button
            type="button"
            onClick={closeCheatsheet}
            className="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground shadow-sm transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutKeys({ keys, delimiter = "plus" }: { keys: string[]; delimiter?: "plus" | "then" | "slash" }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {keys.map((key, index) => (
        <span key={`${key}-${index}`} className="flex items-center gap-1.5">
          {index > 0 && (
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-foreground-subtle">
              {delimiter === "then" ? "then" : delimiter === "slash" ? "/" : "+"}
            </span>
          )}
          <kbd className="min-w-8 rounded-lg border border-border bg-surface px-2 py-1 text-center font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground shadow-sm">
            {key}
          </kbd>
        </span>
      ))}
    </div>
  );
}
