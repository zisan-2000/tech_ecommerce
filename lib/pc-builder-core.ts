export const PC_BUILDER_STORAGE_KEY = "storefrontPcBuilderSelectionV1";
export const PC_BUILDER_EXTRA_ITEMS_STORAGE_KEY =
  "storefrontPcBuilderExtraItemsV1";

export const PC_BUILDER_SLOTS = [
  {
    key: "processor",
    label: "CPU",
    group: "core",
    categorySlug: "processor",
    required: true,
    multiple: false,
    description: "Choose the CPU platform first.",
  },
  {
    key: "cooler",
    label: "CPU Cooler",
    group: "core",
    categorySlug: "cpu-cooler",
    required: false,
    multiple: true,
    description: "Required when the selected processor has no included cooler.",
  },
  {
    key: "motherboard",
    label: "Motherboard",
    group: "core",
    categorySlug: "motherboard",
    required: true,
    multiple: false,
    description: "Must match the processor socket and RAM generation.",
  },
  {
    key: "memory",
    label: "RAM",
    group: "core",
    categorySlug: "desktop-ram",
    required: true,
    multiple: true,
    description: "Select desktop memory supported by the motherboard.",
  },
  {
    key: "storage",
    label: "Storage",
    group: "core",
    categorySlug: "ssd-storage",
    required: true,
    multiple: true,
    description: "Choose an SSD or other primary storage device.",
  },
  {
    key: "graphics",
    label: "Graphics Card",
    group: "core",
    categorySlug: "graphics-card",
    required: false,
    multiple: true,
    description: "Recommended for gaming and graphics workloads.",
  },
  {
    key: "powerSupply",
    label: "Power Supply",
    group: "core",
    categorySlug: "power-supply",
    required: true,
    multiple: false,
    description: "Allow safe capacity above the estimated system draw.",
  },
  {
    key: "case",
    label: "Casing",
    group: "core",
    categorySlug: "pc-case",
    required: true,
    multiple: false,
    description: "Must fit the motherboard, GPU and CPU cooler.",
  },
  {
    key: "monitor",
    label: "Monitor",
    group: "peripheral",
    categorySlug: "gaming-monitor",
    required: false,
    multiple: true,
    description: "Add one or more displays to the build.",
  },
  {
    key: "casingCooler",
    label: "Casing Cooler",
    group: "peripheral",
    categorySlug: "casing-cooler",
    required: false,
    multiple: true,
    description: "Extra case fans for chassis airflow.",
  },
  {
    key: "keyboard",
    label: "Keyboard",
    group: "peripheral",
    categorySlug: "keyboard",
    required: false,
    multiple: false,
    description: "Pick a desktop keyboard.",
  },
  {
    key: "mouse",
    label: "Mouse",
    group: "peripheral",
    categorySlug: "mouse",
    required: false,
    multiple: false,
    description: "Pick a desktop mouse.",
  },
  {
    key: "speaker",
    label: "Speaker & Home Theater",
    group: "peripheral",
    categorySlug: "speaker",
    required: false,
    multiple: false,
    description: "Add speakers or a home-theater set.",
  },
  {
    key: "headphone",
    label: "Headphone",
    group: "peripheral",
    categorySlug: "headphone-headsets",
    required: false,
    multiple: false,
    description: "Add a headphone or headset.",
  },
  {
    key: "networkAdapter",
    label: "Wifi Adapter / LAN Card",
    group: "peripheral",
    categorySlug: "wifi-lan-card",
    required: false,
    multiple: false,
    description: "Add wireless or wired network connectivity.",
  },
  {
    key: "antivirus",
    label: "Anti Virus",
    group: "peripheral",
    categorySlug: "antivirus",
    required: false,
    multiple: false,
    description: "Add an antivirus licence.",
  },
  {
    key: "ups",
    label: "UPS",
    group: "peripheral",
    categorySlug: "ups",
    required: false,
    multiple: false,
    description: "Add backup power for outages.",
  },
] as const;

export type PcBuilderSlotKey = (typeof PC_BUILDER_SLOTS)[number]["key"];
export type PcBuilderSlotGroup = (typeof PC_BUILDER_SLOTS)[number]["group"];

