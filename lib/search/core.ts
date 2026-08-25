export const SEARCH_QUERY_MAX_LENGTH = 100;
export const SEARCH_SUGGESTION_LIMIT = 8;

export type SearchSuggestionProduct = {
  id: number;
  name: string;
  slug: string;
  image: string | null;
  price: number;
  originalPrice: number | null;
  currency: string;
  stock: number;
  brand: string | null;
  category: string;
  matchedVariantSku: string | null;
};

export type SearchSuggestionLink = {
  id: number;
  name: string;
  slug: string;
};

export type SearchSuggestionResponse = {
  queryId: string;
  query: string;
  normalizedQuery: string;
  products: SearchSuggestionProduct[];
  brands: SearchSuggestionLink[];
  categories: SearchSuggestionLink[];
  suggestedQueries: string[];
  total: number;
  tookMs: number;
};

const TECH_SYNONYM_GROUPS = [
  ["gpu", "graphics card", "video card"],
  ["ram", "memory", "desktop memory"],
  ["psu", "power supply"],
  ["ssd", "solid state drive"],
  ["hdd", "hard drive", "hard disk"],
  ["nvme", "m.2 ssd", "m2 ssd"],
  ["casing", "pc case", "computer case"],
  ["cpu", "processor"],
  ["motherboard", "mainboard", "mobo"],
  ["headphone", "headset"],
  ["earphone", "earbuds"],
  ["mini ups", "router ups"],
  ["display", "monitor"],
  ["webcam", "web camera"],
  ["ল্যাপটপ", "laptop"],
  ["কিবোর্ড", "keyboard"],
  ["মাউস", "mouse"],
  ["মনিটর", "monitor"],
  ["রাউটার", "router"],
  ["হেডফোন", "headphone"],
  ["র‌্যাম", "ram"],
] as const;

const CATEGORY_ALIASES: ReadonlyArray<{
  terms: readonly string[];
  slug: string;
}> = [
  { terms: ["laptop", "ল্যাপটপ", "notebook"], slug: "laptop" },
  { terms: ["monitor", "display", "মনিটর"], slug: "monitor" },
  { terms: ["keyboard", "কিবোর্ড"], slug: "keyboard" },
  { terms: ["mouse", "মাউস"], slug: "mouse" },
  { terms: ["router", "রাউটার"], slug: "router" },
  { terms: ["processor", "cpu"], slug: "processor" },
  { terms: ["motherboard", "mainboard", "mobo"], slug: "motherboard" },
  { terms: ["graphics card", "gpu", "video card"], slug: "graphics-card" },
  { terms: ["desktop ram", "ram", "memory"], slug: "desktop-ram" },
  { terms: ["power supply", "psu"], slug: "power-supply" },
  { terms: ["pc case", "casing"], slug: "pc-case" },
  { terms: ["cpu cooler", "processor cooler"], slug: "cpu-cooler" },
  { terms: ["ssd", "nvme", "solid state drive"], slug: "ssd-storage" },
];

export type ParsedSearchIntent = {
  originalQuery: string;
  normalizedQuery: string;
  searchText: string;
  expandedTerms: string[];
  maxPrice: number | null;
  minPrice: number | null;
  categorySlug: string | null;
};

function normalizeUnicode(value: string) {
  const bengaliDigits = "০১২৩৪৫৬৭৮৯";
  return value
    .normalize("NFKC")
    .replace(/[০-৯]/g, (digit) => String(bengaliDigits.indexOf(digit)));
}

export function normalizeSearchQuery(value: unknown) {
  return normalizeUnicode(String(value ?? ""))
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/([a-z])([0-9])/gi, "$1 $2")
    .replace(/([0-9])([a-z])/gi, "$1 $2")
    .replace(/\b(\d+)\s*(gb|tb|mhz|ghz|hz|inch|inches|watt|watts|w)\b/gi, "$1$2")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_QUERY_MAX_LENGTH);
}

export function compactModelToken(value: string) {
  return normalizeSearchQuery(value).toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, "");
}

