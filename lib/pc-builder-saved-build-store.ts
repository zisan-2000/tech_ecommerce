import "server-only";

import { createHash, randomBytes } from "node:crypto";
import {
  canonicalPcBuilderSavedSelections,
  isPcBuilderSavedBuildId,
  isPcBuilderShareToken,
  normalizePcBuilderSavedBuildName,
  parsePcBuilderSavedSelections,
  type PcBuilderSavedSelections,
} from "@/lib/pc-builder-saved-build";
import { prisma } from "@/lib/prisma";
import { validatePcBuilderSelectionLive } from "@/lib/storefront-pc-builder";
import type { PcBuilderSlotKey } from "@/lib/pc-builder";

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

function toLiveSelections(selections: PcBuilderSavedSelections) {
  return selections as Partial<Record<PcBuilderSlotKey, string>>;
}

function toSummary(row: SavedBuildRow): PcBuilderSavedBuildSummary {
  const selections = toSelections(row.selections);
  return {
    id: row.id,
    name: row.name,
    shareToken: row.shareToken,
    selections,
    slotCount: Object.keys(selections).length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function restoreRow(row: SavedBuildRow) {
  const build = toSummary(row);
  const live = await validatePcBuilderSelectionLive(toLiveSelections(build.selections));
  return { build, ...live };
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
  mode?: "save" | "share";
}) {
  const selections = toSelections(input.selections);
  const live = await validatePcBuilderSelectionLive(toLiveSelections(selections));
  if (live.missingSlots.length > 0) {
    throw new PcBuilderSavedBuildError(
      "PC_BUILDER_SAVED_COMPONENT_UNAVAILABLE",
      "One or more selected components are no longer available and cannot be saved safely.",
      409,
    );
  }

  const canonical = canonicalPcBuilderSavedSelections(selections);
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
    return { build: toSummary(rows[0] ?? existing[0]), ...live };
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
    JSON.stringify(selections),
  );
  return { build: toSummary(rows[0]), ...live };
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
