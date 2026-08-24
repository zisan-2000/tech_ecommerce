"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  BatteryCharging,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Copy,
  Cpu,
  Database,
  Fan,
  HardDrive,
  Headphones,
  Keyboard,
  MemoryStick,
  Monitor,
  MonitorUp,
  Mouse,
  PackagePlus,
  Plus,
  Power,
  Printer,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Speaker,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/components/ecommarce/CartContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePcBuilderCatalogSearch } from "@/components/ecommarce/pc-builder/usePcBuilderCatalogSearch";
import {
  PC_BUILDER_EXTRA_ITEMS_STORAGE_KEY,
  PC_BUILDER_SLOTS,
  PC_BUILDER_STORAGE_KEY,
  evaluatePcBuild,
  evaluatePcBuilderCandidate,
  parseSharedBuild,
  parseSharedBuildExtraItems,
  selectionFromIds,
  serializeSharedBuild,
  type PcBuildEvaluation,
  type PcBuilderCatalog,
  type PcBuilderProduct,
  type PcBuilderSelection,
  type PcBuilderSlotKey,
} from "@/lib/pc-builder";

type LiveValidationResponse = {
  selection: PcBuilderSelection;
  evaluation: PcBuildEvaluation;
  missingSlots: PcBuilderSlotKey[];
};

type PcBuilderStoreBranding = {
  name: string;
  logo: string | null;
  phone: string | null;
  email: string | null;
  website: string;
};

const SLOT_ICONS = {
  processor: Cpu,
  motherboard: Database,
  memory: MemoryStick,
  graphics: MonitorUp,
  storage: HardDrive,
  powerSupply: Power,
  case: PackagePlus,
  cooler: Fan,
  monitor: Monitor,
  casingCooler: Fan,
  keyboard: Keyboard,
  mouse: Mouse,
  speaker: Speaker,
  headphone: Headphones,
  networkAdapter: Wifi,
  antivirus: ShieldCheck,
  ups: BatteryCharging,
} satisfies Record<PcBuilderSlotKey, typeof Cpu>;

const SLOT_ATTRIBUTES: Partial<Record<PcBuilderSlotKey, string[]>> = {
  processor: ["Socket", "TDP", "Integrated Graphics"],
  motherboard: ["Socket", "Memory Type", "Form Factor"],
  memory: ["Memory Type", "Capacity", "Speed"],
  graphics: ["Memory", "Power Draw", "GPU Length"],
  storage: ["Capacity", "Interface", "Form Factor"],
  powerSupply: ["Wattage", "Power", "Efficiency"],
  case: ["Motherboard Support", "Max GPU Length", "Max Cooler Height"],
  cooler: ["Socket Support", "Cooler Height", "TDP Support"],
  monitor: ["Screen Size", "Resolution", "Refresh Rate"],
  keyboard: ["Type", "Connectivity", "Layout"],
  mouse: ["DPI", "Connectivity", "Buttons"],
  speaker: ["Channel", "Output Power", "Connectivity"],
  headphone: ["Type", "Connectivity", "Driver"],
  networkAdapter: ["Interface", "Speed", "Standard"],
  ups: ["Capacity", "Backup Time", "Output"],
};

const CORE_SLOTS = PC_BUILDER_SLOTS.filter((slot) => slot.group === "core");
const PERIPHERAL_SLOTS = PC_BUILDER_SLOTS.filter(
  (slot) => slot.group === "peripheral",
);

type ExtraItems = Partial<Record<PcBuilderSlotKey, PcBuilderProduct[]>>;

// Keeps client-side adds aligned with the server's saved-build cap.
const MAX_EXTRA_ITEMS_PER_SLOT = 8;

function money(value: number, currency = "BDT") {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "BDT",
    maximumFractionDigits: 0,
  }).format(value);
}

function selectedIds(selection: PcBuilderSelection) {
  return Object.fromEntries(
    PC_BUILDER_SLOTS.flatMap((slot) => {
      const product = selection[slot.key];
      return product ? [[slot.key, product.selectionId]] : [];
    }),
  ) as Partial<Record<PcBuilderSlotKey, string>>;
}