export type PcBuilderProduct = {
  selectionId: string;
  id: number;
  name: string;
  slug: string;
  sku: string | null;
  image: string | null;
  price: number;
  originalPrice: number | null;
  currency: string;
  brand: string | null;
  categorySlug: string;
  attributes: Record<string, string>;
  variantId: number;
  variantSku: string;
  variantLabel: string | null;
  stock: number;
};

export type PcBuilderCatalog = Record<PcBuilderSlotKey, PcBuilderProduct[]>;
export type PcBuilderSelection = Partial<
  Record<PcBuilderSlotKey, PcBuilderProduct>
>;

export type PcBuildIssue = {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  slots: PcBuilderSlotKey[];
};

export type PcBuildEvaluation = {
  issues: PcBuildIssue[];
  selectedCount: number;
  requiredCount: number;
  completedRequiredCount: number;
  requiredComplete: boolean;
  hasErrors: boolean;
  canAddToCart: boolean;
  estimatedWattage: number;
  recommendedPsuWattage: number;
};

const REQUIRED_SLOTS = PC_BUILDER_SLOTS.filter((slot) => slot.required);

type PcBuilderRequiredSpecKind =
  | "token"
  | "token-list"
  | "boolean"
  | "watt"
  | "length-mm";

type PcBuilderRequiredSpec = {
  code: string;
  label: string;
  names: string[];
  kind: PcBuilderRequiredSpecKind;
};

export const PC_BUILDER_REQUIRED_SPECS: Partial<
  Record<PcBuilderSlotKey, PcBuilderRequiredSpec[]>
> = {
  processor: [
    {
      code: "socket",
      label: "CPU socket",
      names: ["Socket", "CPU Socket"],
      kind: "token",
    },
    {
      code: "tdp",
      label: "processor TDP",
      names: ["TDP", "Power Draw"],
      kind: "watt",
    },
    {
      code: "integrated-graphics",
      label: "integrated graphics",
      names: ["Integrated Graphics", "iGPU"],
      kind: "boolean",
    },
    {
      code: "cooler-included",
      label: "included cooler",
      names: ["Cooler Included", "Stock Cooler"],
      kind: "boolean",
    },
  ],
  motherboard: [
    {
      code: "socket",
      label: "CPU socket",
      names: ["Socket", "CPU Socket"],
      kind: "token",
    },
    {
      code: "memory-type",
      label: "memory type",
      names: ["Memory Type", "RAM Type"],
      kind: "token",
    },
    {
      code: "form-factor",
      label: "motherboard form factor",
      names: ["Form Factor"],
      kind: "token",
    },
  ],
  memory: [
    {
      code: "memory-type",
      label: "memory type",
      names: ["Memory Type", "RAM Type"],
      kind: "token",
    },
  ],
  graphics: [
    {
      code: "power-draw",
      label: "graphics-card power draw",
      names: ["Power Draw", "Board Power", "TDP"],
      kind: "watt",
    },
    {
      code: "gpu-length",
      label: "graphics-card length",
      names: ["GPU Length", "Card Length"],
      kind: "length-mm",
    },
  ],
  powerSupply: [
    {
      code: "wattage",
      label: "power-supply wattage",
      names: ["Wattage", "Power", "Capacity"],
      kind: "watt",
    },
  ],
  case: [
    {
      code: "motherboard-support",
      label: "supported motherboard form factors",
      names: ["Motherboard Support", "Supported Motherboards"],
      kind: "token-list",
    },
    {
      code: "max-gpu-length",
      label: "maximum GPU length",
      names: ["Max GPU Length", "Maximum GPU Length"],
      kind: "length-mm",
    },
    {
      code: "max-cooler-height",
      label: "maximum CPU-cooler height",
      names: ["Max Cooler Height", "Maximum Cooler Height"],
      kind: "length-mm",
    },
  ],
  cooler: [
    {
      code: "socket-support",
      label: "supported CPU sockets",
      names: ["Socket Support", "Supported Sockets"],
      kind: "token-list",
    },
    {
      code: "cooler-height",
      label: "CPU-cooler height",
      names: ["Cooler Height", "Height"],
      kind: "length-mm",
    },
  ],
};

