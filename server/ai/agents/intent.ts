import "server-only";

import type { AgentIntent } from "./types";

export function detectIntent(message: string, threadContext?: string): AgentIntent {
  const lower = message.toLowerCase().trim();

  if (lower.startsWith("/")) return "compose";
  if (/\b(triage|classify|priority|urgent)\b/.test(lower) && !!threadContext) return "triage";
  if (/\b(tl;dr|tldr|summari[sz]e|digest)\b/.test(lower) && !!threadContext) return "summarizer";
  if (/\b(reply|respond|draft a reply|write back)\b/.test(lower) && !!threadContext) return "reply";
  if (/\b(schedule|meeting|calendar|event|meet)\b/.test(lower)) return "calendar";
  if (/\b(send|archive|delete|trash|mark unread|mark read|create)\b/.test(lower)) return "action";
  return "general";
}
