"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { Bot, ChevronDown, Sparkles, X } from "lucide-react";
import { useUIStore } from "@/store/ui-store";
import { cn } from "@/lib/utils";
import { AgentChat } from "@/components/agent/AgentChat";

export function GlobalAgentWidget() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const agentPanelOpen = useUIStore((state) => state.agentPanelOpen);
  const closeAgentPanel = useUIStore((state) => state.closeAgentPanel);
  const toggleAgentPanel = useUIStore((state) => state.toggleAgentPanel);
  const [approvedPageContext, setApprovedPageContext] = useState<string | null>(null);
  const [agentSessionId] = useState(() => crypto.randomUUID());
  const captureContext = buildCaptureContext(pathname, searchParams);

  const isAgentRoute = pathname === "/agent" || pathname.startsWith("/agent/");

  useEffect(() => {
    if (!agentPanelOpen) {
      setApprovedPageContext(null);
    }
  }, [agentPanelOpen]);

  if (isAgentRoute) return null;
  const pageContext = approvedPageContext;

  return (
    <>
      <div className="group fixed bottom-4 right-4 z-[60] flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2 overflow-visible">
        <div className="w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface/95 p-3 shadow-[0_16px_48px_rgba(0,0,0,0.2)] backdrop-blur">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground-subtle">
            Agent
          </div>
          <p className="mt-1 text-xs leading-5 text-foreground-muted">
            Capture the current page before opening Agent.
          </p>
          <button
            type="button"
            onClick={() => {
              const href = `/agent?context=${encodeURIComponent(captureContext)}`
              router.push(href)
              closeAgentPanel()
            }}
            className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-xl border border-accent/30 bg-accent/10 px-3 text-sm font-medium text-accent transition-colors hover:bg-accent/15"
          >
            Capture screen context
          </button>
        </div>

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

      {agentPanelOpen && (
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
                  onClick={() => setApprovedPageContext(buildCaptureContext(pathname, searchParams))}
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

function buildCaptureContext(pathname: string, searchParams: ReadonlyURLSearchParams) {
  const title = typeof document !== "undefined" ? document.title : "Current page";
  const base = [`Page title: ${title}`, `Path: ${pathname}`];

  if (pathname.startsWith("/inbox")) {
    const folder = searchParams.get("folder") || "inbox";
    const threadId = pathname.startsWith("/inbox/") ? pathname.split("/").slice(2).join("/") : searchParams.get("thread");
    const compose = searchParams.get("compose") === "true" ? "Compose open" : null;
    base.push(`Workspace: Mail`);
    base.push(`Folder: ${folder}`);
    if (threadId) base.push(`Thread: ${threadId}`);
    if (compose) base.push(compose);
    base.push("Context: safe mailbox summary only");
    return base.join("\n");
  }

  if (pathname.startsWith("/calendar")) {
    return [...base, "Workspace: Calendar", "Context: safe page summary only"].join("\n");
  }

  if (pathname.startsWith("/dashboard")) {
    return [...base, "Workspace: Dashboard", "Context: safe overview summary only"].join("\n");
  }

  if (pathname.startsWith("/billing")) {
    return [...base, "Workspace: Billing", "Context: safe page summary only"].join("\n");
  }

  if (pathname.startsWith("/settings")) {
    return [...base, "Workspace: Settings", "Context: safe page summary only"].join("\n");
  }

  return [...base, "Context: safe page summary only"].join("\n");
}