function normalized(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replace(/\s+/g, " ");
}

function canonicalCompatibilityToken(value: string | null | undefined) {
  const token = normalized(value)
    .replace(/\([^)]*\)/g, "")
    .replace(/[\s_-]+/g, "");
  if (token === "microatx") return "matx";
  if (token === "miniitx") return "mitx";
  return token;
}

function readAttribute(
  product: PcBuilderProduct | undefined,
  names: string[],
) {
  if (!product) return "";
  const requested = new Set(names.map(normalized));
  const match = Object.entries(product.attributes).find(([name]) =>
    requested.has(normalized(name)),
  );
  return match?.[1]?.trim() ?? "";
}

type MeasurementKind = "number" | "watt" | "length-mm";

function parseMeasurement(value: string, kind: MeasurementKind) {
  const input = normalized(value);
  const match = input.match(/^\s*(\d+(?:\.\d+)?)\s*([a-z]+)?\s*$/i);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = normalized(match[2] ?? "");
  if (!Number.isFinite(amount) || amount <= 0) return null;

  if (kind === "number") {
    return unit ? null : amount;
  }

  if (kind === "watt") {
    if (!unit || ["w", "watt", "watts"].includes(unit)) return amount;
    if (["kw", "kilowatt", "kilowatts"].includes(unit)) return amount * 1000;
    return null;
  }

  if (
    !unit ||
    ["mm", "millimeter", "millimeters", "millimetre", "millimetres"].includes(
      unit,
    )
  ) {
    return amount;
  }
  if (
    ["cm", "centimeter", "centimeters", "centimetre", "centimetres"].includes(
      unit,
    )
  ) {
    return amount * 10;
  }
  if (["m", "meter", "meters", "metre", "metres"].includes(unit)) {
    return amount * 1000;
  }
  if (["in", "inch", "inches"].includes(unit)) {
    return amount * 25.4;
  }
  return null;
}

function numericAttribute(
  product: PcBuilderProduct | undefined,
  names: string[],
  kind: MeasurementKind = "number",
) {
  const value = readAttribute(product, names);
  return value ? parseMeasurement(value, kind) : null;
}

function booleanAttribute(
  product: PcBuilderProduct | undefined,
  names: string[],
) {
  const value = normalized(readAttribute(product, names));
  if (!value) return null;

  const compact = value.replace(/[\s_-]+/g, " ");
  const falseValues = new Set([
    "no",
    "false",
    "none",
    "not available",
    "not included",
    "no igpu",
    "no integrated graphics",
    "without igpu",
    "without integrated graphics",
  ]);
  const trueValues = new Set([
    "yes",
    "true",
    "available",
    "included",
    "igpu",
    "integrated graphics",
    "with igpu",
    "with integrated graphics",
  ]);

  if (falseValues.has(compact)) return false;
  if (trueValues.has(compact)) return true;
  return null;
}

function supported(supportedValues: string, selectedValue: string) {
  const selected = canonicalCompatibilityToken(selectedValue);
  if (!selected || !supportedValues) return true;
  return supportedValues
    .split(/[,;/|\n]+|\s+and\s+/i)
    .map(canonicalCompatibilityToken)
    .filter(Boolean)
    .some((value) => value === selected);
}

const INVALID_COMPATIBILITY_TOKENS = new Set([
  "unknown",
  "na",
  "none",
  "notavailable",
  "notapplicable",
  "tbd",
  "unspecified",
]);

function validCompatibilityToken(value: string) {
  const token = canonicalCompatibilityToken(value);
  return Boolean(
    token &&
      /[a-z0-9]/i.test(token) &&
      !INVALID_COMPATIBILITY_TOKENS.has(token),
  );
}

function hasSupportedTokens(value: string) {
  return value
    .split(/[,;/|\n]+|\s+and\s+/i)
    .some(validCompatibilityToken);
}

