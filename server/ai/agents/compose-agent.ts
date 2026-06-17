import "server-only";

import { rewriteDraft } from "../provider";
import { sanitiseAgentInput, sanitiseAgentOutput } from "./sanitization";
import type { AgentContext, AgentResult } from "./types";

const SLASH_INSTRUCTION_MAP = {
  "/improve": "improve_tone",
  "/shorter": "make_shorter",
  "/formal": "make_formal",
  "/bullet": "convert_to_bullets",
} as const;

export async function runComposeAgent(context: AgentContext): Promise<AgentResult> {
  const trimmed = context.userMessage.trim();
  const [command, ...rest] = trimmed.split(/\s+/);
  const body = sanitiseAgentInput(rest.join(" ").trim() || context.threadContext || "");

  if (!body) {
    return {
      intent: "compose",
      indicator: "Preparing draft rewrite",
      text: "Share a draft after the slash command and I’ll prepare a safe rewrite preview.",
    };
  }

  if (command === "/translate") {
    const [language, ...draftParts] = rest;
    const translated = await rewriteDraft(draftParts.join(" "), "translate", language || "English", {
      userId: context.userId,
    });
    return {
      intent: "compose",
      indicator: "Preparing draft rewrite",
      text: sanitiseAgentOutput(translated, 1200),
    };
  }

  const instruction = SLASH_INSTRUCTION_MAP[command as keyof typeof SLASH_INSTRUCTION_MAP];
  if (!instruction) {
    return {
      intent: "compose",
      indicator: "Preparing draft rewrite",
      text: "Available slash actions: /improve, /shorter, /formal, /bullet, /translate <language>.",
    };
  }

  const rewritten = await rewriteDraft(body, instruction, undefined, {
    userId: context.userId,
  });

  return {
    intent: "compose",
    indicator: "Preparing draft rewrite",
    text: sanitiseAgentOutput(rewritten, 1200),
  };
}
