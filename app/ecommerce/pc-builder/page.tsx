import type { Metadata } from "next";
import { CheckCircle2, Cpu, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import PcBuilderClient from "@/components/ecommarce/pc-builder/PcBuilderClient";
import PcBuilderSavedBuildControls from "@/components/ecommarce/pc-builder/PcBuilderSavedBuildControls";
import {
  PC_BUILDER_SLOTS,
  parseSharedBuild,
  type PcBuilderCatalog,
  type PcBuilderSelection,
} from "@/lib/pc-builder";
import { serializePcBuilderSavedSelections } from "@/lib/pc-builder-saved-build";
import { getSharedPcBuilderSavedBuild } from "@/lib/pc-builder-saved-build-store";
import { getSiteUrl } from "@/lib/seo";
import { getPcBuilderCatalog, validatePcBuilderSelectionLive } from "@/lib/storefront-pc-builder";

export const metadata: Metadata = {
  title: "PC Builder — Build a Compatible Custom PC",
  description: "Choose compatible processors, motherboards, memory, graphics, storage, power supplies, cases and cooling for a custom desktop PC.",
  alternates: { canonical: `${getSiteUrl()}/ecommerce/pc-builder` },
};

function mergeLiveSelectionIntoCatalog(catalog: PcBuilderCatalog, selection: PcBuilderSelection): PcBuilderCatalog {
  const next = { ...catalog } as PcBuilderCatalog;
  for (const slot of PC_BUILDER_SLOTS) {
    const product = selection[slot.key];
    if (!product) continue;
    const current = catalog[slot.key] ?? [];
    next[slot.key] = current.some((item) => item.selectionId === product.selectionId) ? current : [product, ...current];
  }
  return next;
}

export default async function PcBuilderPage({ searchParams }: { searchParams: Promise<{ build?: string; shared?: string }> }) {
  const params = await searchParams;

  if (params.shared) {
    const shared = await getSharedPcBuilderSavedBuild(params.shared);
    if (shared) {
      redirect(`/ecommerce/pc-builder?build=${encodeURIComponent(serializePcBuilderSavedSelections(shared.build.selections))}`);
    }
    return (
      <main className="min-h-screen bg-muted/20">
        <div className="container px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-xl rounded-2xl border border-destructive/30 bg-card p-8 text-center shadow-sm">
            <h1 className="text-2xl font-black">Shared PC build not found</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">This share link is invalid or no longer available. No local build was restored over it.</p>
            <Link href="/ecommerce/pc-builder" className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground">Open PC Builder</Link>
          </div>
        </div>
      </main>
    );
  }

  const data = await getPcBuilderCatalog();
  let catalog = data.catalog;
  let restoreMissingSlots: string[] = [];
  const requested = parseSharedBuild(params.build);
  if (Object.keys(requested).length > 0) {
    const restored = await validatePcBuilderSelectionLive(requested);
    catalog = mergeLiveSelectionIntoCatalog(catalog, restored.selection);
    restoreMissingSlots = restored.missingSlots;
  }

  return (
    <main className="min-h-screen bg-muted/20">
      <section className="border-b bg-card">
        <div className="container px-4 py-10 sm:px-6 lg:py-14">
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-primary"><Cpu className="h-4 w-4" aria-hidden="true" /> Custom PC Builder</div>
              <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">Build your PC with compatibility confidence</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">Select each component, see compatibility conflicts instantly and add the complete stock-checked build to your cart in one action.</p>
              <div className="mt-5 flex flex-wrap gap-2"><PcBuilderSavedBuildControls /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {[
                [ShieldCheck, "Compatibility checks", "Socket, memory, power and physical clearance"],
                [Zap, "Power estimate", "Recommended PSU capacity with safety headroom"],
                [CheckCircle2, "Stock aware", "Only available variants can be selected and added"],
              ].map(([Icon, title, description]) => {
                const FeatureIcon = Icon as typeof ShieldCheck;
                return <div key={String(title)} className="flex items-start gap-3 rounded-xl border bg-background/70 p-3.5"><FeatureIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><div><p className="text-sm font-bold">{String(title)}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{String(description)}</p></div></div>;
              })}
            </div>
          </div>
        </div>
      </section>
      <div className="container px-4 py-8 sm:px-6 lg:py-10">
        {restoreMissingSlots.length > 0 ? <div className="mb-5 rounded-2xl border border-amber-300/60 bg-amber-50 px-5 py-4 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">Some saved components are no longer available: {restoreMissingSlots.join(", ")}. Available components were restored from live database data.</div> : null}
        <PcBuilderClient catalog={catalog} loadFailed={data.loadFailed} />
      </div>
    </main>
  );
}
