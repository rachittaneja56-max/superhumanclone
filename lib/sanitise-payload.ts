type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const SENSITIVE_KEYS = ['body', 'content', 'text', 'html', 'snippet', 'subject'] as const;

export function sanitisePayload(payload: unknown): JsonValue {
  if (payload === null || payload === undefined) {
    return null;
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => sanitisePayload(item));
  }

  if (typeof payload === 'object') {
    const sanitised: Record<string, JsonValue> = {};

    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive));
      sanitised[key] = isSensitive ? '[REDACTED]' : sanitisePayload(value);
    }

    return sanitised;
  }

  if (typeof payload === 'string' || typeof payload === 'number' || typeof payload === 'boolean') {
    return payload;
  }

  return null;
}
