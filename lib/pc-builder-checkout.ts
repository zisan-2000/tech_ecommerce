import {
  PC_BUILDER_SLOTS,
  parsePcBuilderSelectionId,
  type PcBuilderSlotKey,
} from "./pc-builder";
import { isPcBuildId } from "./pc-builder-grouping";

export const PC_BUILDER_CHECKOUT_COOKIE = "pc_builder_checkout_v2";
export const PC_BUILDER_CHECKOUT_COOKIE_MAX_AGE = 2 * 60 * 60;
export const PC_BUILDER_CHECKOUT_MAX_BUILDS = 8;

export type PcBuilderCheckoutBuild = {
  buildId: string;
  selections: Partial<Record<PcBuilderSlotKey, string>>;
};

export type PcBuilderCheckoutState = {
  version: 2;
  builds: PcBuilderCheckoutBuild[];
};

const VALID_SLOT_KEYS = new Set<PcBuilderSlotKey>(
  PC_BUILDER_SLOTS.map((slot) => slot.key),
);

export function parsePcBuilderCheckoutBuild(
  input: unknown,
): PcBuilderCheckoutBuild | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const buildId = String(record.buildId ?? "").trim();
  if (!isPcBuildId(buildId)) return null;

  const rawSelections = record.selections;
  if (
    !rawSelections ||
    typeof rawSelections !== "object" ||
    Array.isArray(rawSelections)
  ) {
    return null;
  }

  const entries = Object.entries(rawSelections as Record<string, unknown>);
  if (entries.length < 1 || entries.length > PC_BUILDER_SLOTS.length) return null;

  const selections: Partial<Record<PcBuilderSlotKey, string>> = {};
  for (const [rawSlot, rawSelectionId] of entries) {
    const slot = rawSlot as PcBuilderSlotKey;
    const selectionId = String(rawSelectionId ?? "").trim();
    if (!VALID_SLOT_KEYS.has(slot) || !parsePcBuilderSelectionId(selectionId)) {
      return null;
    }
    selections[slot] = selectionId;
  }

  return { buildId, selections };
}

export function parsePcBuilderCheckoutState(
  input: unknown,
): PcBuilderCheckoutState | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  if (record.version !== 2 || !Array.isArray(record.builds)) return null;
  if (record.builds.length > PC_BUILDER_CHECKOUT_MAX_BUILDS) return null;

  const builds = record.builds.map(parsePcBuilderCheckoutBuild);
  if (builds.some((build) => !build)) return null;
  const validBuilds = builds as PcBuilderCheckoutBuild[];
  if (new Set(validBuilds.map((build) => build.buildId)).size !== validBuilds.length) {
    return null;
  }
  return { version: 2, builds: validBuilds };
}

export function createPcBuilderCheckoutBuild(
  buildId: string,
  selections: Partial<Record<PcBuilderSlotKey, string>>,
) {
  const build = parsePcBuilderCheckoutBuild({ buildId, selections });
  if (!build) {
    throw new Error("PC Builder checkout build could not be created safely.");
  }
  return build;
}

export function appendPcBuilderCheckoutBuild(
  state: PcBuilderCheckoutState | null,
  build: PcBuilderCheckoutBuild,
) {
  const previous = state?.builds ?? [];
  const withoutSame = previous.filter((item) => item.buildId !== build.buildId);
  if (withoutSame.length >= PC_BUILDER_CHECKOUT_MAX_BUILDS) return null;
  return { version: 2 as const, builds: [...withoutSame, build] };
}

export function serializePcBuilderCheckoutState(state: PcBuilderCheckoutState) {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

export function parsePcBuilderCheckoutCookie(
  value: string | null | undefined,
): PcBuilderCheckoutState | null {
  if (!value || value.length > 3800) return null;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    return parsePcBuilderCheckoutState(JSON.parse(decoded));
  } catch {
    return null;
  }
}

export function findPcBuilderCheckoutBuild(
  state: PcBuilderCheckoutState,
  buildId: string,
) {
  return state.builds.find((build) => build.buildId === buildId) ?? null;
}

export function findPcBuilderBuildMatches(
  state: PcBuilderCheckoutState,
  selectionId: string,
) {
  return state.builds.flatMap((build) =>
    Object.entries(build.selections).flatMap(([slot, selected]) =>
      selected === selectionId ? [{ build, slot: slot as PcBuilderSlotKey }] : [],
    ),
  );
}