function extraItemIds(extraItems: ExtraItems) {
  return Object.fromEntries(
    PC_BUILDER_SLOTS.flatMap((slot) => {
      const products = extraItems[slot.key];
      return products?.length
        ? [[slot.key, products.map((product) => product.selectionId)]]
        : [];
    }),
  ) as Partial<Record<PcBuilderSlotKey, string[]>>;
}

function extraItemsFromCatalog(
  catalog: PcBuilderCatalog,
  ids: Partial<Record<PcBuilderSlotKey, string[]>>,
): ExtraItems {
  const result: ExtraItems = {};
  for (const slot of PC_BUILDER_SLOTS) {
    const requestedIds = ids[slot.key];
    if (!requestedIds?.length) continue;
    const products = requestedIds.flatMap((id) => {
      const product = catalog[slot.key].find(
        (item) => item.selectionId === id || String(item.id) === id,
      );
      return product ? [product] : [];
    });
    if (products.length) result[slot.key] = products;
  }
  return result;
}

function productSpecs(product: PcBuilderProduct, slot: PcBuilderSlotKey) {
  const preferred = (SLOT_ATTRIBUTES[slot] ?? []).flatMap((name) => {
    const match = Object.entries(product.attributes).find(
      ([attribute]) => attribute.toLowerCase() === name.toLowerCase(),
    );
    return match ? [`${match[0]}: ${match[1]}`] : [];
  });
  return preferred.slice(0, 3);
}

