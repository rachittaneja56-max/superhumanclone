"use client";

import React, { useState } from "react";
import { AgentChat } from "@/components/agent/AgentChat";

export default function AgentPage() {
  const [sessionId] = useState(() => crypto.randomUUID());

  return (
    <div className="h-[calc(100vh-64px)] w-full">
      <AgentChat sessionId={sessionId} />
    </div>
  );
}