function validSelectionId(value: string) {
  return value
    .split("-")
    .every((part) => /^[1-9]\d*$/.test(part));
}

function issue(
  code: string,
  severity: PcBuildIssue["severity"],
  message: string,
  slots: PcBuilderSlotKey[],
): PcBuildIssue {
  return { code, severity, message, slots };
}

export function validatePcBuilderProductReadiness(
  slot: PcBuilderSlotKey,
  product: PcBuilderProduct,
): PcBuildIssue[] {
  const requirements = PC_BUILDER_REQUIRED_SPECS[slot] ?? [];

  return requirements.flatMap((requirement) => {
    const rawValue = readAttribute(product, requirement.names);
    let valid = false;

    if (requirement.kind === "token") {
      valid = validCompatibilityToken(rawValue);
    } else if (requirement.kind === "token-list") {
      valid = hasSupportedTokens(rawValue);
    } else if (requirement.kind === "boolean") {
      valid = booleanAttribute(product, requirement.names) !== null;
    } else if (requirement.kind === "watt") {
      valid = numericAttribute(product, requirement.names, "watt") !== null;
    } else if (requirement.kind === "length-mm") {
      valid = numericAttribute(product, requirement.names, "length-mm") !== null;
    }

    if (valid) return [];

    const problem = rawValue
      ? "has an invalid or unsupported"
      : "is missing a";

    return [
      issue(
        `pc-builder-spec-${slot}-${requirement.code}`,
        "error",
        `${product.name} ${problem} ${requirement.label} specification required by PC Builder.`,
        [slot],
      ),
    ];
  });
}