export default function PcBuilderClient({
  catalog,
  loadFailed,
  branding,
  initialExtraItems,
}: {
  catalog: PcBuilderCatalog;
  loadFailed: boolean;
  branding: PcBuilderStoreBranding;
  initialExtraItems?: Partial<Record<PcBuilderSlotKey, PcBuilderProduct[]>>;
}) {
  const { addToCart } = useCart();
  const [selection, setSelection] = useState<PcBuilderSelection>({});
  const [extraItems, setExtraItems] = useState<ExtraItems>({});
  const [activeSlot, setActiveSlot] = useState<PcBuilderSlotKey | null>(null);
  const [addExtraMode, setAddExtraMode] = useState(false);
  const [query, setQuery] = useState("");
  const [compatibleOnly, setCompatibleOnly] = useState(true);
  const [restored, setRestored] = useState(false);
  const [adding, setAdding] = useState(false);
  const {
    products: activeProducts,
    nextCursor: pickerNextCursor,
    loading: pickerLoading,
    loadingMore: pickerLoadingMore,
    error: pickerError,
    loadMore: loadMorePicker,
  } = usePcBuilderCatalogSearch({
    slot: activeSlot,
    query,
    seed: activeSlot ? catalog[activeSlot] : catalog.processor,
  });

  useEffect(() => {
    const buildParam = new URLSearchParams(window.location.search).get("build");
    const shared = parseSharedBuild(buildParam);
    const sharedExtras = parseSharedBuildExtraItems(buildParam);
    const hasSharedBuild =
      Object.keys(shared).length > 0 || Object.keys(sharedExtras).length > 0;

    if (hasSharedBuild) {
      // The server already resolved these live selectionIds into real
      // products (and merged them into `catalog`), so trust its result
      // instead of re-parsing IDs against the client-loaded page.
      setSelection(selectionFromIds(catalog, shared));
      setExtraItems(
        initialExtraItems
          ? Object.fromEntries(
              PC_BUILDER_SLOTS.flatMap((slot) => {
                const products = initialExtraItems[slot.key];
                return products?.length ? [[slot.key, products]] : [];
              }),
            )
          : {},
      );
    } else {
      let ids: Partial<Record<PcBuilderSlotKey, string | number>> = {};
      let extraIds: Partial<Record<PcBuilderSlotKey, string[]>> = {};
      try {
        const stored = JSON.parse(
          localStorage.getItem(PC_BUILDER_STORAGE_KEY) || "{}",
        ) as Partial<Record<PcBuilderSlotKey, string | number>>;
        ids = stored && typeof stored === "object" ? stored : {};
      } catch {
        localStorage.removeItem(PC_BUILDER_STORAGE_KEY);
      }
      try {
        const storedExtras = JSON.parse(
          localStorage.getItem(PC_BUILDER_EXTRA_ITEMS_STORAGE_KEY) || "{}",
        ) as Partial<Record<PcBuilderSlotKey, string[]>>;
        extraIds = storedExtras && typeof storedExtras === "object" ? storedExtras : {};
      } catch {
        localStorage.removeItem(PC_BUILDER_EXTRA_ITEMS_STORAGE_KEY);
      }
      setSelection(selectionFromIds(catalog, ids));
      setExtraItems(extraItemsFromCatalog(catalog, extraIds));
    }
    setRestored(true);
    // Only ever run this restore pass once on mount; `catalog` identity can
    // change across re-renders without meaning "restore again".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(
        PC_BUILDER_STORAGE_KEY,
        JSON.stringify(selectedIds(selection)),
      );
    } catch {
      // Storage can be unavailable in strict privacy modes; the builder remains usable.
    }
  }, [restored, selection]);

  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(
        PC_BUILDER_EXTRA_ITEMS_STORAGE_KEY,
        JSON.stringify(extraItemIds(extraItems)),
      );
    } catch {
      // Storage can be unavailable in strict privacy modes; the builder remains usable.
    }
  }, [restored, extraItems]);

  const evaluation = useMemo(() => evaluatePcBuild(selection), [selection]);
  const selectedProducts = useMemo(
    () =>
      PC_BUILDER_SLOTS.flatMap((slot) => {
        const product = selection[slot.key];
        return product ? [product] : [];
      }),
    [selection],
  );
  const extraProducts = useMemo(
    () => PC_BUILDER_SLOTS.flatMap((slot) => extraItems[slot.key] ?? []),
    [extraItems],
  );
  const total = [...selectedProducts, ...extraProducts].reduce(
    (sum, product) => sum + product.price,
    0,
  );
  const totalCurrency =
    selectedProducts[0]?.currency ?? extraProducts[0]?.currency ?? "BDT";

  // One printable line per slot; multi-add slots repeat the label only on the first row.
  const quotationRows = useMemo(
    () =>
      PC_BUILDER_SLOTS.map((slot) => {
        const items = [
          ...(selection[slot.key] ? [selection[slot.key]!] : []),
          ...(extraItems[slot.key] ?? []),
        ];
        return { slot, items };
      }),
    [extraItems, selection],
  );
  const regularTotal = [...selectedProducts, ...extraProducts].reduce(
    (sum, product) => sum + (product.originalPrice ?? product.price),
    0,
  );
  const hasDiscount = regularTotal > total;
  const filteredProducts = useMemo(() => {
    return activeProducts.filter((product) => {
      if (activeSlot && compatibleOnly) {
        const candidate = evaluatePcBuilderCandidate(
          selection,
          activeSlot,
          product,
        );
        if (!candidate.builderReady || !candidate.compatible) return false;
      }
      return true;
    });
  }, [activeProducts, activeSlot, compatibleOnly, selection]);

  const choose = (slot: PcBuilderSlotKey, product: PcBuilderProduct) => {
    if (addExtraMode) {
      setExtraItems((current) => {
        const existing = current[slot] ?? [];
        // Guard against duplicate adds (e.g. a fast double click before the
        // dialog closes) producing two list entries with the same key.
        if (existing.some((item) => item.selectionId === product.selectionId)) {
          return current;
        }
        if (existing.length >= MAX_EXTRA_ITEMS_PER_SLOT) return current;
        return { ...current, [slot]: [...existing, product] };
      });
    } else {
      setSelection((current) => ({ ...current, [slot]: product }));
    }
    setActiveSlot(null);
    setAddExtraMode(false);
    setQuery("");
    setCompatibleOnly(true);
  };

  const openSlot = (slot: PcBuilderSlotKey, extra = false) => {
    setActiveSlot(slot);
    setAddExtraMode(extra);
    setQuery("");
    setCompatibleOnly(!extra);
  };

  const closePicker = () => {
    setActiveSlot(null);
    setAddExtraMode(false);
    setQuery("");
    setCompatibleOnly(true);
  };

  const remove = (slot: PcBuilderSlotKey) => {
    setSelection((current) => {
      const next = { ...current };
      delete next[slot];
      return next;
    });
  };

  const removeExtra = (slot: PcBuilderSlotKey, selectionId: string) => {
    setExtraItems((current) => {
      const next = { ...current };
      const remaining = (next[slot] ?? []).filter(
        (product) => product.selectionId !== selectionId,
      );
      if (remaining.length) next[slot] = remaining;
      else delete next[slot];
      return next;
    });
  };

  const reset = () => {
    setSelection({});
    setExtraItems({});
    const url = new URL(window.location.href);
    url.searchParams.delete("build");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    toast.success("PC build cleared");
  };

  const share = async () => {
    if (!selectedProducts.length && !extraProducts.length) {
      toast.error("Select at least one component before sharing.");
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set(
      "build",
      serializeSharedBuild(selection, extraItemIds(extraItems)),
    );
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    try {
      await navigator.clipboard.writeText(url.toString());
      toast.success("Shareable build link copied");
    } catch {
      toast.info("Share link is ready in the address bar for manual copying.");
    }
  };

  const addBuildToCart = async () => {
    if (!evaluation.canAddToCart || adding) return;
    setAdding(true);
    try {
      const response = await fetch("/api/pc-builder/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ selections: selectedIds(selection) }),
      });
      const payload = (await response.json().catch(() => null)) as
        | LiveValidationResponse
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(
          (payload && "error" in payload && payload.error) ||
            "Build validation failed",
        );
      }
      if (
        !payload ||
        !("selection" in payload) ||
        !("evaluation" in payload) ||
        !("missingSlots" in payload)
      ) {
        throw new Error("Invalid validation response");
      }

      setSelection(payload.selection);
      if (payload.missingSlots.length > 0) {
        toast.error(
          "Some selected components are no longer available. Your build has been refreshed.",
        );
        return;
      }
      if (!payload.evaluation.canAddToCart) {
        toast.error(
          "Live validation found an incomplete or incompatible component. Review the highlighted issues.",
        );
        return;
      }

      const validatedProducts = [
        ...PC_BUILDER_SLOTS.flatMap((slot) => {
          const product = payload.selection[slot.key];
          return product ? [product] : [];
        }),
        ...extraProducts,
      ];
      let addedCount = 0;
      for (const product of validatedProducts) {
        const added = await addToCart(product.id, 1, product.variantId, {
          product: {
            id: product.id,
            name: product.name,
            price: product.price,
            image: product.image,
            variants: [
              {
                id: product.variantId,
                price: product.price,
                sku: product.variantSku,
                options: product.variantLabel
                  ? { Configuration: product.variantLabel }
                  : null,
              },
            ],
          },
        });
        if (added) addedCount += 1;
      }
      if (addedCount === validatedProducts.length) {
        toast.success(`${addedCount} build components added to cart`);
      } else {
        toast.error(
          `${addedCount} of ${validatedProducts.length} components were added. Review unavailable items.`,
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The build could not be validated safely.",
      );
    } finally {
      setAdding(false);
    }
  };

  if (loadFailed) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-14 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
        <h2 className="mt-4 text-xl font-bold">
          PC Builder is temporarily unavailable
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Component availability could not be loaded safely. Please refresh
          shortly; no selection or cart data was changed.
        </p>
      </div>
    );
  }

  return (
    <div
      id="pc-builder-print-root"
      className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"
    >
      <section aria-labelledby="components-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
              Build workspace
            </p>
            <h2 id="components-heading" className="mt-0.5 text-lg font-black">
              Choose your components
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={share}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition hover:border-primary hover:text-primary"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Share
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={!selectedProducts.length && !extraProducts.length}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition hover:border-destructive hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset
            </button>
          </div>
        </div>

        {[
          { title: "Core Components", slots: CORE_SLOTS },
          { title: "Peripherals & Others", slots: PERIPHERAL_SLOTS },
        ].map((section) => (
          <div
            key={section.title}
            className="overflow-hidden rounded-xl border bg-card shadow-sm"
          >
            <div className="bg-muted/60 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
              {section.title}
            </div>
            <div className="divide-y">
              {section.slots.map((slot) => {
                const product = selection[slot.key];
                const extras = extraItems[slot.key] ?? [];
                const SlotIcon = SLOT_ICONS[slot.key];
                const slotIssues = evaluation.issues.filter((item) =>
                  item.slots.includes(slot.key),
                );
                const hasError = slotIssues.some(
                  (item) => item.severity === "error",
                );
                const canAddMore = slot.multiple && Boolean(product);
                return (
                  <div
                    key={slot.key}
                    data-testid={`pc-builder-slot-${slot.key}`}
                    className={hasError ? "bg-destructive/[0.03]" : undefined}
                  >
                    <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 sm:grid-cols-[36px_180px_minmax(0,1fr)_auto]">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <SlotIcon className="h-4 w-4" aria-hidden="true" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="text-sm font-semibold">
                            {slot.label}
                          </h3>
                          {slot.required ? (
                            <span className="rounded bg-primary/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary-foreground">
                              Required
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="col-span-2 min-w-0 sm:col-span-1">
                        {product ? (
                          <div className="flex min-w-0 items-center gap-2.5">
                            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md border bg-white">
                              <Image
                                src={product.image || "/placeholder.svg"}
                                alt=""
                                fill
                                sizes="36px"
                                className="object-contain p-1"
                              />
                            </div>
                            <div className="min-w-0">
                              <Link
                                href={`/ecommerce/products/${product.id}`}
                                className="line-clamp-1 text-xs font-semibold hover:text-primary hover:underline"
                              >
                                {product.name}
                              </Link>
                              <p className="text-xs font-bold text-primary">
                                {money(product.price, product.currency)}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="truncate text-xs text-muted-foreground">
                            {slot.description}
                          </p>
                        )}
                        {slotIssues.length > 0 ? (
                          <p
                            className={`mt-1 flex items-start gap-1 text-[11px] ${slotIssues[0].severity === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-400"}`}
                          >
                            <AlertTriangle
                              className="mt-0.5 h-3 w-3 shrink-0"
                              aria-hidden="true"
                            />{" "}
                            {slotIssues[0].message}
                          </p>
                        ) : null}
                      </div>

                      <div className="col-span-3 flex items-center gap-2 sm:col-span-1">
                        <button
                          type="button"
                          onClick={() => openSlot(slot.key)}
                          className="inline-flex h-8 flex-1 items-center justify-center rounded-md border border-primary px-3 text-xs font-bold text-primary transition hover:bg-primary hover:text-primary-foreground sm:flex-none sm:min-w-[76px]"
                        >
                          {product ? "Change" : "Choose"}
                        </button>
                        {product ? (
                          <button
                            type="button"
                            onClick={() => remove(slot.key)}
                            aria-label={`Remove ${slot.label}`}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition hover:border-destructive hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {extras.length > 0 ? (
                      <div className="space-y-2 border-t border-dashed bg-muted/20 px-4 py-2.5 pl-[52px]">
                        {extras.map((extra) => (
                          <div
                            key={extra.selectionId}
                            className="flex min-w-0 items-center gap-2.5"
                          >
                            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border bg-white">
                              <Image
                                src={extra.image || "/placeholder.svg"}
                                alt=""
                                fill
                                sizes="32px"
                                className="object-contain p-0.5"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <Link
                                href={`/ecommerce/products/${extra.id}`}
                                className="line-clamp-1 text-xs font-semibold hover:text-primary hover:underline"
                              >
                                {extra.name}
                              </Link>
                              <p className="text-xs font-bold text-primary">
                                {money(extra.price, extra.currency)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                removeExtra(slot.key, extra.selectionId)
                              }
                              aria-label={`Remove additional ${slot.label}`}
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition hover:border-destructive hover:text-destructive"
                            >
                              <X className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {canAddMore ? (
                      <div className="border-t border-dashed px-4 py-1.5 pl-[52px]">
                        <button
                          type="button"
                          onClick={() => openSlot(slot.key, true)}
                          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary hover:underline"
                        >
                          <Plus className="h-3 w-3" aria-hidden="true" /> Add
                          another {slot.label.toLowerCase()}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <aside className="space-y-4 lg:sticky lg:top-36">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-2.5 text-center">
            <p className="text-lg font-black leading-none text-primary">
              {evaluation.estimatedWattage || 0}W
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Estimated wattage
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-center text-primary-foreground">
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            <div>
              <p className="text-lg font-black leading-none">
                {selectedProducts.length + extraProducts.length}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-wide opacity-90">
                Items
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="border-b bg-muted/40 px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
              Build summary
            </p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <h2 className="text-xl font-black">Your custom PC</h2>
              <span className="text-sm font-bold text-muted-foreground">
                {evaluation.completedRequiredCount}/{evaluation.requiredCount}{" "}
                required
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${(evaluation.completedRequiredCount / evaluation.requiredCount) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="space-y-4 p-5">
            <div className="flex items-center justify-between border-b pb-4">
              <span className="text-sm font-semibold text-muted-foreground">
                Estimated total
              </span>
              <span className="text-2xl font-black text-primary">
                {money(total, totalCurrency)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border bg-muted/30 p-3">
                <Zap className="h-4 w-4 text-amber-500" aria-hidden="true" />
                <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
                  Estimated draw
                </p>
                <p className="text-lg font-black">
                  {evaluation.estimatedWattage || 0}W
                </p>
              </div>
              <div className="rounded-xl border bg-muted/30 p-3">
                <CircleGauge
                  className="h-4 w-4 text-primary"
                  aria-hidden="true"
                />
                <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
                  Recommended PSU
                </p>
                <p className="text-lg font-black">
                  {evaluation.recommendedPsuWattage || 0}W+
                </p>
              </div>
            </div>

            {evaluation.issues.length ? (
              <div aria-live="polite" className="space-y-2">
                {evaluation.issues.map((item) => (
                  <div
                    key={item.code}
                    className={`rounded-lg border px-3 py-2 text-xs ${item.severity === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-amber-300/50 bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300"}`}
                  >
                    <span className="font-bold">
                      {item.severity === "error"
                        ? "Compatibility issue: "
                        : "Check: "}
                    </span>
                    {item.message}
                  </div>
                ))}
              </div>
            ) : selectedProducts.length ? (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-300/50 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />{" "}
                No compatibility conflict detected in the selected components.
              </div>
            ) : null}

            {!evaluation.requiredComplete ? (
              <p className="text-center text-xs text-muted-foreground">
                Select every required component to add the build to your cart.
              </p>
            ) : null}
            <button
              type="button"
              onClick={addBuildToCart}
              disabled={!evaluation.canAddToCart || adding}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-black text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              {adding
                ? "Adding build..."
                : evaluation.hasErrors
                  ? "Resolve compatibility issues"
                  : "Add complete build to cart"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!selectedProducts.length && !extraProducts.length}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-sm font-bold transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Printer className="h-4 w-4" aria-hidden="true" /> Print build
            </button>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Compatibility results depend on product specification data. Verify
              BIOS version, connectors and physical clearances before purchase.
            </p>
          </div>
        </div>
      </aside>

      <Dialog
        open={activeSlot !== null}
        onOpenChange={(open) => {
          if (!open) closePicker();
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-24px)] max-w-5xl flex-col gap-0 overflow-hidden p-0">
          {activeSlot ? (
            <>
              <DialogHeader className="border-b px-5 py-4 pr-12">
                <DialogTitle>
                  {addExtraMode ? "Add another " : "Select "}
                  {
                    PC_BUILDER_SLOTS.find((slot) => slot.key === activeSlot)
                      ?.label
                  }
                </DialogTitle>
                <DialogDescription>
                  {addExtraMode
                    ? "This additional item is added to your cart alongside your build without affecting compatibility checks."
                    : "Live catalog results are searched and cursor-paginated from the server. Compatible, builder-ready options are shown by default."}
                </DialogDescription>
              </DialogHeader>
              <div className="border-b p-4">
                <label className="relative block">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="sr-only">Search components</span>
                  <input
                    value={query}
                    onChange={(event) =>
                      setQuery(event.target.value.slice(0, 80))
                    }
                    placeholder="Search by product, brand or specification"
                    className="h-11 w-full rounded-xl border bg-background pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </label>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={compatibleOnly}
                      onChange={(event) =>
                        setCompatibleOnly(event.target.checked)
                      }
                      className="h-4 w-4 rounded border"
                    />
                    Compatible only
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {pickerLoading
                      ? "Searching live catalog..."
                      : `Showing ${filteredProducts.length} compatible of ${activeProducts.length} loaded`}
                  </span>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {pickerError ? (
                  <div
                    role="alert"
                    className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                  >
                    {pickerError} Try changing the search or reopen this
                    component picker.
                  </div>
                ) : null}
                {pickerLoading && activeProducts.length === 0 ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">
                    Loading components...
                  </div>
                ) : filteredProducts.length ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {filteredProducts.map((product) => {
                      const candidateStatus = evaluatePcBuilderCandidate(
                        selection,
                        activeSlot,
                        product,
                      );
                      const readinessIssues = candidateStatus.readinessIssues;
                      const notBuilderReady = !candidateStatus.builderReady;
                      const incompatible = !candidateStatus.compatible;
                      const statusIssue =
                        readinessIssues.find(
                          (item) => item.severity === "error",
                        ) ??
                        candidateStatus.blockingIssues[0] ??
                        candidateStatus.warningIssues[0] ??
                        candidateStatus.deferredIssues[0];
                      return (
                        <article
                          key={product.selectionId}
                          className={`rounded-xl border p-3 transition ${incompatible || notBuilderReady ? "border-destructive/40" : "hover:border-primary/50"}`}
                        >
                          <div className="flex gap-3">
                            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border bg-white">
                              <Image
                                src={product.image || "/placeholder.svg"}
                                alt=""
                                fill
                                sizes="96px"
                                className="object-contain p-2"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                                {product.brand || "Component"}
                              </p>
                              <h3 className="mt-1 line-clamp-2 text-sm font-black">
                                {product.name}
                              </h3>
                              {product.variantLabel ? (
                                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                                  {product.variantLabel}
                                </p>
                              ) : null}
                              <p className="mt-2 text-lg font-black text-primary">
                                {money(product.price, product.currency)}
                              </p>
                              <p
                                className={`mt-1 text-xs font-bold ${product.stock > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}
                              >
                                {product.stock > 0
                                  ? `${product.stock} in stock`
                                  : "Out of stock"}
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {productSpecs(product, activeSlot).map((spec) => (
                              <span
                                key={spec}
                                className="rounded-md bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground"
                              >
                                {spec}
                              </span>
                            ))}
                          </div>
                          {statusIssue ? (
                            <p
                              className={`mt-3 text-xs ${notBuilderReady || incompatible ? "text-destructive" : "text-amber-700 dark:text-amber-400"}`}
                            >
                              {statusIssue.message}
                            </p>
                          ) : (
                            <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                              <Check
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />{" "}
                              Compatible with current selection
                            </p>
                          )}
                          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                            <button
                              type="button"
                              onClick={() => choose(activeSlot, product)}
                              disabled={
                                product.stock < 1 ||
                                notBuilderReady ||
                                incompatible
                              }
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {product.stock < 1
                                ? "Out of stock"
                                : notBuilderReady
                                  ? "Missing required specs"
                                  : incompatible
                                    ? "Incompatible"
                                    : "Select component"}{" "}
                              <ChevronRight
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </button>
                            <Link
                              href={`/ecommerce/products/${product.id}`}
                              className="inline-flex h-10 items-center justify-center rounded-lg border px-3 text-xs font-bold hover:border-primary hover:text-primary"
                            >
                              Details
                            </Link>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-16 text-center">
                    <Search
                      className="mx-auto h-8 w-8 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <h3 className="mt-3 font-bold">No matching components</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {compatibleOnly
                        ? "No compatible, builder-ready options are in the loaded pages yet."
                        : "No live catalog products match this search."}
                    </p>
                    {compatibleOnly ? (
                      <button
                        type="button"
                        onClick={() => setCompatibleOnly(false)}
                        className="mt-4 inline-flex h-9 items-center justify-center rounded-lg border px-3 text-xs font-bold transition hover:border-primary hover:text-primary"
                      >
                        Show all components
                      </button>
                    ) : null}
                  </div>
                )}
                {pickerNextCursor ? (
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={loadMorePicker}
                      disabled={pickerLoading || pickerLoadingMore}
                      className="inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-bold transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {pickerLoadingMore ? "Loading more..." : "Load more"}
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Portalled to <body> so the print stylesheet can collapse the storefront
          around it and keep the quotation to its own page height. */}
      {restored && typeof document !== "undefined"
        ? createPortal(
            <div id="pc-builder-quotation" aria-hidden="true">
              <div className="quotation-brand">
                {/* Plain img: the print sheet needs an immediately-painted image, not a lazy next/image. */}
                {branding.logo ? <img src={branding.logo} alt="" /> : null}
                <div>
                  <p className="quotation-store">{branding.name}</p>
                  <p className="quotation-contact">
                    {branding.phone ? <>Phone: {branding.phone}</> : null}
                    {branding.phone && branding.email ? ", " : null}
                    {branding.email ? <>Email: {branding.email}</> : null}
                  </p>
                  {branding.website ? (
                    <p className="quotation-contact">
                      <a href={branding.website}>{branding.website}</a>
                    </p>
                  ) : null}
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th style={{ width: "22%" }}>Component</th>
                    <th style={{ width: "48%" }}>Product Name</th>
                    <th style={{ width: "15%" }}>Price</th>
                    <th style={{ width: "15%" }}>Regular Price</th>
                  </tr>
                </thead>
                <tbody>
                  {quotationRows.map(({ slot, items }) =>
                    items.length === 0 ? (
                      <tr key={slot.key}>
                        <td className="quotation-component">{slot.label}</td>
                        <td />
                        <td />
                        <td />
                      </tr>
                    ) : (
                      items.map((item, itemIndex) => (
                        <tr key={`${slot.key}-${item.selectionId}`}>
                          <td className="quotation-component">
                            {itemIndex === 0 ? slot.label : ""}
                          </td>
                          <td className="quotation-name">{item.name}</td>
                          <td>
                            {item.originalPrice &&
                            item.originalPrice > item.price ? (
                              <span className="quotation-strike">
                                {money(item.originalPrice, item.currency)}
                              </span>
                            ) : null}
                            {money(item.price, item.currency)}
                          </td>
                          <td>
                            {money(
                              item.originalPrice ?? item.price,
                              item.currency,
                            )}
                          </td>
                        </tr>
                      ))
                    ),
                  )}
                  <tr>
                    <td className="quotation-total-spacer" />
                    <td className="quotation-total-label">Total:</td>
                    <td>
                      {hasDiscount ? (
                        <span className="quotation-strike">
                          {money(regularTotal, totalCurrency)}
                        </span>
                      ) : null}
                      {money(total, totalCurrency)}
                    </td>
                    <td>{money(regularTotal, totalCurrency)}</td>
                  </tr>
                </tbody>
              </table>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
