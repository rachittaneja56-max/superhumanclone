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

export function sanitiseAgentInput(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<img[^>]*>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<meta[^>]*>/gi, " ")
    .replace(/<link[^>]*>/gi, " ")
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
  return `${input.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

export function sanitiseAgentOutput(input: string, maxChars: number) {
  return enforceAgentOutputLength(redactSensitiveAgentOutput(input).trim(), maxChars);
}