export function evaluatePcBuild(
  selection: PcBuilderSelection,
): PcBuildEvaluation {
  const issues: PcBuildIssue[] = [];
  const selected = Object.values(selection).filter(
    (product): product is PcBuilderProduct => Boolean(product),
  );

  const currencies = new Set(selected.map((product) => product.currency));
  if (currencies.size > 1) {
    issues.push(
      issue(
        "mixed-currencies",
        "error",
        "Selected components use different currencies and cannot be checked out as one build.",
        PC_BUILDER_SLOTS.flatMap((slot) =>
          selection[slot.key] ? [slot.key] : [],
        ),
      ),
    );
  }

  for (const [slot, product] of Object.entries(selection) as Array<
    [PcBuilderSlotKey, PcBuilderProduct | undefined]
  >) {
    if (product && product.stock < 1) {
      issues.push(
        issue(
          `out-of-stock-${slot}`,
          "error",
          `${product.name} is currently out of stock.`,
          [slot],
        ),
      );
    }
    if (product) {
      issues.push(...validatePcBuilderProductReadiness(slot, product));
    }
  }

  const cpu = selection.processor;
  const motherboard = selection.motherboard;
  const memory = selection.memory;
  const graphics = selection.graphics;
  const powerSupply = selection.powerSupply;
  const pcCase = selection.case;
  const cooler = selection.cooler;

  if (cpu && motherboard) {
    const cpuSocket = readAttribute(cpu, ["Socket", "CPU Socket"]);
    const motherboardSocket = readAttribute(motherboard, [
      "Socket",
      "CPU Socket",
    ]);
    if (
      cpuSocket &&
      motherboardSocket &&
      canonicalCompatibilityToken(cpuSocket) !==
        canonicalCompatibilityToken(motherboardSocket)
    ) {
      issues.push(
        issue(
          "cpu-motherboard-socket",
          "error",
          `Processor socket ${cpuSocket} does not match motherboard socket ${motherboardSocket}.`,
          ["processor", "motherboard"],
        ),
      );
    } else if (!cpuSocket || !motherboardSocket) {
      issues.push(
        issue(
          "cpu-motherboard-data",
          "error",
          "Socket data is incomplete, so processor and motherboard compatibility cannot be verified.",
          ["processor", "motherboard"],
        ),
      );
    }
  }

  if (motherboard && memory) {
    const boardMemory = readAttribute(motherboard, [
      "Memory Type",
      "RAM Type",
    ]);
    const memoryType = readAttribute(memory, ["Memory Type", "RAM Type"]);
    if (boardMemory && memoryType && !supported(boardMemory, memoryType)) {
      issues.push(
        issue(
          "motherboard-memory-type",
          "error",
          `${memoryType} memory is not supported by this ${boardMemory} motherboard.`,
          ["motherboard", "memory"],
        ),
      );
    } else if (!boardMemory || !memoryType) {
      issues.push(
        issue(
          "motherboard-memory-data",
          "error",
          "Memory generation data is incomplete, so motherboard and RAM compatibility cannot be verified.",
          ["motherboard", "memory"],
        ),
      );
    }
  }

  if (motherboard && pcCase) {
    const boardFormFactor = readAttribute(motherboard, ["Form Factor"]);
    const caseSupport = readAttribute(pcCase, [
      "Motherboard Support",
      "Supported Motherboards",
    ]);
    if (boardFormFactor && caseSupport && !supported(caseSupport, boardFormFactor)) {
      issues.push(
        issue(
          "motherboard-case-form-factor",
          "error",
          `${boardFormFactor} motherboard does not fit this case (${caseSupport}).`,
          ["motherboard", "case"],
        ),
      );
    } else if (!boardFormFactor || !caseSupport) {
      issues.push(
        issue(
          "motherboard-case-data",
          "error",
          "Motherboard or case form-factor data is incomplete, so physical fit cannot be verified.",
          ["motherboard", "case"],
        ),
      );
    }
  }

  if (graphics && pcCase) {
    const gpuLength = numericAttribute(
      graphics,
      ["GPU Length", "Card Length"],
      "length-mm",
    );
    const maxGpuLength = numericAttribute(
      pcCase,
      ["Max GPU Length", "Maximum GPU Length"],
      "length-mm",
    );
    if (gpuLength && maxGpuLength && gpuLength > maxGpuLength) {
      issues.push(
        issue(
          "gpu-case-clearance",
          "error",
          `The ${Math.round(gpuLength)}mm graphics card exceeds the case clearance of ${Math.round(maxGpuLength)}mm.`,
          ["graphics", "case"],
        ),
      );
    } else if (!gpuLength || !maxGpuLength) {
      issues.push(
        issue(
          "gpu-case-data",
          "error",
          "Graphics-card length or case clearance data is incomplete or uses an unsupported unit, so physical fit cannot be verified.",
          ["graphics", "case"],
        ),
      );
    }
  }

  if (cooler && pcCase) {
    const coolerHeight = numericAttribute(
      cooler,
      ["Cooler Height", "Height"],
      "length-mm",
    );
    const maxCoolerHeight = numericAttribute(
      pcCase,
      ["Max Cooler Height", "Maximum Cooler Height"],
      "length-mm",
    );
    if (coolerHeight && maxCoolerHeight && coolerHeight > maxCoolerHeight) {
      issues.push(
        issue(
          "cooler-case-clearance",
          "error",
          `The ${Math.round(coolerHeight)}mm CPU cooler exceeds the case clearance of ${Math.round(maxCoolerHeight)}mm.`,
          ["cooler", "case"],
        ),
      );
    } else if (!coolerHeight || !maxCoolerHeight) {
      issues.push(
        issue(
          "cooler-case-data",
          "error",
          "CPU-cooler height or case clearance data is incomplete or uses an unsupported unit, so physical fit cannot be verified.",
          ["cooler", "case"],
        ),
      );
    }
  }

  if (cpu && cooler) {
    const cpuSocket = readAttribute(cpu, ["Socket", "CPU Socket"]);
    const coolerSockets = readAttribute(cooler, [
      "Socket Support",
      "Supported Sockets",
    ]);
    if (cpuSocket && coolerSockets && !supported(coolerSockets, cpuSocket)) {
      issues.push(
        issue(
          "cpu-cooler-socket",
          "error",
          `The selected cooler does not list ${cpuSocket} socket support.`,
          ["processor", "cooler"],
        ),
      );
    } else if (!cpuSocket || !coolerSockets) {
      issues.push(
        issue(
          "cpu-cooler-data",
          "error",
          "CPU or cooler socket data is incomplete, so cooler compatibility cannot be verified.",
          ["processor", "cooler"],
        ),
      );
    }
  }

  if (cpu && !graphics) {
    const integratedGraphics = booleanAttribute(cpu, [
      "Integrated Graphics",
      "iGPU",
    ]);
    if (integratedGraphics === false) {
      issues.push(
        issue(
          "graphics-required",
          "error",
          "This processor has no integrated graphics; add a graphics card for display output.",
          ["processor", "graphics"],
        ),
      );
    } else if (integratedGraphics === null) {
      issues.push(
        issue(
          "graphics-capability-data",
          "error",
          "Integrated-graphics data is missing or ambiguous; add a graphics card or use a clear Yes/No specification.",
          ["processor", "graphics"],
        ),
      );
    }
  }

  if (cpu && !cooler) {
    const coolerIncluded = booleanAttribute(cpu, [
      "Cooler Included",
      "Stock Cooler",
    ]);
    if (coolerIncluded === false) {
      issues.push(
        issue(
          "cooler-required",
          "error",
          "The processor has no included cooler; select a compatible CPU cooler.",
          ["processor", "cooler"],
        ),
      );
    } else if (coolerIncluded === null) {
      issues.push(
        issue(
          "cooler-included-data",
          "error",
          "Processor cooler information is missing or ambiguous; select a cooler or use a clear Yes/No specification.",
          ["processor", "cooler"],
        ),
      );
    }
  }

  const cpuPower = numericAttribute(cpu, ["TDP", "Power Draw"], "watt");
  const gpuPower = numericAttribute(
    graphics,
    ["Power Draw", "Board Power", "TDP"],
    "watt",
  );
  if (cpu && !cpuPower) {
    issues.push(
      issue(
        "processor-power-data",
        "error",
        "Processor power data is missing or uses an unsupported unit, so a safe PSU recommendation cannot be calculated.",
        ["processor", "powerSupply"],
      ),
    );
  }
  if (graphics && !gpuPower) {
    issues.push(
      issue(
        "graphics-power-data",
        "error",
        "Graphics-card power data is missing or uses an unsupported unit, so a safe PSU recommendation cannot be calculated.",
        ["graphics", "powerSupply"],
      ),
    );
  }

  const cpuWatts = cpuPower ?? 65;
  const gpuWatts = graphics ? gpuPower ?? 200 : 0;
  const estimatedWattage = selected.length
    ? Math.round(
        75 +
          cpuWatts +
          gpuWatts +
          (memory ? 10 : 0) +
          (selection.storage ? 10 : 0) +
          (cooler ? 10 : 0),
      )
    : 0;
  const recommendedPsuWattage = estimatedWattage
    ? Math.max(450, Math.ceil((estimatedWattage * 1.35) / 50) * 50)
    : 0;
  const psuWattage = numericAttribute(
    powerSupply,
    ["Wattage", "Power", "Capacity"],
    "watt",
  );

  if (powerSupply && !psuWattage) {
    issues.push(
      issue(
        "power-supply-data",
        "error",
        "Power-supply wattage is missing or uses an unsupported unit, so capacity cannot be verified.",
        ["powerSupply"],
      ),
    );
  }

  if (powerSupply && psuWattage && psuWattage < recommendedPsuWattage) {
    issues.push(
      issue(
        "insufficient-power-supply",
        "error",
        `${Math.round(psuWattage)}W PSU is below the recommended ${recommendedPsuWattage}W capacity.`,
        [
          "powerSupply",
          "processor",
          ...(graphics ? (["graphics"] as const) : []),
        ],
      ),
    );
  }

  const completedRequiredCount = REQUIRED_SLOTS.filter(
    (slot) => selection[slot.key],
  ).length;
  const requiredComplete = completedRequiredCount === REQUIRED_SLOTS.length;
  const hasErrors = issues.some((item) => item.severity === "error");

  return {
    issues,
    selectedCount: selected.length,
    requiredCount: REQUIRED_SLOTS.length,
    completedRequiredCount,
    requiredComplete,
    hasErrors,
    canAddToCart: requiredComplete && !hasErrors,
    estimatedWattage,
    recommendedPsuWattage,
  };
}

