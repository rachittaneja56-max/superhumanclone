"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, ChevronDown, MessageCircle, Sparkles, X } from "lucide-react";
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
  const pageContext = useMemo(() => {
    if (!approvedPageContext) return null;
    return approvedPageContext;
  }, [approvedPageContext]);

  if (isAgentRoute) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => toggleAgentPanel()}
        className={cn(
          "fixed bottom-4 right-4 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface text-accent shadow-[0_12px_40px_rgba(0,0,0,0.35)] transition-transform hover:scale-105 hover:bg-surface-raised",
          agentPanelOpen && "ring-2 ring-accent/40",
        )}
        aria-label="Open agent"
      >
        <Bot className="h-5 w-5" />
        </button>

      {agentPanelOpen && !isMailRoute && (
        <aside className="fixed bottom-20 right-4 z-40 flex max-h-[calc(100vh-6rem)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Sparkles className="h-4 w-4 text-accent" />
                Agent
              </div>
              <div className="text-xs text-foreground-subtle">Ask Aethra from anywhere in the app.</div>
            </div>
            <div className="flex items-center gap-1">
              {pageContext ? (
                <button
                  type="button"
                  onClick={() => setApprovedPageContext(null)}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground-muted hover:bg-surface-raised hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear context
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setApprovedPageContext(buildPageContext(pathname))}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-2.5 text-xs text-accent hover:bg-accent/15"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Use current page as context
                </button>
              )}
              <button
                type="button"
                onClick={closeAgentPanel}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-foreground-muted hover:bg-surface-raised hover:text-foreground"
                aria-label="Close agent"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
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
