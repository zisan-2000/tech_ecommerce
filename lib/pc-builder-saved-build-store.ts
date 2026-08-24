import "server-only";

import { createHash, randomBytes } from "node:crypto";
import {
  canonicalPcBuilderSavedSelections,
  isPcBuilderSavedBuildId,
  isPcBuilderShareToken,
  normalizePcBuilderSavedBuildName,
  parsePcBuilderSavedExtraItems,
  parsePcBuilderSavedSelections,
  type PcBuilderSavedExtraItems,
  type PcBuilderSavedSelections,
} from "@/lib/pc-builder-saved-build";
import { prisma } from "@/lib/prisma";
import {
  resolvePcBuilderExtraItems,
  validatePcBuilderSelectionLive,
} from "@/lib/storefront-pc-builder";
import type { PcBuilderProduct, PcBuilderSlotKey } from "@/lib/pc-builder";

const MAX_SAVED_BUILDS_PER_USER = 25;

type SavedBuildRow = {
  id: string;
  userId: string;
  name: string;
  shareToken: string;
  selectionHash: string;
  selections: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type PcBuilderSavedBuildSummary = {
  id: string;
  name: string;
  shareToken: string;
  selections: PcBuilderSavedSelections;
  extraItems: PcBuilderSavedExtraItems;
  slotCount: number;
  createdAt: string;
  updatedAt: string;
};

export class PcBuilderSavedBuildError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "PcBuilderSavedBuildError";
  }
}

function createSavedBuildId() {
  return `pcbs_${randomBytes(16).toString("hex")}`;
}

function createShareToken() {
  return `pcshare_${randomBytes(24).toString("hex")}`;
}

function toSelections(input: unknown) {
  const parsed = parsePcBuilderSavedSelections(input);
  if (!parsed) {
    throw new PcBuilderSavedBuildError(
      "PC_BUILDER_SAVED_SELECTION_INVALID",
      "A saved PC build requires at least one valid component selection.",
    );
  }
  return parsed;
}

function toExtraItems(input: unknown) {
  const parsed = parsePcBuilderSavedExtraItems(input);
  if (!parsed) {
    throw new PcBuilderSavedBuildError(
      "PC_BUILDER_SAVED_SELECTION_INVALID",
      "Additional PC build items are invalid.",
    );
  }
  return parsed;
}

function toLiveSelections(selections: PcBuilderSavedSelections) {
  return selections as Partial<Record<PcBuilderSlotKey, string>>;
}

function toLiveExtraItems(extraItems: PcBuilderSavedExtraItems) {
  return extraItems as Partial<Record<PcBuilderSlotKey, string[]>>;
}

// Rows saved before multi-add existed store the flat selections object
// directly; newer rows store { selections, extraItems }. Both are read here.
function splitStoredPayload(stored: unknown): {
  selections: unknown;
  extraItems: unknown;
} {
  if (
    stored &&
    typeof stored === "object" &&
    !Array.isArray(stored) &&
    "selections" in (stored as Record<string, unknown>)
  ) {
    const record = stored as Record<string, unknown>;
    return { selections: record.selections, extraItems: record.extraItems };
  }
  return { selections: stored, extraItems: undefined };
}