export function selectionFromIds(
  catalog: PcBuilderCatalog,
  ids: Partial<Record<PcBuilderSlotKey, string | number>>,
): PcBuilderSelection {
  const selection: PcBuilderSelection = {};
  for (const slot of PC_BUILDER_SLOTS) {
    const rawId = ids[slot.key];
    if (rawId === undefined || rawId === null) continue;
    const id = String(rawId).trim();
    if (!/^\d+(?:-\d+)?$/.test(id) || !validSelectionId(id)) continue;
    const product = catalog[slot.key].find(
      (item) => item.selectionId === id || String(item.id) === id,
    );
    if (product) selection[slot.key] = product;
  }
  return selection;
}

export function parsePcBuilderSelectionId(value: unknown) {
  const normalizedValue = String(value ?? "").trim();
  if (
    !/^\d+-\d+$/.test(normalizedValue) ||
    !validSelectionId(normalizedValue)
  ) {
    return null;
  }
  const [productId, variantId] = normalizedValue.split("-").map(Number);
  return { selectionId: normalizedValue, productId, variantId };
}

const MAX_SHARED_BUILD_EXTRA_ITEMS_PER_SLOT = 8;
const MAX_SHARED_BUILD_PAIRS = PC_BUILDER_SLOTS.length * 2;

