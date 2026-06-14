export function sanitisePayload(payload: any): any {
  if (payload === null || payload === undefined) {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map(item => sanitisePayload(item));
  }

  if (typeof payload === 'object') {
    const sanitised: Record<string, any> = {};
    const sensitiveKeys = ['body', 'content', 'text', 'html', 'snippet', 'subject'];

    for (const [key, value] of Object.entries(payload)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveKeys.some(sensitive => lowerKey.includes(sensitive));

      if (isSensitive) {
        sanitised[key] = '[REDACTED]';
      } else {
        sanitised[key] = sanitisePayload(value);
      }
    }
    return sanitised;
  }

  return payload;
}