function toSummary(row: SavedBuildRow): PcBuilderSavedBuildSummary {
  const { selections: storedSelections, extraItems: storedExtraItems } =
    splitStoredPayload(row.selections);
  const selections = toSelections(storedSelections);
  const extraItems = toExtraItems(storedExtraItems);
  return {
    id: row.id,
    name: row.name,
    shareToken: row.shareToken,
    selections,
    extraItems,
    slotCount:
      Object.keys(selections).length +
      Object.values(extraItems).reduce((sum, ids) => sum + (ids?.length ?? 0), 0),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function restoreRow(row: SavedBuildRow) {
  const build = toSummary(row);
  const [live, extra] = await Promise.all([
    validatePcBuilderSelectionLive(toLiveSelections(build.selections)),
    resolvePcBuilderExtraItems(toLiveExtraItems(build.extraItems)),
  ]);
  return { build, ...live, extraItems: extra.items, missingExtraCount: extra.missingCount };
}

export async function listPcBuilderSavedBuilds(userId: string) {
  const rows = await prisma.$queryRawUnsafe<SavedBuildRow[]>(
    'SELECT "id", "userId", "name", "shareToken", "selectionHash", "selections", "createdAt", "updatedAt" FROM "PcBuilderSavedBuild" WHERE "userId" = $1 ORDER BY "updatedAt" DESC LIMIT $2',
    userId,
    MAX_SAVED_BUILDS_PER_USER,
  );
  return rows.map(toSummary);
}

export async function savePcBuilderBuild(input: {
  userId: string;
  name?: unknown;
  selections: unknown;
  extraItems?: unknown;
  mode?: "save" | "share";
}) {
  const selections = toSelections(input.selections);
  const extraItems = toExtraItems(input.extraItems);
  const [live, extra] = await Promise.all([
    validatePcBuilderSelectionLive(toLiveSelections(selections)),
    resolvePcBuilderExtraItems(toLiveExtraItems(extraItems)),
  ]);
  if (live.missingSlots.length > 0 || extra.missingCount > 0) {
    throw new PcBuilderSavedBuildError(
      "PC_BUILDER_SAVED_COMPONENT_UNAVAILABLE",
      "One or more selected components are no longer available and cannot be saved safely.",
      409,
    );
  }

  const canonical = canonicalPcBuilderSavedSelections(selections, extraItems);
  const selectionHash = createHash("sha256").update(canonical).digest("hex");
  const name = normalizePcBuilderSavedBuildName(
    input.name,
    input.mode === "share" ? "Shared PC Build" : "My PC Build",
  );

  const existing = await prisma.$queryRawUnsafe<SavedBuildRow[]>(
    'SELECT "id", "userId", "name", "shareToken", "selectionHash", "selections", "createdAt", "updatedAt" FROM "PcBuilderSavedBuild" WHERE "userId" = $1 AND "selectionHash" = $2 LIMIT 1',
    input.userId,
    selectionHash,
  );

  if (existing[0]) {
    const rows = input.mode === "share"
      ? await prisma.$queryRawUnsafe<SavedBuildRow[]>(
          'UPDATE "PcBuilderSavedBuild" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "userId" = $2 RETURNING "id", "userId", "name", "shareToken", "selectionHash", "selections", "createdAt", "updatedAt"',
          existing[0].id,
          input.userId,
        )
      : await prisma.$queryRawUnsafe<SavedBuildRow[]>(
          'UPDATE "PcBuilderSavedBuild" SET "name" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $2 AND "userId" = $3 RETURNING "id", "userId", "name", "shareToken", "selectionHash", "selections", "createdAt", "updatedAt"',
          name,
          existing[0].id,
          input.userId,
        );
    return { build: toSummary(rows[0] ?? existing[0]), ...live, extraItems: extra.items };
  }

  const counts = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    'SELECT COUNT(*)::bigint AS "count" FROM "PcBuilderSavedBuild" WHERE "userId" = $1',
    input.userId,
  );
  if (Number(counts[0]?.count ?? 0) >= MAX_SAVED_BUILDS_PER_USER) {
    throw new PcBuilderSavedBuildError(
      "PC_BUILDER_SAVED_BUILD_LIMIT",
      `You can keep up to ${MAX_SAVED_BUILDS_PER_USER} saved PC builds. Delete an older build first.`,
      409,
    );
  }

  const id = createSavedBuildId();
  const shareToken = createShareToken();
  const rows = await prisma.$queryRawUnsafe<SavedBuildRow[]>(
    'INSERT INTO "PcBuilderSavedBuild" ("id", "userId", "name", "shareToken", "selectionHash", "selections") VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING "id", "userId", "name", "shareToken", "selectionHash", "selections", "createdAt", "updatedAt"',
    id,
    input.userId,
    name,
    shareToken,
    selectionHash,
    JSON.stringify({ selections, extraItems }),
  );
  return { build: toSummary(rows[0]), ...live, extraItems: extra.items };
}

export async function getOwnedPcBuilderSavedBuild(userId: string, id: string) {
  if (!isPcBuilderSavedBuildId(id)) return null;
  const rows = await prisma.$queryRawUnsafe<SavedBuildRow[]>(
    'SELECT "id", "userId", "name", "shareToken", "selectionHash", "selections", "createdAt", "updatedAt" FROM "PcBuilderSavedBuild" WHERE "id" = $1 AND "userId" = $2 LIMIT 1',
    id,
    userId,
  );
  return rows[0] ? restoreRow(rows[0]) : null;
}

export async function getSharedPcBuilderSavedBuild(shareToken: string) {
  if (!isPcBuilderShareToken(shareToken)) return null;
  const rows = await prisma.$queryRawUnsafe<SavedBuildRow[]>(
    'SELECT "id", "userId", "name", "shareToken", "selectionHash", "selections", "createdAt", "updatedAt" FROM "PcBuilderSavedBuild" WHERE "shareToken" = $1 LIMIT 1',
    shareToken,
  );
  return rows[0] ? restoreRow(rows[0]) : null;
}

export async function deletePcBuilderSavedBuild(userId: string, id: string) {
  if (!isPcBuilderSavedBuildId(id)) return false;
  const deleted = await prisma.$executeRawUnsafe(
    'DELETE FROM "PcBuilderSavedBuild" WHERE "id" = $1 AND "userId" = $2',
    id,
    userId,
  );
  return deleted > 0;
}
