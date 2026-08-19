export const PC_BUILDER_STORAGE_KEY = "storefrontPcBuilderSelectionV1";

export const PC_BUILDER_SLOTS = [
  {
    key: "processor",
    label: "Processor",
    categorySlug: "processor",
    required: true,
    description: "Choose the CPU platform first.",
  },
  {
    key: "motherboard",
    label: "Motherboard",
    categorySlug: "motherboard",
    required: true,
    description: "Must match the processor socket and RAM generation.",
  },
  {
    key: "memory",
    label: "Memory",
    categorySlug: "desktop-ram",
    required: true,
    description: "Select desktop memory supported by the motherboard.",
  },
  {
    key: "graphics",
    label: "Graphics Card",
    categorySlug: "graphics-card",
    required: false,
    description: "Recommended for gaming and graphics workloads.",
  },
  {
    key: "storage",
    label: "Storage",
    categorySlug: "ssd-storage",
    required: true,
    description: "Choose an SSD or other primary storage device.",
  },
  {
    key: "powerSupply",
    label: "Power Supply",
    categorySlug: "power-supply",
    required: true,
    description: "Allow safe capacity above the estimated system draw.",
  },
  {
    key: "case",
    label: "Casing",
    categorySlug: "pc-case",
    required: true,
    description: "Must fit the motherboard, GPU and CPU cooler.",
  },
  {
    key: "cooler",
    label: "CPU Cooler",
    categorySlug: "cpu-cooler",
    required: false,
    description: "Required when the selected processor has no included cooler.",
  },
] as const;

export type PcBuilderSlotKey = (typeof PC_BUILDER_SLOTS)[number]["key"];

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

function normalized(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replace(/\s+/g, " ");
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

function numericAttribute(
  product: PcBuilderProduct | undefined,
  names: string[],
) {
  const match = readAttribute(product, names).match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function supported(supportedValues: string, selectedValue: string) {
  const selected = normalized(selectedValue);
  if (!selected || !supportedValues) return true;
  return supportedValues
    .split(/[,;/|\n]+|\s+and\s+/i)
    .map(normalized)
    .some((value) => value === selected);
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
    if (cpuSocket && motherboardSocket && normalized(cpuSocket) !== normalized(motherboardSocket)) {
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
          "warning",
          "Socket data is incomplete; confirm processor and motherboard compatibility before ordering.",
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
          "warning",
          "Memory generation data is incomplete; verify motherboard RAM support.",
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
    }
  }

  if (graphics && pcCase) {
    const gpuLength = numericAttribute(graphics, ["GPU Length", "Card Length"]);
    const maxGpuLength = numericAttribute(pcCase, [
      "Max GPU Length",
      "Maximum GPU Length",
    ]);
    if (gpuLength && maxGpuLength && gpuLength > maxGpuLength) {
      issues.push(
        issue(
          "gpu-case-clearance",
          "error",
          `The ${gpuLength}mm graphics card exceeds the case clearance of ${maxGpuLength}mm.`,
          ["graphics", "case"],
        ),
      );
    }
  }

  if (cooler && pcCase) {
    const coolerHeight = numericAttribute(cooler, ["Cooler Height", "Height"]);
    const maxCoolerHeight = numericAttribute(pcCase, [
      "Max Cooler Height",
      "Maximum Cooler Height",
    ]);
    if (coolerHeight && maxCoolerHeight && coolerHeight > maxCoolerHeight) {
      issues.push(
        issue(
          "cooler-case-clearance",
          "error",
          `The ${coolerHeight}mm CPU cooler exceeds the case clearance of ${maxCoolerHeight}mm.`,
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
    }
  }

  if (cpu && !graphics) {
    const integratedGraphics = normalized(
      readAttribute(cpu, ["Integrated Graphics", "iGPU"]),
    );
    if (["no", "none", "not available", "false"].includes(integratedGraphics)) {
      issues.push(
        issue(
          "graphics-required",
          "warning",
          "This processor has no integrated graphics; add a graphics card for display output.",
          ["processor", "graphics"],
        ),
      );
    }
  }

  if (cpu && !cooler) {
    const coolerIncluded = normalized(
      readAttribute(cpu, ["Cooler Included", "Stock Cooler"]),
    );
    if (["no", "none", "not included", "false"].includes(coolerIncluded)) {
      issues.push(
        issue(
          "cooler-required",
          "warning",
          "The processor has no included cooler; select a compatible CPU cooler.",
          ["processor", "cooler"],
        ),
      );
    }
  }

  const cpuWatts = numericAttribute(cpu, ["TDP", "Power Draw"]) ?? 65;
  const gpuWatts = graphics
    ? numericAttribute(graphics, ["Power Draw", "Board Power", "TDP"]) ?? 200
    : 0;
  const estimatedWattage = selected.length
    ? Math.round(75 + cpuWatts + gpuWatts + (memory ? 10 : 0) + (selection.storage ? 10 : 0) + (cooler ? 10 : 0))
    : 0;
  const recommendedPsuWattage = estimatedWattage
    ? Math.max(450, Math.ceil((estimatedWattage * 1.35) / 50) * 50)
    : 0;
  const psuWattage = numericAttribute(powerSupply, [
    "Wattage",
    "Power",
    "Capacity",
  ]);

  if (powerSupply && psuWattage && psuWattage < recommendedPsuWattage) {
    issues.push(
      issue(
        "insufficient-power-supply",
        "error",
        `${psuWattage}W PSU is below the recommended ${recommendedPsuWattage}W capacity.`,
        ["powerSupply", "processor", ...(graphics ? (["graphics"] as const) : [])],
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

export function parseSharedBuild(value: string | null | undefined) {
  const parsed: Partial<Record<PcBuilderSlotKey, string>> = {};
  if (!value || value.length > 500) return parsed;
  const validKeys = new Set<PcBuilderSlotKey>(
    PC_BUILDER_SLOTS.map((slot) => slot.key),
  );
  for (const pair of value.split(",").slice(0, PC_BUILDER_SLOTS.length)) {
    const [rawKey, rawId] = pair.split(":", 2);
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

export function serializeSharedBuild(selection: PcBuilderSelection) {
  return PC_BUILDER_SLOTS.flatMap((slot) => {
    const product = selection[slot.key];
    return product ? [`${slot.key}:${product.selectionId}`] : [];
  }).join(",");
}
