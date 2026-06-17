import "server-only";

const HEADER_PREFIXES = [
  "from:",
  "to:",
  "cc:",
  "bcc:",
  "reply-to:",
  "subject:",
  "date:",
  "message-id:",
  "return-path:",
  "received:",
  "dkim-signature:",
  "authentication-results:",
  "mime-version:",
  "content-type:",
];

const BLOCKED_CODE_REQUEST_PATTERNS = [
  /\b(write|generate|create|build|ship|refactor|debug|fix)\s+(?:the\s+)?(?:code|app|application|api|component|function|script|sql|query)\b/i,
  /\b(show|give|return)\s+(?:me\s+)?(?:the\s+)?code\b/i,
  /\bjavascript\b|\btypescript\b|\bpython\b|\breact\b|\bnext\.?js\b/i,
];

const OUT_OF_SCOPE_PATTERNS = [
  /\bweather\b/i,
  /\bstock\b/i,
  /\bcrypto\b/i,
  /\bsports?\b/i,
  /\brestaurant\b/i,
  /\bflight\b/i,
];

const ALLOWED_TOOL_REGISTRY = new Set([
  "searchEmails",
  "proposeSendEmail",
  "proposeCalendarEvent",
]);

export function sanitiseAgentInput(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<img[^>]*>/gi, " ")
    .replace(/\son\w+="[^"]*"/gi, " ")
    .replace(/\son\w+='[^']*'/gi, " ")
    .replace(/\bdata-[\w-]+="[^"]*"/gi, " ")
    .replace(/\bdata-[\w-]+='[^']*'/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<meta[^>]*>/gi, " ")
    .replace(/<link[^>]*>/gi, " ")
    .replace(/https?:\/\/[^\s"]*(?:pixel|track|beacon)[^\s"]*/gi, " ")
    .split(/\r?\n/)
    .filter((line) => {
      const normalized = line.trim().toLowerCase();
      return !HEADER_PREFIXES.some((prefix) => normalized.startsWith(prefix));
    })
    .join("\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function wrapAgentEmailContext(input: string) {
  return `<email_content>${sanitiseAgentInput(input)}</email_content>`;
}

export function wrapAgentCalendarContext(input: string) {
  return `<calendar_content>${sanitiseAgentInput(input)}</calendar_content>`;
}

export function redactSensitiveAgentOutput(input: string) {
  return input
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[redacted-card]")
    .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, "[redacted-aadhaar]")
    .replace(/\b(?:\+?\d{1,3}[ -]?)?(?:\d[ -]?){10,14}\b/g, "[redacted-phone]");
}

export function enforceAgentOutputLength(input: string, maxChars: number) {
  if (input.length <= maxChars) return input;
  return `${input.slice(0, Math.max(0, maxChars - 1)).trim()}...`;
}

export function isCodeGenerationRequest(input: string) {
  return BLOCKED_CODE_REQUEST_PATTERNS.some((pattern) => pattern.test(input));
}

export function isOutsideAethraScope(input: string) {
  return OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(input));
}

export function getScopeLimitMessage(input: string) {
  if (isCodeGenerationRequest(input)) {
    return "Aethra AI only helps with the Aethra product experience. It can summarize mail, help draft replies, prepare calendar suggestions, and propose approval cards, but it will not generate application code.";
  }

  if (isOutsideAethraScope(input)) {
    return "Aethra AI stays inside Aethra workflows such as mail, calendar, inbox triage, reply drafting, and approval-safe actions. That request is outside its scope.";
  }

  return null;
}

export function assertAllowedToolRegistry(input: string) {
  const toolMatches = [
    ...input.matchAll(/\b(?:tool|function|tool_call|function_call)\s*[:=]\s*["']?([a-zA-Z0-9_:-]+)["']?/gi),
  ];

  for (const match of toolMatches) {
    const toolName = match[1];
    if (toolName && !ALLOWED_TOOL_REGISTRY.has(toolName)) {
      throw new Error(`Disallowed tool request: ${toolName}`);
    }
  }
}

export function sanitiseAgentOutput(input: string, maxChars: number) {
  assertAllowedToolRegistry(input);
  return enforceAgentOutputLength(redactSensitiveAgentOutput(input).trim(), maxChars);
}
