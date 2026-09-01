const SECRET_KEY_PATTERN = /(?:token|secret|password|authorization|cookie|encrypted|accountnumber(?!last4)|routingnumber)/i;

export function sanitizeBusinessAuditValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return null;
  if (Array.isArray(value)) return value.map(sanitizeBusinessAuditValue);

  if (typeof value === "object") {
    const jsonSerializable = value as { toJSON?: () => unknown };
    if (typeof jsonSerializable.toJSON === "function") {
      try {
        const serialized = jsonSerializable.toJSON();
        if (serialized !== value) {
          return sanitizeBusinessAuditValue(serialized);
        }
      } catch {
        // Fall through to field-by-field sanitization if a custom toJSON fails.
      }
    }

    if (
      value.constructor?.name === "Decimal" &&
      "toString" in value &&
      typeof value.toString === "function"
    ) {
      return value.toString();
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SECRET_KEY_PATTERN.test(key))
        .map(([key, nested]) => [key, sanitizeBusinessAuditValue(nested)]),
    );
  }

  return value;
}
