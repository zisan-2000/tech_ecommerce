import type {
  PcBuildIssue,
  PcBuilderProduct,
  PcBuilderSelection,
  PcBuilderSlotKey,
} from "./pc-builder";

function normalized(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replace(/\s+/g, " ");
}

function canonicalToken(value: string | null | undefined) {
  const token = normalized(value)
    .replace(/\([^)]*\)/g, "")
    .replace(/[\s_-]+/g, "");
  if (token === "microatx") return "matx";
  if (token === "miniitx") return "mitx";
  return token;
}

function readAttribute(product: PcBuilderProduct | undefined, names: string[]) {
  if (!product) return "";
  const requested = new Set(names.map(normalized));
  const match = Object.entries(product.attributes).find(([name]) =>
    requested.has(normalized(name)),
  );
  return match?.[1]?.trim() ?? "";
}

function issue(
  code: string,
  severity: PcBuildIssue["severity"],
  message: string,
  slots: PcBuilderSlotKey[],
): PcBuildIssue {
  return { code, severity, message, slots };
}

function splitTokens(value: string) {
  return value
    .split(/[,;/|\n]+|\s+and\s+/i)
    .map(canonicalToken)
    .filter(Boolean);
}

function supports(supportedValues: string, selectedValue: string) {
  const selected = canonicalToken(selectedValue);
  return Boolean(
    selected && splitTokens(supportedValues).some((value) => value === selected),
  );
}

function parseWatt(value: string) {
  const match = normalized(value).match(
    /^(\d+(?:\.\d+)?)\s*(w|watt|watts|kw|kilowatt|kilowatts)?$/i,
  );
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return /^(kw|kilowatt|kilowatts)$/i.test(match[2] ?? "")
    ? amount * 1000
    : amount;
}

function capacityToGb(amount: number, unit: string) {
  const normalizedUnit = unit.toLowerCase();
  if (normalizedUnit === "tb" || normalizedUnit === "tib") return amount * 1024;
  if (normalizedUnit === "mb" || normalizedUnit === "mib") return amount / 1024;
  return amount;
}

