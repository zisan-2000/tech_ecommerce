import Link from "next/link";
import { PackageSearch } from "lucide-react";

export default function ProductNotFound() {
  return (
    <main className="container flex min-h-[60vh] items-center justify-center px-4 py-16 text-center">
      <div className="max-w-lg rounded-3xl border bg-card p-8 shadow-sm">
        <PackageSearch className="mx-auto h-12 w-12 text-primary" />
        <h1 className="mt-4 text-2xl font-black">Product not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">This product may be unavailable or the link may be incorrect.</p>
        <Link href="/ecommerce/products" className="mt-6 inline-flex h-11 items-center rounded-xl bg-primary px-5 font-bold text-primary-foreground">Browse available products</Link>
      </div>
    </main>
  );
}
