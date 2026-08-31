const MIN_PRODUCTION_SECRET_LENGTH = 32;

export function resolveBusinessSecuritySecret(
  names: readonly string[],
  developmentFallback: string,
): string {
  const configured = names
    .map((name) => process.env[name]?.trim())
    .find((value): value is string => Boolean(value));

  if (configured) {
    if (
      process.env.NODE_ENV === "production" &&
      configured.length < MIN_PRODUCTION_SECRET_LENGTH
    ) {
      throw new Error(`${names[0]} must contain at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production.`);
    }
    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(`${names[0]} is required in production.`);
  }
  return developmentFallback;
}
