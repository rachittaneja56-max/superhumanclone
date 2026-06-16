"use client";

import React, { useState } from "react";
import { AgentChat } from "@/components/agent/AgentChat";

export default function AgentPage() {
  const [sessionId] = useState(() => crypto.randomUUID());

  return (
    <div className="h-full w-full overflow-hidden p-4 sm:p-5">
      <AgentChat sessionId={sessionId} />
    </div>
  );
}