function parseCapacityGb(value: string) {
  const input = normalized(value).replaceAll(",", "");
  const kitMatch = input.match(
    /(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(tb|tib|gb|gib|mb|mib)\b/i,
  );
  if (kitMatch) {
    const modules = Number(kitMatch[1]);
    const perModule = Number(kitMatch[2]);
    if (
      Number.isFinite(modules) &&
      modules > 0 &&
      Number.isFinite(perModule) &&
      perModule > 0
    ) {
      return modules * capacityToGb(perModule, kitMatch[3]);
    }
  }

  const match = input.match(/(\d+(?:\.\d+)?)\s*(tb|tib|gb|gib|mb|mib)\b/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return capacityToGb(amount, match[2]);
}

function parseMemoryRate(value: string) {
  const match = normalized(value)
    .replaceAll(",", "")
    .match(/(\d+(?:\.\d+)?)\s*(mhz|mt\/s|mts|ghz)\b/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return match[2].toLowerCase() === "ghz" ? amount * 1000 : amount;
}

function booleanAttribute(product: PcBuilderProduct | undefined, names: string[]) {
  const value = normalized(readAttribute(product, names)).replace(/[\s_-]+/g, " ");
  if (!value) return null;
  if (["yes", "true", "supported", "available", "enabled"].includes(value)) {
    return true;
  }
  if (
    ["no", "false", "unsupported", "not supported", "disabled"].includes(value)
  ) {
    return false;
  }
  return null;
}

function parsePcieGeneration(value: string) {
  const generations = [
    ...normalized(value).matchAll(
      /(?:pcie|pci express)\s*(?:gen(?:eration)?)?\s*([1-6](?:\.\d)?)/gi,
    ),
  ]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  return generations.length ? Math.max(...generations) : null;
}

function storageInterface(value: string) {
  const input = normalized(value);
  return {
    pcie: /\b(?:pcie|pci express|nvme)\b/i.test(input),
    sata: /\bsata\b/i.test(input),
  };
}

function isM2FormFactor(value: string) {
  return /^(?:m\.?\s*2\b|m2\d*)/i.test(value.trim());
}

type ConnectorCounts = {
  pcie16: number;
  pcie8: number;
  pcie6: number;
};

function addMatches(
  input: string,
  regex: RegExp,
  key: keyof ConnectorCounts,
  counts: ConnectorCounts,
) {
  for (const match of input.matchAll(regex)) {
    const count = Number(match[1] ?? 1);
    counts[key] += Number.isFinite(count) && count > 0 ? count : 1;
  }
}

function parseGpuPowerConnectors(value: string): ConnectorCounts {
  const input = normalized(value).replaceAll("×", "x");
  const counts: ConnectorCounts = { pcie16: 0, pcie8: 0, pcie6: 0 };

  addMatches(
    input,
    /(?:(\d+)\s*x\s*)?(?:16\s*[- ]?pin\s*)?(?:12vhpwr|12v\s*[- ]?2x6)/gi,
    "pcie16",
    counts,
  );
  addMatches(
    input,
    /(?:(\d+)\s*x\s*)?(?:pcie\s*)?(?:6\s*\+\s*2|8)\s*[- ]?pin(?:\s*pcie)?/gi,
    "pcie8",
    counts,
  );
  addMatches(
    input,
    /(?:(\d+)\s*x\s*)?(?:pcie\s*)?6\s*[- ]?pin(?:\s*pcie)?/gi,
    "pcie6",
    counts,
  );

  return counts;
}

function hasConnectorData(counts: ConnectorCounts) {
  return counts.pcie16 > 0 || counts.pcie8 > 0 || counts.pcie6 > 0;
}

function missingGpuConnectorRequirement(
  required: ConnectorCounts,
  available: ConnectorCounts,
) {
  if (required.pcie16 > available.pcie16) return "16-pin 12VHPWR/12V-2x6";
  if (required.pcie8 > available.pcie8) return "8-pin PCIe";
  if (required.pcie6 > available.pcie6 + available.pcie8) return "6-pin PCIe";
  return null;
}

export function evaluateAdvancedPcCompatibility(
  selection: PcBuilderSelection,
): PcBuildIssue[] {
  const issues: PcBuildIssue[] = [];
  const cpu = selection.processor;
  const motherboard = selection.motherboard;
  const memory = selection.memory;
  const graphics = selection.graphics;
  const storage = selection.storage;
  const powerSupply = selection.powerSupply;
  const pcCase = selection.case;
  const cooler = selection.cooler;

  if (cpu && motherboard) {
    const supportedChipsets = readAttribute(cpu, [
      "Supported Chipsets",
      "Chipset Support",
      "Chipsets",
    ]);
    const boardChipset = readAttribute(motherboard, ["Chipset"]);
    if (
      supportedChipsets &&
      boardChipset &&
      !supports(supportedChipsets, boardChipset)
    ) {
      issues.push(
        issue(
          "cpu-motherboard-chipset",
          "error",
          `${boardChipset} chipset is not listed as supported by the selected processor.`,
          ["processor", "motherboard"],
        ),
      );
    }

    const cpuGeneration = readAttribute(cpu, [
      "CPU Generation",
      "Processor Generation",
      "Generation",
    ]);
    const supportedGenerations = readAttribute(motherboard, [
      "Supported CPU Generations",
      "CPU Generation Support",
      "Processor Generation Support",
    ]);
    if (
      cpuGeneration &&
      supportedGenerations &&
      !supports(supportedGenerations, cpuGeneration)
    ) {
      issues.push(
        issue(
          "cpu-motherboard-generation",
          "error",
          `${cpuGeneration} processors are not listed as supported by this motherboard.`,
          ["processor", "motherboard"],
        ),
      );
    }

    const biosUpdateRequired = booleanAttribute(motherboard, [
      "BIOS Update Required",
      "BIOS Update Needed",
    ]);
    if (biosUpdateRequired === true) {
      issues.push(
        issue(
          "motherboard-bios-update",
          "warning",
          "This motherboard is marked as requiring a BIOS update for the selected CPU platform. Confirm the installed BIOS before assembly.",
          ["processor", "motherboard"],
        ),
      );
    }
  }

  if (motherboard && memory) {
    const memoryCapacity = parseCapacityGb(
      readAttribute(memory, ["Capacity", "Memory Capacity"]) ||
        memory.variantLabel ||
        "",
    );
    const maximumMemory = parseCapacityGb(
      readAttribute(motherboard, [
        "Maximum Memory",
        "Max Memory",
        "Memory Capacity",
      ]),
    );
    if (
      memoryCapacity !== null &&
      maximumMemory !== null &&
      memoryCapacity > maximumMemory
    ) {
      issues.push(
        issue(
          "motherboard-memory-capacity",
          "error",
          `${memoryCapacity}GB memory exceeds the motherboard maximum of ${maximumMemory}GB.`,
          ["motherboard", "memory"],
        ),
      );
    }

    const memoryRate = parseMemoryRate(
      readAttribute(memory, ["Speed", "Memory Speed"]),
    );
    const maximumRate = parseMemoryRate(
      readAttribute(motherboard, [
        "Maximum Memory Speed",
        "Max Memory Speed",
        "Memory Speed Support",
      ]),
    );
    if (
      memoryRate !== null &&
      maximumRate !== null &&
      memoryRate > maximumRate
    ) {
      issues.push(
        issue(
          "motherboard-memory-speed",
          "warning",
          `${Math.round(memoryRate)}MHz memory exceeds the motherboard listed ${Math.round(maximumRate)}MHz limit and may run at a lower speed.`,
          ["motherboard", "memory"],
        ),
      );
    }

    const memoryEcc = booleanAttribute(memory, ["ECC", "ECC Memory"]);
    const boardEcc = booleanAttribute(motherboard, [
      "ECC Support",
      "ECC Memory Support",
    ]);
    if (memoryEcc === true && boardEcc === false) {
      issues.push(
        issue(
          "motherboard-memory-ecc",
          "error",
          "The selected ECC memory is not supported by this motherboard.",
          ["motherboard", "memory"],
        ),
      );
    }
  }

  if (motherboard && storage) {
    const storageFormFactor = readAttribute(storage, ["Form Factor"]);
    const storageInterfaceValue = readAttribute(storage, [
      "Interface",
      "Storage Interface",
    ]);
    const boardM2Support = readAttribute(motherboard, [
      "M.2 Support",
      "M2 Support",
      "M.2 Interface",
    ]);

    if (isM2FormFactor(storageFormFactor) && boardM2Support) {
      const drive = storageInterface(storageInterfaceValue);
      const board = storageInterface(boardM2Support);
      if (drive.pcie && !board.pcie) {
        issues.push(
          issue(
            "motherboard-storage-interface",
            "error",
            `The selected M.2 drive uses ${storageInterfaceValue}, but the motherboard M.2 specification (${boardM2Support}) does not list PCIe/NVMe support.`,
            ["motherboard", "storage"],
          ),
        );
      } else if (drive.sata && !drive.pcie && !board.sata) {
        issues.push(
          issue(
            "motherboard-storage-interface",
            "error",
            `The selected M.2 drive uses SATA, but the motherboard M.2 specification (${boardM2Support}) does not list SATA support.`,
            ["motherboard", "storage"],
          ),
        );
      }

      const driveGeneration = parsePcieGeneration(storageInterfaceValue);
      const boardGeneration = parsePcieGeneration(boardM2Support);
      if (
        drive.pcie &&
        board.pcie &&
        driveGeneration !== null &&
        boardGeneration !== null &&
        driveGeneration > boardGeneration
      ) {
        issues.push(
          issue(
            "motherboard-storage-pcie-generation",
            "warning",
            `The PCIe Gen${driveGeneration} SSD can use this PCIe Gen${boardGeneration} M.2 slot, but it may run below its maximum speed.`,
            ["motherboard", "storage"],
          ),
        );
      }
    } else if (isM2FormFactor(storageFormFactor) && !boardM2Support) {
      issues.push(
        issue(
          "motherboard-storage-data",
          "warning",
          "The selected drive is M.2, but motherboard M.2 support data is missing, so slot compatibility cannot be fully verified.",
          ["motherboard", "storage"],
        ),
      );
    }
  }

  if (powerSupply && pcCase) {
    const psuFormFactor = readAttribute(powerSupply, [
      "Form Factor",
      "PSU Form Factor",
    ]);
    const casePsuSupport = readAttribute(pcCase, [
      "PSU Support",
      "Power Supply Support",
      "Supported PSU Form Factors",
    ]);
    if (
      psuFormFactor &&
      casePsuSupport &&
      !supports(casePsuSupport, psuFormFactor)
    ) {
      issues.push(
        issue(
          "psu-case-form-factor",
          "error",
          `${psuFormFactor} power supply is not listed as supported by this case (${casePsuSupport}).`,
          ["powerSupply", "case"],
        ),
      );
    }
  }

  if (cpu && cooler) {
    const cpuTdp = parseWatt(readAttribute(cpu, ["TDP", "Power Draw"]));
    const coolerTdp = parseWatt(
      readAttribute(cooler, ["TDP Support", "Cooling Capacity", "Max TDP"]),
    );
    if (cpuTdp !== null && coolerTdp !== null && coolerTdp < cpuTdp) {
      issues.push(
        issue(
          "cpu-cooler-tdp",
          "error",
          `${Math.round(coolerTdp)}W cooler capacity is below the processor ${Math.round(cpuTdp)}W TDP.`,
          ["processor", "cooler"],
        ),
      );
    } else if (cpuTdp !== null && coolerTdp === null) {
      issues.push(
        issue(
          "cpu-cooler-tdp-data",
          "warning",
          "CPU-cooler TDP capacity is missing, so thermal compatibility cannot be fully verified.",
          ["processor", "cooler"],
        ),
      );
    }
  }

  if (graphics && powerSupply) {
    const requiredConnectorValue = readAttribute(graphics, [
      "Power Connector",
      "Power Connectors",
      "Required Power Connector",
      "GPU Power Connector",
    ]);
    const availableConnectorValue = readAttribute(powerSupply, [
      "PCIe Connectors",
      "GPU Connectors",
      "Graphics Power Connectors",
    ]);

    if (requiredConnectorValue && availableConnectorValue) {
      const required = parseGpuPowerConnectors(requiredConnectorValue);
      const available = parseGpuPowerConnectors(availableConnectorValue);
      if (hasConnectorData(required) && hasConnectorData(available)) {
        const missing = missingGpuConnectorRequirement(required, available);
        if (missing) {
          issues.push(
            issue(
              "gpu-psu-power-connectors",
              "error",
              `The graphics card requires more ${missing} power connectors than the selected PSU provides.`,
              ["graphics", "powerSupply"],
            ),
          );
        }
      } else {
        issues.push(
          issue(
            "gpu-psu-power-connector-data",
            "warning",
            "GPU/PSU connector specifications are present but could not be parsed safely; verify the PCIe power cables before purchase.",
            ["graphics", "powerSupply"],
          ),
        );
      }
    } else if (requiredConnectorValue && !availableConnectorValue) {
      issues.push(
        issue(
          "gpu-psu-power-connector-data",
          "warning",
          "The graphics card lists a power-connector requirement, but the PSU connector inventory is missing.",
          ["graphics", "powerSupply"],
        ),
      );
    }
  }

  return issues;
}
