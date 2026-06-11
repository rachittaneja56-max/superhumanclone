/**
 * Recursively strips keys whose name contains forbidden words from an object.
 * Does not mutate the input object and does not recurse into arrays.
 * @param obj The payload to sanitise.
 * @returns A new sanitised payload object.
 */
export function sanitisePayload(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const forbiddenKeywords = ['body', 'content', 'text', 'html', 'snippet', 'subject'];

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    const isForbidden = forbiddenKeywords.some(keyword => lowerKey.includes(keyword));
    
    if (isForbidden) {
      continue;
    }

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitisePayload(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}
