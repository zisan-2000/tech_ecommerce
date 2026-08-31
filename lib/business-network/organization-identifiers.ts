import "server-only";

import { Prisma } from "@/generated/prisma";
import { BusinessNetworkError } from "./business-error";

export const ORGANIZATION_IDENTIFIER_CONFLICT_MESSAGE =
  "An organization with this Trade License, TIN, or BIN already exists.";

type OrganizationIdentifiers = {
  tradeLicenseNo?: string | null;
  tin?: string | null;
  bin?: string | null;
};

export function normalizeOrganizationIdentifier(value: string | null | undefined) {
  const normalized = value
    ?.normalize("NFKC")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return normalized || null;
}

function identifierKeys(identifiers: OrganizationIdentifiers) {
  return {
    tradeLicenseNo: normalizeOrganizationIdentifier(identifiers.tradeLicenseNo),
    tin: normalizeOrganizationIdentifier(identifiers.tin),
    bin: normalizeOrganizationIdentifier(identifiers.bin),
  };
}

/**
 * Must run inside the caller's serializable transaction. Advisory locks make
 * competing application/admin requests for the same identity deterministic;
 * the database trigger remains the final defence for every other write path.
 */
export async function assertOrganizationIdentifiersAvailable(
  tx: Prisma.TransactionClient,
  identifiers: OrganizationIdentifiers,
  excludeOrganizationId?: string,
) {
  const keys = identifierKeys(identifiers);
  const locks = [
    keys.tradeLicenseNo && `organization:trade-license:${keys.tradeLicenseNo}`,
    keys.tin && `organization:tin:${keys.tin}`,
    keys.bin && `organization:bin:${keys.bin}`,
  ].filter((value): value is string => Boolean(value));

  if (locks.length === 0) return;

  // This stable Trade License → TIN → BIN order matches the database trigger
  // and prevents deadlocks when two requests contain several identifiers.
  for (const lock of locks) {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))
    `);
  }

  const conflicts = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "Organization"
    WHERE (${excludeOrganizationId ?? null}::text IS NULL OR "id" <> ${excludeOrganizationId ?? null})
      AND (
        (${keys.tradeLicenseNo}::text IS NOT NULL AND NULLIF(regexp_replace(upper(btrim("tradeLicenseNo")), '[^A-Z0-9]', '', 'g'), '') = ${keys.tradeLicenseNo})
        OR (${keys.tin}::text IS NOT NULL AND NULLIF(regexp_replace(upper(btrim("tin")), '[^A-Z0-9]', '', 'g'), '') = ${keys.tin})
        OR (${keys.bin}::text IS NOT NULL AND NULLIF(regexp_replace(upper(btrim("bin")), '[^A-Z0-9]', '', 'g'), '') = ${keys.bin})
      )
    LIMIT 1
  `);

  if (conflicts.length > 0) {
    throw new BusinessNetworkError(
      409,
      "ORGANIZATION_IDENTIFIER_CONFLICT",
      ORGANIZATION_IDENTIFIER_CONFLICT_MESSAGE,
    );
  }
}
