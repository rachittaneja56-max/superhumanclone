export type AiConsentRule = {
  pattern: string;
  isBlocked: boolean;
};

/**
 * Checks if an email address matches a domain pattern securely without RegExp.
 * @param email The full email address.
 * @param pattern The domain pattern (e.g. "@hdfcbank.com", "@*.law", "admin@exact.com")
 */
export function matchesDomainPattern(email: string, pattern: string): boolean {
  const lowerEmail = email.toLowerCase();
  const lowerPattern = pattern.toLowerCase();

  if (!lowerPattern.startsWith('@')) {
    return lowerEmail === lowerPattern;
  }

  const parts = lowerEmail.split('@');
  if (parts.length !== 2) {
    return false;
  }
  const domain = parts[1];

  if (lowerPattern.startsWith('@*.')) {
    const suffix = lowerPattern.slice(2); 
    return domain === suffix.slice(1) || domain.endsWith(suffix);
  }

  return `@${domain}` === lowerPattern;
}

/**
 * Checks if an email matches any of the given blocked rules.
 * @param email The email address to check.
 * @param rules An array of blocked domain rules.
 */
export function isDomainBlocked(email: string, rules: AiConsentRule[]): boolean {
  for (const rule of rules) {
    if (rule.isBlocked && matchesDomainPattern(email, rule.pattern)) {
      return true;
    }
  }
  return false;
}
