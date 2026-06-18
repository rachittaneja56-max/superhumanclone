import "server-only";

import { and, desc, eq, ilike, or } from "drizzle-orm";

import { db } from "@/server/db";
import { emails } from "@/server/db/schema";
import { sanitiseAgentOutput } from "./sanitization";
import type { AgentContext, AgentResult } from "./types";

function extractSearchQuery(input: string) {
  return input
    .replace(/\b(find|search|look for|show me)\b/gi, "")
    .replace(/\b(email|emails|mail|inbox|thread|threads)\b/gi, "")
    .replace(/\babout\b/gi, "")
    .trim();
}

export async function runSearchAgent(context: AgentContext): Promise<AgentResult> {
  const query = extractSearchQuery(context.userMessage);

  if (!query) {
    return {
      intent: "search",
      indicator: "Searching your inbox...",
      text: "Share a mailbox search term so I can look through your inbox safely.",
    };
  }

  const results = await db.query.emails.findMany({
    where: and(
      eq(emails.userId, context.userId),
      eq(emails.is_deleted, false),
      eq(emails.ai_triage_skipped, false),
      or(
        ilike(emails.subject, `%${query}%`),
        ilike(emails.from_name, `%${query}%`),
        ilike(emails.from_address, `%${query}%`),
        ilike(emails.to_address, `%${query}%`),
        ilike(emails.snippet, `%${query}%`),
      ),
    ),
    columns: {
      from_name: true,
      from_address: true,
      subject: true,
      snippet: true,
      created_at: true,
    },
    orderBy: [desc(emails.created_at)],
    limit: 5,
  });

  if (results.length === 0) {
    return {
      intent: "search",
      indicator: "Searching your inbox...",
      text: `No matching emails found for "${sanitiseAgentOutput(query, 80)}".`,
    };
  }

  const lines = results.map((email) => {
    const sender = sanitiseAgentOutput(email.from_name || email.from_address || "Unknown sender", 80);
    const subject = sanitiseAgentOutput(email.subject || "(no subject)", 120);
    const snippet = sanitiseAgentOutput(email.snippet || "No preview available.", 140);
    const received = new Date(email.created_at).toLocaleDateString();
    return `- ${sender} | ${subject} | ${received} | ${snippet}`;
  });

  return {
    intent: "search",
    indicator: "Searching your inbox...",
    text: [`Inbox search results for "${sanitiseAgentOutput(query, 80)}".`, ...lines].join("\n"),
  };
}
