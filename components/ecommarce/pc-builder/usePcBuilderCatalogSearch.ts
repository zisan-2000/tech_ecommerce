"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PcBuilderProduct, PcBuilderSlotKey } from "@/lib/pc-builder";
import type { PcBuilderCatalogPageResponse } from "@/lib/pc-builder-catalog";

function mergeProducts(current: PcBuilderProduct[], incoming: PcBuilderProduct[]) {
  const byId = new Map(current.map((product) => [product.selectionId, product]));
  for (const product of incoming) byId.set(product.selectionId, product);
  return [...byId.values()];
}

export function usePcBuilderCatalogSearch({
  slot,
  query,
  seed,
}: {
  slot: PcBuilderSlotKey | null;
  query: string;
  seed: PcBuilderProduct[];
}) {
  const [products, setProducts] = useState<PcBuilderProduct[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const fetchPage = useCallback(
    async (page: number, append: boolean, signal?: AbortSignal) => {
      if (!slot) return;
      const requestId = ++requestSequence.current;
      append ? setLoadingMore(true) : setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          slot,
          page: String(page),
          limit: "12",
        });
        const normalizedQuery = query.trim();
        if (normalizedQuery) params.set("q", normalizedQuery);

        const response = await fetch(`/api/pc-builder/catalog?${params.toString()}`, {
          cache: "no-store",
          signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | PcBuilderCatalogPageResponse
          | { error?: string }
          | null;
        if (!response.ok || !payload || !("items" in payload)) {
          throw new Error(
            (payload && "error" in payload && payload.error) ||
              "Components could not be loaded.",
          );
        }
        if (requestId !== requestSequence.current) return;

        setProducts((current) =>
          append ? mergeProducts(current, payload.items) : payload.items,
        );
        setNextPage(payload.nextPage);
      } catch (caught) {
        if (signal?.aborted || requestId !== requestSequence.current) return;
        setError(caught instanceof Error ? caught.message : "Components could not be loaded.");
      } finally {
        if (requestId === requestSequence.current) {
          append ? setLoadingMore(false) : setLoading(false);
        }
      }
    },
    [query, slot],
  );

  useEffect(() => {
    requestSequence.current += 1;
    if (!slot) {
      setProducts([]);
      setNextPage(null);
      setError(null);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    setProducts(query.trim() ? [] : seed);
    setNextPage(null);
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => void fetchPage(1, false, controller.signal),
      query.trim() ? 250 : 0,
    );

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fetchPage, query, seed, slot]);

  const loadMore = useCallback(() => {
    if (!slot || !nextPage || loading || loadingMore) return;
    void fetchPage(nextPage, true);
  }, [fetchPage, loading, loadingMore, nextPage, slot]);

  return {
    products,
    nextPage,
    loading,
    loadingMore,
    error,
    loadMore,
  };
}
