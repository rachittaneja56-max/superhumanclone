import "server-only";

import type { AgentIntent } from "./types";

export function detectIntent(message: string, threadContext?: string): AgentIntent {
  const lower = message.toLowerCase().trim();
  const hasThreadContext = !!threadContext?.trim();

  if (lower.startsWith("/")) return "compose";
  if (/\b(triage|classify|priority|urgent)\b/.test(lower) && !!threadContext) return "triage";
  if (/\b(tl;dr|tldr|summari[sz]e|digest)\b/.test(lower) && !!threadContext) return "summarizer";
  if (/\b(reply|respond|draft a reply|write back)\b/.test(lower) && !!threadContext) return "reply";
  if (/\b(schedule|meeting|calendar|event|meet)\b/.test(lower)) return "calendar";
  if (
    /\bsend\b/.test(lower) &&
    (/\b(email|mail|message|thread|this|that)\b/.test(lower) || hasThreadContext)
  ) {
    return "action";
  }
  return "general";
}
