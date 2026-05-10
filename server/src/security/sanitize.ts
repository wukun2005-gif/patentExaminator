/**
 * Sanitize user input before sending to AI providers.
 * Removes sensitive patterns like API keys, emails, phone numbers.
 */

const DEFAULT_PATTERNS = [
  { pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g, replace: "[EMAIL]" },
  { pattern: /\b1[3-9]\d{9}\b/g, replace: "[PHONE]" },
  { pattern: /(?:sk|tp|ak)-[A-Za-z0-9]{20,}/g, replace: "[API_KEY]" }
];

export interface SanitizeRule {
  pattern: string;
  replace: string;
  note?: string;
}

export function sanitizeText(
  text: string,
  customRules?: SanitizeRule[]
): string {
  let result = text;

  // Apply default patterns
  for (const rule of DEFAULT_PATTERNS) {
    result = result.replace(rule.pattern, rule.replace);
  }

  // Apply custom rules
  if (customRules) {
    for (const rule of customRules) {
      try {
        const regex = new RegExp(rule.pattern, "g");
        result = result.replace(regex, rule.replace);
      } catch {
        // Skip invalid regex patterns
      }
    }
  }

  return result;
}
