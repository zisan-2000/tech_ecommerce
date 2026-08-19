import type { Metadata } from "next";
import { CheckCircle2, Cpu, ShieldCheck, Zap } from "lucide-react";
import PcBuilderClient from "@/components/ecommarce/pc-builder/PcBuilderClient";
import { getSiteUrl } from "@/lib/seo";
import { getPcBuilderCatalog } from "@/lib/storefront-pc-builder";

export const metadata: Metadata = {
  title: "PC Builder — Build a Compatible Custom PC",
  description:
    "Choose compatible processors, motherboards, memory, graphics, storage, power supplies, cases and cooling for a custom desktop PC.",
  alternates: { canonical: `${getSiteUrl()}/ecommerce/pc-builder` },
};

export default async function PcBuilderPage() {
  const data = await getPcBuilderCatalog();

  return (
    <main className="min-h-screen bg-muted/20">
      <section className="border-b bg-card">
        <div className="container px-4 py-10 sm:px-6 lg:py-14">
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-primary">
                <Cpu className="h-4 w-4" aria-hidden="true" /> Custom PC Builder
              </div>
              <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                Build your PC with compatibility confidence
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                Select each component, see compatibility conflicts instantly and add the complete stock-checked build to your cart in one action.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {[
                [ShieldCheck, "Compatibility checks", "Socket, memory, power and physical clearance"],
                [Zap, "Power estimate", "Recommended PSU capacity with safety headroom"],
                [CheckCircle2, "Stock aware", "Only available variants can be selected and added"],
              ].map(([Icon, title, description]) => {
                const FeatureIcon = Icon as typeof ShieldCheck;
                return (
                  <div key={String(title)} className="flex items-start gap-3 rounded-xl border bg-background/70 p-3.5">
                    <FeatureIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-bold">{String(title)}</p>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{String(description)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="container px-4 py-8 sm:px-6 lg:py-10">
        <PcBuilderClient catalog={data.catalog} loadFailed={data.loadFailed} />
      </div>
    </main>
  );
}
