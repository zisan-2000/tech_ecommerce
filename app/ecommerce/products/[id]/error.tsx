"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ProductDetailError({ reset }: { reset: () => void }) {
  return (
    <main className="container flex min-h-[60vh] items-center justify-center px-4 py-16 text-center">
      <div className="max-w-lg rounded-3xl border bg-card p-8 shadow-sm">
        <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
        <h1 className="mt-4 text-2xl font-black">Product details could not be loaded</h1>
        <p className="mt-2 text-sm text-muted-foreground">Please retry the request or return to the product catalog.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 font-bold text-primary-foreground">
            <RotateCcw className="h-4 w-4" /> Retry
          </button>
          <Link href="/ecommerce/products" className="inline-flex h-11 items-center rounded-xl border px-5 font-bold">Browse products</Link>
        </div>
      </div>
    </main>
  );
}
