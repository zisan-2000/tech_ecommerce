import type { Metadata } from "next";
import { Cpu } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import PcBuilderClient from "@/components/ecommarce/pc-builder/PcBuilderClient";
import PcBuilderSavedBuildControls from "@/components/ecommarce/pc-builder/PcBuilderSavedBuildControls";
import {
  PC_BUILDER_SLOTS,
  parseSharedBuild,
  parseSharedBuildExtraItems,
  type PcBuilderCatalog,
  type PcBuilderProduct,
  type PcBuilderSelection,
  type PcBuilderSlotKey,
} from "@/lib/pc-builder";
import { serializePcBuilderSavedSelections } from "@/lib/pc-builder-saved-build";
import { getSharedPcBuilderSavedBuild } from "@/lib/pc-builder-saved-build-store";
import { getSiteUrl } from "@/lib/seo";
import {
  getPcBuilderCatalog,
  getPcBuilderStoreBranding,
  resolvePcBuilderExtraItems,
  validatePcBuilderSelectionLive,
} from "@/lib/storefront-pc-builder";

export const metadata: Metadata = {
  title: "PC Builder — Build a Compatible Custom PC",
  description:
    "Choose compatible processors, motherboards, memory, graphics, storage, power supplies, cases and cooling for a custom desktop PC.",
  alternates: { canonical: `${getSiteUrl()}/ecommerce/pc-builder` },
};

function mergeLiveSelectionIntoCatalog(
  catalog: PcBuilderCatalog,
  selection: PcBuilderSelection,
  extraItems: Partial<Record<PcBuilderSlotKey, PcBuilderProduct[]>> = {},
): PcBuilderCatalog {
  const next = { ...catalog } as PcBuilderCatalog;
  for (const slot of PC_BUILDER_SLOTS) {
    const products = [
      ...(selection[slot.key] ? [selection[slot.key]!] : []),
      ...(extraItems[slot.key] ?? []),
    ];
    if (!products.length) continue;
    let current = catalog[slot.key] ?? [];
    for (const product of products) {
      if (!current.some((item) => item.selectionId === product.selectionId)) {
        current = [product, ...current];
      }
    }
    next[slot.key] = current;
  }
  return next;
}

export default async function PcBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ build?: string; shared?: string }>;
}) {
  const params = await searchParams;

  if (params.shared) {
    const shared = await getSharedPcBuilderSavedBuild(params.shared);
    if (shared) {
      redirect(
        `/ecommerce/pc-builder?build=${encodeURIComponent(
          serializePcBuilderSavedSelections(
            shared.build.selections,
            shared.build.extraItems,
          ),
        )}`,
      );
    }
    return (
      <main className="min-h-screen bg-muted/20">
        <div className="container px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-xl rounded-2xl border border-destructive/30 bg-card p-8 text-center shadow-sm">
            <h1 className="text-2xl font-black">Shared PC build not found</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              This share link is invalid or no longer available. No local build
              was restored over it.
            </p>
            <Link
              href="/ecommerce/pc-builder"
              className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground"
            >
              Open PC Builder
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const [data, branding] = await Promise.all([
    getPcBuilderCatalog(),
    getPcBuilderStoreBranding(),
  ]);
  let catalog = data.catalog;
  let restoreMissingSlots: string[] = [];
  let restoredExtraItems: Partial<
    Record<PcBuilderSlotKey, PcBuilderProduct[]>
  > = {};
  const requested = parseSharedBuild(params.build);
  const requestedExtras = parseSharedBuildExtraItems(params.build);
  if (
    Object.keys(requested).length > 0 ||
    Object.keys(requestedExtras).length > 0
  ) {
    const [restored, restoredExtra] = await Promise.all([
      validatePcBuilderSelectionLive(requested),
      resolvePcBuilderExtraItems(requestedExtras),
    ]);
    catalog = mergeLiveSelectionIntoCatalog(
      catalog,
      restored.selection,
      restoredExtra.items,
    );
    restoreMissingSlots = restored.missingSlots;
    restoredExtraItems = restoredExtra.items;
  }

  return (
    <main className="min-h-screen bg-[#f5f6f8] dark:bg-background">
      <section className="border-b bg-card shadow-sm">
        <div className="container flex flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 items-start gap-2 text-primary sm:items-center">
              <Cpu className="h-5 w-5 shrink-0" aria-hidden="true" />
              <h1 className="min-w-0 text-xl font-black sm:text-2xl">
                PC Builder - Build Your Own Computer
              </h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose compatible parts and create your custom desktop PC.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PcBuilderSavedBuildControls />
          </div>
        </div>
      </section>
      <div className="container px-4 py-6 sm:px-6 lg:py-8">
        {restoreMissingSlots.length > 0 ? (
          <div className="mb-5 rounded-2xl border border-amber-300/60 bg-amber-50 px-5 py-4 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
            Some saved components are no longer available:{" "}
            {restoreMissingSlots.join(", ")}. Available components were restored
            from live database data.
          </div>
        ) : null}
        <PcBuilderClient
          catalog={catalog}
          loadFailed={data.loadFailed}
          branding={{
            ...branding,
            website: `${getSiteUrl()}/ecommerce/pc-builder`,
          }}
          initialExtraItems={restoredExtraItems}
        />
      </div>
    </main>
  );
}
