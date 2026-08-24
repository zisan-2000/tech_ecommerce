const PC_BUILDER_DATABASE_OBJECTS = [
  "PcBuildCartItem",
  "PcBuildOrderItem",
  "PcBuilderSavedBuild",
  "CartItem.lineKey",
] as const;

type DatabaseErrorLike = {
  code?: unknown;
  message?: unknown;
  meta?: unknown;
  cause?: unknown;
};

function errorText(error: DatabaseErrorLike) {
  const meta =
    error.meta && typeof error.meta === "object"
      ? (error.meta as Record<string, unknown>)
      : null;
  return [error.message, meta?.message, meta?.table, meta?.column]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

/**
 * Detects a deployment/schema readiness failure without treating ordinary
 * validation, stock or connectivity failures as missing PC Builder storage.
 */
export function isPcBuilderDatabaseInfrastructureError(error: unknown) {
  let current = error;

  for (let depth = 0; depth < 3; depth += 1) {
    if (!current || typeof current !== "object") return false;

    const candidate = current as DatabaseErrorLike;
    const meta =
      candidate.meta && typeof candidate.meta === "object"
        ? (candidate.meta as Record<string, unknown>)
        : null;
    const prismaCode = typeof candidate.code === "string" ? candidate.code : "";
    const databaseCode = typeof meta?.code === "string" ? meta.code : "";
    const text = errorText(candidate);
    const referencesRequiredObject = PC_BUILDER_DATABASE_OBJECTS.some((name) =>
      text.includes(name),
    );

    if (
      referencesRequiredObject &&
      (prismaCode === "P2021" ||
        prismaCode === "P2022" ||
        (prismaCode === "P2010" &&
          (databaseCode === "42P01" || databaseCode === "42703")))
    ) {
      return true;
    }

    current = candidate.cause;
  }

  return false;
}

export const PC_BUILDER_DATABASE_UNAVAILABLE = {
  error:
    "PC Builder storage is temporarily unavailable. Please retry after the database deployment completes.",
  code: "PC_BUILDER_DATABASE_UNAVAILABLE",
} as const;
