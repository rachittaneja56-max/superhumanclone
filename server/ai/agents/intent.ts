import "server-only";

import type { AgentContext, AgentIntent } from "./types";

function isPendingEmailClarification(history?: AgentContext["history"]) {
  if (!history?.length) return false;

  const recentAssistant = [...history]
    .reverse()
    .find((message) => message.role === "assistant" && message.content.trim());

  if (!recentAssistant) return false;

  const lower = recentAssistant.content.toLowerCase();
  return (
    /what should i say in the email\??/.test(lower) ||
    /share a draft after the slash command/i.test(lower) ||
    /drafting email/i.test(lower) ||
    /subject.*body/i.test(lower)
  );
}

export function detectIntent(message: string, threadContext?: string, history?: AgentContext["history"]): AgentIntent {
  const lower = message.toLowerCase().trim();
  const hasThreadContext = !!threadContext?.trim();
  const hasCalendarVerb = /\b(schedule|book|set up|set-up|plan|arrange|create|add|invite)\b/.test(lower);
  const hasCalendarObject = /\b(meeting|calendar|event|meet|invite)\b/.test(lower);
  const hasCalendarTiming = /\b(today|tomorrow|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|at\s+\d|\d{1,2}(?::\d{2})?\s*(?:am|pm)|noon|midnight)\b/.test(lower);

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
  if ((hasCalendarVerb && hasCalendarObject) || (hasCalendarObject && hasCalendarTiming)) {
    return "calendar";
  }
  if (
    /\bsend\b/.test(lower) &&
    (/\b(email|mail|message|thread|this|that)\b/.test(lower) || hasThreadContext)
  ) {
    return "action";
  }
  if (isPendingEmailClarification(history) && message.trim().length > 0 && message.trim().length <= 200) {
    return "action";
  }
  return "general";
}