export type PcBuilderSharedExtraItems = Partial<
  Record<PcBuilderSlotKey, string[]>
>;

export function parseSharedBuild(value: string | null | undefined) {
  const parsed: Partial<Record<PcBuilderSlotKey, string>> = {};
  if (!value || value.length > 500) return parsed;
  const validKeys = new Set<PcBuilderSlotKey>(
    PC_BUILDER_SLOTS.map((slot) => slot.key),
  );
  for (const pair of value.split(",").slice(0, MAX_SHARED_BUILD_PAIRS)) {
    const [rawKey, rawId] = pair.split(":", 2);
    if (rawKey === "x") continue;
    const key = rawKey as PcBuilderSlotKey;
    const id = String(rawId ?? "").trim();
    if (
      validKeys.has(key) &&
      /^\d+(?:-\d+)?$/.test(id) &&
      validSelectionId(id)
    ) {
      parsed[key] = id;
    }
  }
  return parsed;
}

// Extra (multi-add) line items are serialized as "x:slot:id" pairs so links
// created before multi-add existed keep parsing identically.
export function parseSharedBuildExtraItems(
  value: string | null | undefined,
): PcBuilderSharedExtraItems {
  const parsed: PcBuilderSharedExtraItems = {};
  if (!value || value.length > 500) return parsed;
  const validKeys = new Set<PcBuilderSlotKey>(
    PC_BUILDER_SLOTS.map((slot) => slot.key),
  );
  for (const pair of value.split(",").slice(0, MAX_SHARED_BUILD_PAIRS)) {
    const [rawTag, rawKey, rawId] = pair.split(":", 3);
    if (rawTag !== "x") continue;
    const key = rawKey as PcBuilderSlotKey;
    const id = String(rawId ?? "").trim();
    if (!validKeys.has(key) || !/^\d+-\d+$/.test(id) || !validSelectionId(id)) {
      continue;
    }
    const current = parsed[key] ?? [];
    if (current.length >= MAX_SHARED_BUILD_EXTRA_ITEMS_PER_SLOT) continue;
    parsed[key] = [...current, id];
  }
  return parsed;
}

export function serializeSharedBuild(
  selection: PcBuilderSelection,
  extraItems?: PcBuilderSharedExtraItems,
) {
  const primary = PC_BUILDER_SLOTS.flatMap((slot) => {
    const product = selection[slot.key];
    return product ? [`${slot.key}:${product.selectionId}`] : [];
  });
  const extra = extraItems
    ? PC_BUILDER_SLOTS.flatMap((slot) =>
        (extraItems[slot.key] ?? []).map((id) => `x:${slot.key}:${id}`),
      )
    : [];
  return [...primary, ...extra].join(",");
}
