"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Copy,
  Cpu,
  Database,
  Fan,
  HardDrive,
  MemoryStick,
  MonitorUp,
  PackagePlus,
  Plus,
  Power,
  Printer,
  RotateCcw,
  Search,
  ShieldAlert,
  ShoppingCart,
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
  PC_BUILDER_SLOTS,
  PC_BUILDER_STORAGE_KEY,
  evaluatePcBuild,
  evaluatePcBuilderCandidate,
  parseSharedBuild,
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

const SLOT_ICONS = {
  processor: Cpu,
  motherboard: Database,
  memory: MemoryStick,
  graphics: MonitorUp,
  storage: HardDrive,
  powerSupply: Power,
  case: PackagePlus,
  cooler: Fan,
} satisfies Record<PcBuilderSlotKey, typeof Cpu>;

const SLOT_ATTRIBUTES: Record<PcBuilderSlotKey, string[]> = {
  processor: ["Socket", "TDP", "Integrated Graphics"],
  motherboard: ["Socket", "Memory Type", "Form Factor"],
  memory: ["Memory Type", "Capacity", "Speed"],
  graphics: ["Memory", "Power Draw", "GPU Length"],
  storage: ["Capacity", "Interface", "Form Factor"],
  powerSupply: ["Wattage", "Power", "Efficiency"],
  case: ["Motherboard Support", "Max GPU Length", "Max Cooler Height"],
  cooler: ["Socket Support", "Cooler Height", "TDP Support"],
};

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

