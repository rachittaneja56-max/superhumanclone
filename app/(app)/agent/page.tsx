"use client";

import React, { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AgentChat } from "@/components/agent/AgentChat";

export default function AgentPage() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const searchParams = useSearchParams();
  const context = useMemo(() => searchParams.get("context"), [searchParams]);

  return (
    <div className="h-full w-full overflow-hidden p-4 sm:p-5">
      <AgentChat sessionId={sessionId} threadContext={context ?? undefined} />
    </div>
  );
}
