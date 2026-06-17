"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";

export function AgentContextEntry() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  if (pathname === "/agent" || pathname.startsWith("/agent/")) {
    return null;
  }

  const captureContext = buildCaptureContext(pathname, searchParams);

  return (
    <div className="border-b border-border bg-surface/85 px-4 py-3 backdrop-blur sm:px-5 lg:px-6">
      <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground-subtle">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            Agent context
          </div>
          <p className="mt-1 text-sm text-foreground-muted">
            Capture a safe summary of this page, then continue in the full Agent workspace.
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push(`/agent?context=${encodeURIComponent(captureContext)}`)}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 px-4 text-sm font-medium text-accent transition-colors hover:bg-accent/15"
        >
          Capture screen context
        </button>
      </div>
    </div>
  );
}

function buildCaptureContext(pathname: string, searchParams: ReadonlyURLSearchParams) {
  const title = typeof document !== "undefined" ? document.title : "Current page";
  const base = [`Page title: ${title}`, `Path: ${pathname}`];

  if (pathname.startsWith("/inbox")) {
    const folder = searchParams.get("folder") || "inbox";
    const threadId = pathname.startsWith("/inbox/") ? pathname.split("/").slice(2).join("/") : searchParams.get("thread");
    const compose = searchParams.get("compose") === "true" ? "Compose open" : null;
    base.push("Workspace: Mail");
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
