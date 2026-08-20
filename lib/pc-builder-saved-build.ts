export const PC_BUILDER_SAVED_SLOT_KEYS = [
  "processor",
  "motherboard",
  "memory",
  "graphics",
  "storage",
  "powerSupply",
  "case",
  "cooler",
] as const;

export type PcBuilderSavedSlotKey = (typeof PC_BUILDER_SAVED_SLOT_KEYS)[number];
export type PcBuilderSavedSelections = Partial<Record<PcBuilderSavedSlotKey, string>>;

const SLOT_SET = new Set<string>(PC_BUILDER_SAVED_SLOT_KEYS);
const SELECTION_ID_RE = /^[1-9]\d*-[1-9]\d*$/;
const SAVED_BUILD_ID_RE = /^pcbs_[a-f0-9]{32}$/;
const SHARE_TOKEN_RE = /^pcshare_[a-f0-9]{48}$/;

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

export function canonicalPcBuilderSavedSelections(selections: PcBuilderSavedSelections) {
  return JSON.stringify(
    PC_BUILDER_SAVED_SLOT_KEYS.flatMap((slot) => {
      const selectionId = selections[slot];
      return selectionId ? [[slot, selectionId]] : [];
    }),
  );
}

export function serializePcBuilderSavedSelections(selections: PcBuilderSavedSelections) {
  return PC_BUILDER_SAVED_SLOT_KEYS.flatMap((slot) => {
    const selectionId = selections[slot];
    return selectionId ? [`${slot}:${selectionId}`] : [];
  }).join(",");
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
