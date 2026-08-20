import type { PcBuilderCheckoutBuild } from "./pc-builder-checkout";
import { pcBuildSelectionId } from "./pc-builder-grouping";

type CheckoutItem = {
  productId: string | number;
  variantId?: string | number | null;
  quantity?: unknown;
};

type MatchError = {
  code:
    | "PC_BUILD_COMPONENT_QUANTITY_LOCKED"
    | "PC_BUILDER_CART_CHANGED"
    | "PC_BUILDER_CART_GROUPING_AMBIGUOUS";
  buildId?: string;
};

export type PcBuilderOrderMatchResult = {
  builds: PcBuilderCheckoutBuild[];
  error: MatchError | null;
};

function buildSelectionIds(build: PcBuilderCheckoutBuild) {
  return Object.values(build.selections).filter(
    (value): value is string => Boolean(value),
  );
}

function selectionRows(items: CheckoutItem[]) {
  const rows = new Map<string, CheckoutItem[]>();
  for (const item of items) {
    const selectionId = pcBuildSelectionId(item);
    if (!selectionId) continue;
    const current = rows.get(selectionId) ?? [];
    current.push(item);
    rows.set(selectionId, current);
  }
  return rows;
}

function requiredCounts(builds: PcBuilderCheckoutBuild[]) {
  const counts = new Map<string, number>();
  for (const build of builds) {
    for (const selectionId of buildSelectionIds(build)) {
      counts.set(selectionId, (counts.get(selectionId) ?? 0) + 1);
    }
  }
  return counts;
}

export function matchPcBuilderBuildsToOrderItems(
  builds: PcBuilderCheckoutBuild[],
  items: CheckoutItem[],
): PcBuilderOrderMatchResult {
  if (!builds.length || !items.length) return { builds: [], error: null };

  const rows = selectionRows(items);
  const activeSelectionIds = new Set(
    builds.flatMap((build) => buildSelectionIds(build)),
  );

  for (const [selectionId, matchingRows] of rows) {
    if (!activeSelectionIds.has(selectionId)) continue;
    if (matchingRows.some((item) => Number(item.quantity ?? 0) !== 1)) {
      const build = builds.find((candidate) =>
        buildSelectionIds(candidate).includes(selectionId),
      );
      return {
        builds: [],
        error: {
          code: "PC_BUILD_COMPONENT_QUANTITY_LOCKED",
          buildId: build?.buildId,
        },
      };
    }
  }

  const candidates: Array<{
    builds: PcBuilderCheckoutBuild[];
    componentCount: number;
  }> = [];
  const subsetCount = 1 << builds.length;

  for (let mask = 1; mask < subsetCount; mask += 1) {
    const subset = builds.filter((_, index) => (mask & (1 << index)) !== 0);
    const required = requiredCounts(subset);
    let valid = true;
    let componentCount = 0;

    for (const [selectionId, count] of required) {
      componentCount += count;
      if ((rows.get(selectionId)?.length ?? 0) < count) {
        valid = false;
        break;
      }
    }

    if (valid) candidates.push({ builds: subset, componentCount });
  }

  if (!candidates.length) {
    const touched = builds.find((build) =>
      buildSelectionIds(build).some((selectionId) => rows.has(selectionId)),
    );
    return touched
      ? {
          builds: [],
          error: { code: "PC_BUILDER_CART_CHANGED", buildId: touched.buildId },
        }
      : { builds: [], error: null };
  }

  candidates.sort((left, right) => {
    if (right.componentCount !== left.componentCount) {
      return right.componentCount - left.componentCount;
    }
    return right.builds.length - left.builds.length;
  });
  const best = candidates[0];
  const tied = candidates.filter(
    (candidate) =>
      candidate.componentCount === best.componentCount &&
      candidate.builds.length === best.builds.length,
  );
  if (tied.length > 1) {
    return {
      builds: [],
      error: { code: "PC_BUILDER_CART_GROUPING_AMBIGUOUS" },
    };
  }

  const consumed = requiredCounts(best.builds);
  const selectedIds = new Set(best.builds.map((build) => build.buildId));
  for (const build of builds) {
    if (selectedIds.has(build.buildId)) continue;
    const touchedByUnconsumedRow = buildSelectionIds(build).some(
      (selectionId) =>
        (rows.get(selectionId)?.length ?? 0) > (consumed.get(selectionId) ?? 0),
    );
    if (touchedByUnconsumedRow) {
      return {
        builds: [],
        error: { code: "PC_BUILDER_CART_CHANGED", buildId: build.buildId },
      };
    }
  }

  return { builds: best.builds, error: null };
}