function priceMultiplier(raw: string | undefined) {
  const unit = String(raw ?? "").toLowerCase();
  if (unit === "k" || unit === "thousand" || unit === "হাজার") return 1_000;
  if (unit === "lakh" || unit === "lac" || unit === "লাখ") return 100_000;
  return 1;
}

function extractPriceIntent(query: string) {
  let searchText = query;
  let maxPrice: number | null = null;
  let minPrice: number | null = null;
  const units = "k|thousand|lakh|lac|হাজার|লাখ";
  const maxPattern = new RegExp(`(?:\\b(?:under|below|within|up\\s*to|max(?:imum)?|less\\s+than)|(?:এর\\s+)?(?:মধ্যে|নিচে))\\s*(?:bdt|tk|৳)?\\s*(\\d+(?:\\.\\d+)?)\\s*(${units})?\\b`, "i");
  const maxSuffixPattern = new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s*(${units})?\\s*(?:er\\s+moddhe|er\\s+niche|এর\\s+মধ্যে|এর\\s+নিচে)`, "i");
  const minPattern = new RegExp(`(?:\\b(?:over|above|min(?:imum)?|more\\s+than)|(?:এর\\s+)?(?:উপরে|বেশি))\\s*(?:bdt|tk|৳)?\\s*(\\d+(?:\\.\\d+)?)\\s*(${units})?\\b`, "i");
  const minSuffixPattern = new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s*(${units})?\\s*(?:er\\s+upore|er\\s+beshi|এর\\s+উপরে|এর\\s+বেশি)`, "i");
  const maxMatch = query.match(maxPattern) ?? query.match(maxSuffixPattern);
  const minMatch = query.match(minPattern) ?? query.match(minSuffixPattern);
  if (maxMatch) {
    maxPrice = Math.round(Number(maxMatch[1]) * priceMultiplier(maxMatch[2]));
    searchText = searchText.replace(maxMatch[0], " ");
  }
  if (minMatch) {
    minPrice = Math.round(Number(minMatch[1]) * priceMultiplier(minMatch[2]));
    searchText = searchText.replace(minMatch[0], " ");
  }
  return {
    searchText: searchText.replace(/\s+/g, " ").trim(),
    minPrice: Number.isFinite(minPrice) ? minPrice : null,
    maxPrice: Number.isFinite(maxPrice) ? maxPrice : null,
  };
}

export function expandTechSynonyms(query: string, customGroups: readonly (readonly string[])[] = []) {
  const normalized = normalizeSearchQuery(query).toLocaleLowerCase("en-US");
  const groups = [...TECH_SYNONYM_GROUPS, ...customGroups];
  const expanded = new Set<string>([normalized]);
  for (const group of groups) {
    if (group.some((term) => normalized.includes(term.toLocaleLowerCase("en-US")))) {
      for (const term of group) expanded.add(normalizeSearchQuery(term).toLocaleLowerCase("en-US"));
    }
  }
  return [...expanded].filter(Boolean).slice(0, 16);
}

export function parseSearchIntent(
  value: unknown,
  customGroups: readonly (readonly string[])[] = [],
): ParsedSearchIntent {
  const originalQuery = normalizeSearchQuery(value);
  const price = extractPriceIntent(originalQuery);
  const normalizedQuery = originalQuery.toLocaleLowerCase("en-US");
  const lowerSearchText = price.searchText.toLocaleLowerCase("en-US");
  const categorySlug =
    CATEGORY_ALIASES.find((entry) =>
      entry.terms.some((term) => lowerSearchText.includes(term)),
    )?.slug ?? null;

  return {
    originalQuery,
    normalizedQuery,
    searchText: price.searchText || originalQuery,
    expandedTerms: expandTechSynonyms(price.searchText || originalQuery, customGroups),
    minPrice: price.minPrice,
    maxPrice: price.maxPrice,
    categorySlug,
  };
}

export function sanitizeSuggestionLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return SEARCH_SUGGESTION_LIMIT;
  return Math.max(1, Math.min(12, parsed));
}

export function sanitizeSearchEventText(value: unknown, maxLength = SEARCH_QUERY_MAX_LENGTH) {
  return normalizeUnicode(String(value ?? ""))
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
