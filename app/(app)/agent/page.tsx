"use client";

import React, { useMemo, useState, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AgentChat } from "@/components/agent/AgentChat";

export default function AgentPage() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const context = useMemo(() => searchParams.get("context"), [searchParams]);
  const clearContext = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("context");
    const target = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(target);
  }, [pathname, router, searchParams]);

  return (
    <div className="h-full w-full overflow-hidden p-4 sm:p-5">
      <AgentChat sessionId={sessionId} threadContext={context ?? undefined} onClearContext={clearContext} />
    </div>
  );
}
