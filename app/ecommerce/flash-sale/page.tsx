import Link from "next/link";
import { ArrowLeft, Flame } from "lucide-react";
import { FlashSaleCard } from "@/components/ecommarce/FlashSale";
import { getActiveFlashSaleProducts } from "@/lib/storefront-flash-sale";

export const metadata = {
  title: "Flash Sale",
  description: "Limited-time technology deals at special prices.",
};

export default async function FlashSalePage() {
  const products = await getActiveFlashSaleProducts();
  return (
    <main className="min-h-[70vh] bg-slate-50 px-4 py-10 dark:bg-slate-900/40 sm:px-6">
      <div className="mx-auto max-w-[1600px]">
        <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-orange-600"><ArrowLeft className="h-4 w-4" /> Back to home</Link>
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 text-white shadow-lg shadow-orange-500/20"><Flame className="h-7 w-7 fill-current" /></span>
          <div><h1 className="text-3xl font-black tracking-tight sm:text-4xl">Flash Sale</h1><p className="text-muted-foreground">Every price and timer is updated from the live sale schedule.</p></div>
        </div>
        {products.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{products.map((product) => <FlashSaleCard key={product.id} product={product} />)}</div>
        ) : (
          <div className="rounded-3xl border border-dashed bg-background px-6 py-20 text-center"><h2 className="text-xl font-bold">No live flash deals right now</h2><p className="mt-2 text-muted-foreground">New limited-time offers will appear here automatically.</p><Link href="/ecommerce/products" className="mt-6 inline-flex rounded-lg bg-orange-600 px-5 py-3 font-bold text-white hover:bg-orange-700">Browse products</Link></div>
        )}
      </div>
    </main>
  );
}
