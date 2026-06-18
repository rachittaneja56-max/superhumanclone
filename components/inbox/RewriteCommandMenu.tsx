"use client";

import { Wand2 } from "lucide-react";

import { type RewriteCommandId } from "@/lib/ai-rewrite-commands";
import { cn } from "@/lib/utils";

type RewriteMenuCommand = {
  id: RewriteCommandId;
  label: string;
  slash: string;
  aliases: readonly string[];
  description: string;
};

export function RewriteCommandMenu({
  commands,
  query,
  onSelect,
  className,
}: {
  commands: readonly RewriteMenuCommand[];
  query: string;
  onSelect: (commandId: RewriteCommandId) => void;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-surface p-2 shadow-xl", className)}>
      <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
        <Wand2 className="h-3.5 w-3.5 text-accent" />
        Rewrite commands
        {query ? <span className="normal-case tracking-normal text-foreground-muted">/{query}</span> : null}
      </div>
      <div className="mt-1 flex flex-col gap-1">
        {commands.length ? (
          commands.map((command) => (
            <button
              key={command.id}
              type="button"
              onClick={() => onSelect(command.id)}
              className="rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-accent/20 hover:bg-accent/5"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-foreground">{command.label}</span>
                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-foreground-muted">
                  {command.slash}
                </span>
              </div>
              <div className="mt-1 text-xs leading-5 text-foreground-muted">{command.description}</div>
              {command.aliases.length > 1 ? (
                <div className="mt-1 text-[11px] text-foreground-subtle">
                  Also matches {command.aliases.slice(1).join(", ")}
                </div>
              ) : null}
            </button>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border px-3 py-3 text-sm text-foreground-muted">
            No rewrite commands match this slash shortcut yet.
          </div>
        )}
      </div>
    </div>
  );
}
