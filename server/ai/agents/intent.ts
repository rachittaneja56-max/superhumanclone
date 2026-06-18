import "server-only";

import type { AgentIntent } from "./types";

export function detectIntent(message: string, threadContext?: string): AgentIntent {
  const lower = message.toLowerCase().trim();
  const hasThreadContext = !!threadContext?.trim();

  if (lower.startsWith("/")) return "compose";
  if (/\b(find|search|look for|show me)\b/.test(lower) && /\b(email|emails|mail|inbox|thread|threads)\b/.test(lower)) {
    return "search";
  }
  if ((/\b(digest|attention today|what needs my attention|unread emails)\b/.test(lower) && !hasThreadContext)) {
    return "digest";
  }
  if (/\b(prep|prepare|brief)\b/.test(lower) && /\b(meeting|call|event|calendar)\b/.test(lower)) {
    return "meetingPrep";
  }
  if (/\b(triage|classify|priority|urgent)\b/.test(lower) && !!threadContext) return "triage";
  if (/\b(tl;dr|tldr|summari[sz]e|digest)\b/.test(lower) && !!threadContext) return "summarizer";
  if (/\b(reply|respond|draft a reply|write back)\b/.test(lower) && !!threadContext) return "reply";
  if (/\b(schedule|book|set up|set-up|plan|arrange|create)\b/.test(lower) && /\b(meeting|calendar|event|meet)\b/.test(lower)) {
    return "calendar";
  }
  if (
    /\bsend\b/.test(lower) &&
    (/\b(email|mail|message|thread|this|that)\b/.test(lower) || hasThreadContext)
  ) {
    return "action";
  }
  return "general";
}
