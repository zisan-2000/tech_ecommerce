import {
  PC_BUILDER_REQUIRED_SPECS,
  type PcBuildIssue,
  type PcBuilderProduct,
  type PcBuilderSlotKey,
} from "./pc-builder-core";

const INVALID_PLACEHOLDER_TOKENS = new Set([
  "unknown",
  "na",
  "none",
  "notavailable",
  "notapplicable",
  "notspecified",
  "notsupported",
  "notlisted",
  "pending",
  "tbd",
  "unspecified",
  "null",
  "nil",
]);

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function placeholderToken(value: unknown) {
  return normalized(value).replace(/[^a-z0-9]+/g, "");
}

function isPlaceholder(value: unknown) {
  const token = placeholderToken(value);
  return !token || INVALID_PLACEHOLDER_TOKENS.has(token);
}

function readAttribute(product: PcBuilderProduct, names: string[]) {
  const requested = new Set(names.map((name) => normalized(name)));
  return (
    Object.entries(product.attributes).find(([name]) =>
      requested.has(normalized(name)),
    )?.[1]?.trim() ?? ""
  );
}

function hasRealToken(value: string) {
  const withoutNa = normalized(value).replace(/\bn\s*[./-]\s*a\b\.?/gi, " ");
  return withoutNa
    .split(/[,;/|\n]+|\s+and\s+/i)
    .map((part) => part.trim())
    .some((part) => !isPlaceholder(part));
}

export function validatePcBuilderPlaceholderReadiness(
  slot: PcBuilderSlotKey,
  product: PcBuilderProduct,
): PcBuildIssue[] {
  const requirements = PC_BUILDER_REQUIRED_SPECS[slot] ?? [];

  return requirements.flatMap((requirement) => {
    if (requirement.kind !== "token" && requirement.kind !== "token-list") {
      return [];
    }

    const rawValue = readAttribute(product, requirement.names);
    const invalid =
      requirement.kind === "token"
        ? isPlaceholder(rawValue)
        : !hasRealToken(rawValue);
    if (!invalid) return [];

    return [
      {
        code: `pc-builder-spec-${slot}-${requirement.code}`,
        severity: "error" as const,
        message: `${product.name} has an invalid or unsupported ${requirement.label} specification required by PC Builder.`,
        slots: [slot],
      },
    ];
  });
}
