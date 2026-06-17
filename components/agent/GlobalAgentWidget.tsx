"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, ChevronDown, Sparkles, X } from "lucide-react";
import { useUIStore } from "@/store/ui-store";
import { cn } from "@/lib/utils";
import { AgentChat } from "@/components/agent/AgentChat";

export function GlobalAgentWidget() {
  const pathname = usePathname();
  const agentPanelOpen = useUIStore((state) => state.agentPanelOpen);
  const closeAgentPanel = useUIStore((state) => state.closeAgentPanel);
  const toggleAgentPanel = useUIStore((state) => state.toggleAgentPanel);
  const [approvedPageContext, setApprovedPageContext] = useState<string | null>(null);
  const [agentSessionId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!agentPanelOpen) {
      setApprovedPageContext(null);
    }
  }, [agentPanelOpen]);

  const isAgentRoute = pathname === "/agent" || pathname.startsWith("/agent/");
  const isMailRoute = pathname.startsWith("/inbox");
  const pageContext = approvedPageContext;

  if (isAgentRoute) return null;

  return (
    <>
      <div className="group fixed bottom-4 right-4 z-[60] overflow-visible">
        <div className="relative flex flex-col items-end overflow-visible">
          <span className="pointer-events-none absolute -top-7 right-0 select-none rounded-full border border-border bg-surface/95 px-3 py-1 text-[11px] font-medium text-foreground-muted shadow-sm backdrop-blur">
            Need help?
          </span>
          <button
            type="button"
            aria-label={agentPanelOpen ? "Close agent" : "Open agent"}
            onClick={() => toggleAgentPanel()}
            className={cn(
              "group relative inline-flex h-14 w-14 items-center justify-center rounded-full border border-border bg-surface text-accent shadow-[0_16px_48px_rgba(0,0,0,0.42)] transition-transform duration-200 hover:-translate-y-0.5 hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-0",
              agentPanelOpen && "ring-2 ring-accent/35",
            )}
          >
            <Bot className="h-6 w-6 transition-transform duration-200 group-hover:scale-105" />
          </button>
        </div>
      </div>

      {agentPanelOpen && !isMailRoute && (
        <aside className="fixed bottom-20 right-4 z-[55] flex max-h-[min(78vh,44rem)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
                  <span>Agent</span>
                </div>
                <div className="mt-1 text-xs text-foreground-subtle">Ask Aethra from anywhere in the app.</div>
              </div>

              <button
                type="button"
                onClick={closeAgentPanel}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground"
                aria-label="Close agent"
              >
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-3">
              {pageContext ? (
                <button
                  type="button"
                  onClick={() => setApprovedPageContext(null)}
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent/15"
                >
                  <span className="inline-flex h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                  <span className="truncate">Context on</span>
                  <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setApprovedPageContext(buildPageContext(pathname))}
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground"
                >
                  <span className="inline-flex h-2 w-2 rounded-full bg-foreground-subtle/70" aria-hidden="true" />
                  <span className="truncate">Use current page as context</span>
                </button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden p-3">
            <div className="h-full min-h-0 overflow-hidden rounded-xl border border-border bg-background">
              <AgentChat
                sessionId={agentSessionId}
                threadContext={pageContext}
                onClearThreadContext={() => setApprovedPageContext(null)}
              />
            </div>
          </div>
        </aside>
      )}
    </>
  );
}

function buildPageContext(pathname: string) {
  const title = typeof document !== "undefined" ? document.title : "Current page";
  return `Page title: ${title}\nPath: ${pathname}`;
}
