export const PC_BUILDER_SAVED_SLOT_KEYS = [
  "processor",
  "cooler",
  "motherboard",
  "memory",
  "storage",
  "graphics",
  "powerSupply",
  "case",
  "monitor",
  "casingCooler",
  "keyboard",
  "mouse",
  "speaker",
  "headphone",
  "networkAdapter",
  "antivirus",
  "ups",
] as const;

export type PcBuilderSavedSlotKey = (typeof PC_BUILDER_SAVED_SLOT_KEYS)[number];
export type PcBuilderSavedSelections = Partial<Record<PcBuilderSavedSlotKey, string>>;
export type PcBuilderSavedExtraItems = Partial<Record<PcBuilderSavedSlotKey, string[]>>;

const SLOT_SET = new Set<string>(PC_BUILDER_SAVED_SLOT_KEYS);
const SELECTION_ID_RE = /^[1-9]\d*-[1-9]\d*$/;
const SAVED_BUILD_ID_RE = /^pcbs_[a-f0-9]{32}$/;
const SHARE_TOKEN_RE = /^pcshare_[a-f0-9]{48}$/;
const MAX_EXTRA_ITEMS_PER_SLOT = 8;

export function parsePcBuilderSavedSelections(input: unknown): PcBuilderSavedSelections | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length < 1 || entries.length > PC_BUILDER_SAVED_SLOT_KEYS.length) return null;

  const selections: PcBuilderSavedSelections = {};
  for (const [slot, rawSelectionId] of entries) {
    const selectionId = String(rawSelectionId ?? "").trim();
    if (!SLOT_SET.has(slot) || !SELECTION_ID_RE.test(selectionId)) return null;
    selections[slot as PcBuilderSavedSlotKey] = selectionId;
  }
  return selections;
}

// Extra (multi-add) line items: optional, so a missing/empty input is valid
// (an empty object) rather than rejected outright like the primary selection.
export function parsePcBuilderSavedExtraItems(input: unknown): PcBuilderSavedExtraItems | null {
  if (input === undefined || input === null) return {};
  if (typeof input !== "object" || Array.isArray(input)) return null;
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > PC_BUILDER_SAVED_SLOT_KEYS.length) return null;

  const extraItems: PcBuilderSavedExtraItems = {};
  for (const [slot, rawIds] of entries) {
    if (!SLOT_SET.has(slot) || !Array.isArray(rawIds)) return null;
    if (rawIds.length === 0) continue;
    if (rawIds.length > MAX_EXTRA_ITEMS_PER_SLOT) return null;
    const ids: string[] = [];
    for (const rawId of rawIds) {
      const selectionId = String(rawId ?? "").trim();
      if (!SELECTION_ID_RE.test(selectionId) || ids.includes(selectionId)) return null;
      ids.push(selectionId);
    }
    extraItems[slot as PcBuilderSavedSlotKey] = ids;
  }
  return extraItems;
}

export function canonicalPcBuilderSavedSelections(
  selections: PcBuilderSavedSelections,
  extraItems: PcBuilderSavedExtraItems = {},
) {
  return JSON.stringify([
    PC_BUILDER_SAVED_SLOT_KEYS.flatMap((slot) => {
      const selectionId = selections[slot];
      return selectionId ? [[slot, selectionId]] : [];
    }),
    PC_BUILDER_SAVED_SLOT_KEYS.flatMap((slot) => {
      const ids = extraItems[slot];
      return ids && ids.length ? [[slot, ids]] : [];
    }),
  ]);
}

export function serializePcBuilderSavedSelections(
  selections: PcBuilderSavedSelections,
  extraItems: PcBuilderSavedExtraItems = {},
) {
  const primary = PC_BUILDER_SAVED_SLOT_KEYS.flatMap((slot) => {
    const selectionId = selections[slot];
    return selectionId ? [`${slot}:${selectionId}`] : [];
  });
  const extra = PC_BUILDER_SAVED_SLOT_KEYS.flatMap((slot) =>
    (extraItems[slot] ?? []).map((id) => `x:${slot}:${id}`),
  );
  return [...primary, ...extra].join(",");
}

export function normalizePcBuilderSavedBuildName(value: unknown, fallback = "My PC Build") {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  return (normalized || fallback).slice(0, 80);
}

export function isPcBuilderSavedBuildId(value: unknown): value is string {
  return SAVED_BUILD_ID_RE.test(String(value ?? "").trim());
}

export function isPcBuilderShareToken(value: unknown): value is string {
  return SHARE_TOKEN_RE.test(String(value ?? "").trim());
}