function productSpecs(product: PcBuilderProduct, slot: PcBuilderSlotKey) {
  const preferred = SLOT_ATTRIBUTES[slot].flatMap((name) => {
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
}: {
  catalog: PcBuilderCatalog;
  loadFailed: boolean;
}) {
  const { addToCart } = useCart();
  const [selection, setSelection] = useState<PcBuilderSelection>({});
  const [activeSlot, setActiveSlot] = useState<PcBuilderSlotKey | null>(null);
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
    let ids: Partial<Record<PcBuilderSlotKey, string | number>> = {};
    const shared = parseSharedBuild(
      new URLSearchParams(window.location.search).get("build"),
    );
    if (Object.keys(shared).length) {
      ids = shared;
    } else {
      try {
        const stored = JSON.parse(
          localStorage.getItem(PC_BUILDER_STORAGE_KEY) || "{}",
        ) as Partial<Record<PcBuilderSlotKey, string | number>>;
        ids = stored && typeof stored === "object" ? stored : {};
      } catch {
        localStorage.removeItem(PC_BUILDER_STORAGE_KEY);
      }
    }
    setSelection(selectionFromIds(catalog, ids));
    setRestored(true);
  }, [catalog]);

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

  const evaluation = useMemo(() => evaluatePcBuild(selection), [selection]);
  const selectedProducts = useMemo(
    () =>
      PC_BUILDER_SLOTS.flatMap((slot) => {
        const product = selection[slot.key];
        return product ? [product] : [];
      }),
    [selection],
  );
  const total = selectedProducts.reduce((sum, product) => sum + product.price, 0);
  const totalCurrency = selectedProducts[0]?.currency ?? "BDT";
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
    setSelection((current) => ({ ...current, [slot]: product }));
    setActiveSlot(null);
    setQuery("");
    setCompatibleOnly(true);
  };

  const openSlot = (slot: PcBuilderSlotKey) => {
    setActiveSlot(slot);
    setQuery("");
    setCompatibleOnly(true);
  };

  const closePicker = () => {
    setActiveSlot(null);
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

  const reset = () => {
    setSelection({});
    const url = new URL(window.location.href);
    url.searchParams.delete("build");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    toast.success("PC build cleared");
  };

  const share = async () => {
    if (!selectedProducts.length) {
      toast.error("Select at least one component before sharing.");
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("build", serializeSharedBuild(selection));
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

      const validatedProducts = PC_BUILDER_SLOTS.flatMap((slot) => {
        const product = payload.selection[slot.key];
        return product ? [product] : [];
      });
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
        <h2 className="mt-4 text-xl font-bold">PC Builder is temporarily unavailable</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Component availability could not be loaded safely. Please refresh shortly; no selection or cart data was changed.
        </p>
      </div>
    );
  }

  return (
    <div
      id="pc-builder-print-root"
      className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"
    >
      <section aria-labelledby="components-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-4 shadow-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Build workspace</p>
            <h2 id="components-heading" className="mt-1 text-xl font-black">Choose your components</h2>
          </div>
          <div className="pc-builder-print-hidden flex items-center gap-2">
            <button type="button" onClick={share} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-bold transition hover:border-primary hover:text-primary">
              <Copy className="h-4 w-4" aria-hidden="true" /> Share
            </button>
            <button type="button" onClick={reset} disabled={!selectedProducts.length} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-bold transition hover:border-destructive hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40">
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset
            </button>
          </div>
        </div>

        {PC_BUILDER_SLOTS.map((slot, index) => {
          const product = selection[slot.key];
          const SlotIcon = SLOT_ICONS[slot.key];
          const slotIssues = evaluation.issues.filter((item) => item.slots.includes(slot.key));
          const hasError = slotIssues.some((item) => item.severity === "error");
          return (
            <article key={slot.key} data-testid={`pc-builder-slot-${slot.key}`} className={`rounded-2xl border bg-card shadow-sm transition ${hasError ? "border-destructive/60" : product ? "border-primary/30" : "border-border"}`}>
              <div className="grid gap-4 p-4 sm:grid-cols-[52px_minmax(0,1fr)_auto] sm:items-center sm:p-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <SlotIcon className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                    <h3 className="font-black">{slot.label}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${slot.required ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {slot.required ? "Required" : "Optional"}
                    </span>
                  </div>

                  {product ? (
                    <div className="mt-3 flex min-w-0 gap-3">
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-white">
                        <Image src={product.image || "/placeholder.svg"} alt="" fill sizes="64px" className="object-contain p-1.5" />
                      </div>
                      <div className="min-w-0">
                        <Link href={`/ecommerce/products/${product.id}`} className="line-clamp-2 text-sm font-bold hover:text-primary hover:underline">
                          {product.name}
                        </Link>
                        <p className="mt-1 text-sm font-black text-primary">{money(product.price, product.currency)}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{product.variantLabel || productSpecs(product, slot.key).join(" • ")}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">{slot.description}</p>
                  )}

                  {slotIssues.length > 0 ? (
                    <div className="mt-3 space-y-1">
                      {slotIssues.slice(0, 2).map((item) => (
                        <p key={item.code} className={`flex items-start gap-1.5 text-xs ${item.severity === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-400"}`}>
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {item.message}
                        </p>
                      ))}
                    </div>
                  ) : product ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> No detected conflict
                    </p>
                  ) : null}
                </div>

                <div className="pc-builder-print-hidden flex items-center gap-2 sm:flex-col sm:items-stretch">
                  <button type="button" onClick={() => openSlot(slot.key)} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 sm:min-w-28">
                    {product ? "Change" : <><Plus className="h-4 w-4" aria-hidden="true" /> Choose</>}
                  </button>
                  {product ? (
                    <button type="button" onClick={() => remove(slot.key)} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border px-3 text-xs font-bold text-muted-foreground transition hover:border-destructive hover:text-destructive">
                      <X className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <aside className="space-y-4 lg:sticky lg:top-36">
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="border-b bg-muted/40 px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Build summary</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <h2 className="text-xl font-black">Your custom PC</h2>
              <span className="text-sm font-bold text-muted-foreground">{evaluation.completedRequiredCount}/{evaluation.requiredCount} required</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(evaluation.completedRequiredCount / evaluation.requiredCount) * 100}%` }} />
            </div>
          </div>

          <div className="space-y-4 p-5">
            <div className="flex items-center justify-between border-b pb-4">
              <span className="text-sm font-semibold text-muted-foreground">Estimated total</span>
              <span className="text-2xl font-black text-primary">{money(total, totalCurrency)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border bg-muted/30 p-3">
                <Zap className="h-4 w-4 text-amber-500" aria-hidden="true" />
                <p className="mt-2 text-[11px] font-semibold text-muted-foreground">Estimated draw</p>
                <p className="text-lg font-black">{evaluation.estimatedWattage || 0}W</p>
              </div>
              <div className="rounded-xl border bg-muted/30 p-3">
                <CircleGauge className="h-4 w-4 text-primary" aria-hidden="true" />
                <p className="mt-2 text-[11px] font-semibold text-muted-foreground">Recommended PSU</p>
                <p className="text-lg font-black">{evaluation.recommendedPsuWattage || 0}W+</p>
              </div>
            </div>

            {evaluation.issues.length ? (
              <div aria-live="polite" className="space-y-2">
                {evaluation.issues.map((item) => (
                  <div key={item.code} className={`rounded-lg border px-3 py-2 text-xs ${item.severity === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-amber-300/50 bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300"}`}>
                    <span className="font-bold">{item.severity === "error" ? "Compatibility issue: " : "Check: "}</span>{item.message}
                  </div>
                ))}
              </div>
            ) : selectedProducts.length ? (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-300/50 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> No compatibility conflict detected in the selected components.
              </div>
            ) : null}

            {!evaluation.requiredComplete ? (
              <p className="text-center text-xs text-muted-foreground">Select every required component to add the build to your cart.</p>
            ) : null}
            <button type="button" onClick={addBuildToCart} disabled={!evaluation.canAddToCart || adding} className="pc-builder-print-hidden inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-black text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45">
              <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              {adding ? "Adding build..." : evaluation.hasErrors ? "Resolve compatibility issues" : "Add complete build to cart"}
            </button>
            <button type="button" onClick={() => window.print()} disabled={!selectedProducts.length} className="pc-builder-print-hidden inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-sm font-bold transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40">
              <Printer className="h-4 w-4" aria-hidden="true" /> Print build
            </button>
            <p className="text-[10px] leading-relaxed text-muted-foreground">Compatibility results depend on product specification data. Verify BIOS version, connectors and physical clearances before purchase.</p>
          </div>
        </div>
      </aside>

      <Dialog open={activeSlot !== null} onOpenChange={(open) => { if (!open) closePicker(); }}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-24px)] max-w-5xl flex-col gap-0 overflow-hidden p-0">
          {activeSlot ? (
            <>
              <DialogHeader className="border-b px-5 py-4 pr-12">
                <DialogTitle>Select {PC_BUILDER_SLOTS.find((slot) => slot.key === activeSlot)?.label}</DialogTitle>
                <DialogDescription>Live catalog results are searched and cursor-paginated from the server. Compatible, builder-ready options are shown by default.</DialogDescription>
              </DialogHeader>
              <div className="border-b p-4">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <span className="sr-only">Search components</span>
                  <input value={query} onChange={(event) => setQuery(event.target.value.slice(0, 80))} placeholder="Search by product, brand or specification" className="h-11 w-full rounded-xl border bg-background pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" />
                </label>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-muted-foreground">
                    <input type="checkbox" checked={compatibleOnly} onChange={(event) => setCompatibleOnly(event.target.checked)} className="h-4 w-4 rounded border" />
                    Compatible only
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {pickerLoading ? "Searching live catalog..." : `Showing ${filteredProducts.length} compatible of ${activeProducts.length} loaded`}
                  </span>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {pickerError ? (
                  <div role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {pickerError} Try changing the search or reopen this component picker.
                  </div>
                ) : null}
                {pickerLoading && activeProducts.length === 0 ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">Loading components...</div>
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
                        readinessIssues.find((item) => item.severity === "error") ??
                        candidateStatus.blockingIssues[0] ??
                        candidateStatus.warningIssues[0] ??
                        candidateStatus.deferredIssues[0];
                      return (
                        <article key={product.selectionId} className={`rounded-xl border p-3 transition ${incompatible || notBuilderReady ? "border-destructive/40" : "hover:border-primary/50"}`}>
                          <div className="flex gap-3">
                            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border bg-white">
                              <Image src={product.image || "/placeholder.svg"} alt="" fill sizes="96px" className="object-contain p-2" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{product.brand || "Component"}</p>
                              <h3 className="mt-1 line-clamp-2 text-sm font-black">{product.name}</h3>
                              {product.variantLabel ? <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{product.variantLabel}</p> : null}
                              <p className="mt-2 text-lg font-black text-primary">{money(product.price, product.currency)}</p>
                              <p className={`mt-1 text-xs font-bold ${product.stock > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>{product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}</p>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {productSpecs(product, activeSlot).map((spec) => <span key={spec} className="rounded-md bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">{spec}</span>)}
                          </div>
                          {statusIssue ? (
                            <p className={`mt-3 text-xs ${notBuilderReady || incompatible ? "text-destructive" : "text-amber-700 dark:text-amber-400"}`}>{statusIssue.message}</p>
                          ) : (
                            <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400"><Check className="h-3.5 w-3.5" aria-hidden="true" /> Compatible with current selection</p>
                          )}
                          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                            <button type="button" onClick={() => choose(activeSlot, product)} disabled={product.stock < 1 || notBuilderReady || incompatible} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40">
                              {product.stock < 1 ? "Out of stock" : notBuilderReady ? "Missing required specs" : incompatible ? "Incompatible" : "Select component"} <ChevronRight className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <Link href={`/ecommerce/products/${product.id}`} className="inline-flex h-10 items-center justify-center rounded-lg border px-3 text-xs font-bold hover:border-primary hover:text-primary">Details</Link>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-16 text-center">
                    <Search className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
                    <h3 className="mt-3 font-bold">No matching components</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{compatibleOnly ? "No compatible, builder-ready options are in the loaded pages yet." : "No live catalog products match this search."}</p>
                    {compatibleOnly ? (
                      <button type="button" onClick={() => setCompatibleOnly(false)} className="mt-4 inline-flex h-9 items-center justify-center rounded-lg border px-3 text-xs font-bold transition hover:border-primary hover:text-primary">
                        Show all components
                      </button>
                    ) : null}
                  </div>
                )}
                {pickerNextCursor ? (
                  <div className="mt-4 flex justify-center">
                    <button type="button" onClick={loadMorePicker} disabled={pickerLoading || pickerLoadingMore} className="inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-bold transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50">
                      {pickerLoadingMore ? "Loading more..." : "Load more"}
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
