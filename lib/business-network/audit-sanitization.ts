const SECRET_KEY_PATTERN = /(?:token|secret|password|authorization|cookie)/i;

export function sanitizeBusinessAuditValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(sanitizeBusinessAuditValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SECRET_KEY_PATTERN.test(key))
        .map(([key, nested]) => [key, sanitizeBusinessAuditValue(nested)]),
    );
  }
  return value;
}
