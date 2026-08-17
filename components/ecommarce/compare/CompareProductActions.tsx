"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useProductCompare } from "@/hooks/use-product-compare";
import { productCompareHref } from "@/lib/product-compare";

export default function CompareProductActions({
  productId,
  comparedIds,
}: {
  productId: number;
  comparedIds: number[];
}) {
  const router = useRouter();
  const compare = useProductCompare();

  const remove = () => {
    compare.remove(productId);
    router.replace(productCompareHref(comparedIds.filter((id) => id !== productId)));
  };

  return (
    <button
      type="button"
      onClick={remove}
      className="inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-xs font-bold hover:border-destructive hover:text-destructive"
      aria-label="Remove product from comparison"
    >
      <X className="h-4 w-4" /> Remove
    </button>
  );
}
