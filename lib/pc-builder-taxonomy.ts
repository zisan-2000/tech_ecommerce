export type PcBuilderTaxonomyKind =
  | "generic"
  | "socket"
  | "memory-type"
  | "form-factor"
  | "psu-form-factor"
  | "chipset"
  | "cpu-generation";

export function normalizePcBuilderText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replace(/[™®©]/g, "")
    .replace(/\s+/g, " ");
}

export function canonicalPcBuilderAttributeName(value: unknown) {
  return normalizePcBuilderText(value).replace(/[^a-z0-9]+/g, "");
}

export function readPcBuilderAttribute(
  attributes: Record<string, string> | null | undefined,
  names: string[],
) {
  if (!attributes) return "";
  const requested = new Set(names.map(canonicalPcBuilderAttributeName));
  const match = Object.entries(attributes).find(([name]) =>
    requested.has(canonicalPcBuilderAttributeName(name)),
  );
  return match?.[1]?.trim() ?? "";
}

function compact(value: unknown) {
  return normalizePcBuilderText(value)
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function canonicalSocket(value: unknown) {
  let token = compact(value);
  token = token.replace(/^(?:cpusocket|socket)/, "");
  token = token.replace(/^amd(?=am\d)/, "");
  token = token.replace(/^intel(?=lga\d)/, "");
  return token;
}

function canonicalMemoryType(value: unknown) {
  const token = compact(value);
  const ddr = token.match(/^(ddr[2-6])(?:sdram)?$/);
  return ddr?.[1] ?? token;
}

function canonicalFormFactor(value: unknown, psu: boolean) {
  const token = compact(value);
  const aliases = new Map<string, string>([
    ["microatx", "matx"],
    ["matx", "matx"],
    ["miniatx", "miniatx"],
    ["miniitx", "mitx"],
    ["mitx", "mitx"],
    ["extendedatx", "eatx"],
    ["eatx", "eatx"],
    ["xlatx", "xlatx"],
    ["flexatx", "flexatx"],
  ]);
  if (psu) {
    aliases.set("atxps2", "atx");
    aliases.set("atx12v", "atx");
    aliases.set("sfxl", "sfxl");
  }
  return aliases.get(token) ?? token;
}

function canonicalChipset(value: unknown) {
  let token = compact(value);
  token = token.replace(/^(?:amd|intel)/, "");
  token = token.replace(/(?:chipset|express)$/, "");
  return token;
}

function canonicalCpuGeneration(value: unknown) {
  const text = normalizePcBuilderText(value).replace(/[()]/g, " ");
  const compacted = text.replace(/[^a-z0-9]+/g, "");

  const ryzen = text.match(/\b(?:amd\s+)?ryzen\s+(\d{4})\b/i);
  if (ryzen) return `ryzen${ryzen[1]}`;

  const intelGeneration =
    text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:gen|generation)\b/i) ??
    text.match(/\b(?:gen|generation)\s*(\d{1,2})\b/i);
  if (intelGeneration && /\b(?:intel\s+)?core\b/i.test(text)) {
    return `intelcore${Number(intelGeneration[1])}`;
  }

  const coreUltra = text.match(/\bcore\s+ultra\s+(?:series\s+)?(\d+)\b/i);
  if (coreUltra) return `coreultraseries${Number(coreUltra[1])}`;

  return compacted.replace(/series$/, "");
}

export function canonicalPcBuilderToken(
  value: unknown,
  kind: PcBuilderTaxonomyKind = "generic",
) {
  if (kind === "socket") return canonicalSocket(value);
  if (kind === "memory-type") return canonicalMemoryType(value);
  if (kind === "form-factor") return canonicalFormFactor(value, false);
  if (kind === "psu-form-factor") return canonicalFormFactor(value, true);
  if (kind === "chipset") return canonicalChipset(value);
  if (kind === "cpu-generation") return canonicalCpuGeneration(value);
  return compact(value);
}

function splitRawTokens(value: unknown) {
  return normalizePcBuilderText(value)
    .replace(/\bn\s*[./-]\s*a\b\.?/gi, "na")
    .split(/[,;/|\n]+|\s+(?:and|or)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function generationListTokens(value: unknown) {
  const text = normalizePcBuilderText(value);
  const tokens = new Set<string>();

  if (/\bryzen\b/i.test(text)) {
    for (const match of text.matchAll(/\b(\d{4})\b/g)) {
      tokens.add(`ryzen${match[1]}`);
    }
  }

  if (/\b(?:intel\s+)?core\b/i.test(text)) {
    for (const match of text.matchAll(
      /\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:gen|generation)\b/gi,
    )) {
      tokens.add(`intelcore${Number(match[1])}`);
    }
  }

  if (/\bcore\s+ultra\b/i.test(text)) {
    for (const match of text.matchAll(/\bseries\s+(\d+)\b/gi)) {
      tokens.add(`coreultraseries${Number(match[1])}`);
    }
  }

  return [...tokens];
}

export function splitPcBuilderTokens(
  value: unknown,
  kind: PcBuilderTaxonomyKind = "generic",
) {
  if (kind === "cpu-generation") {
    const generations = generationListTokens(value);
    if (generations.length) return generations;
  }

  return splitRawTokens(value)
    .map((part) => canonicalPcBuilderToken(part, kind))
    .filter(Boolean);
}

export function pcBuilderTokenListSupports(
  supportedValues: unknown,
  selectedValue: unknown,
  kind: PcBuilderTaxonomyKind = "generic",
) {
  const selected = canonicalPcBuilderToken(selectedValue, kind);
  if (!selected) return false;
  return splitPcBuilderTokens(supportedValues, kind).includes(selected);
}
