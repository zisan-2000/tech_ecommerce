"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  normalizeCompareProductIds,
  PRODUCT_COMPARE_STORAGE_KEY,
  productCompareHref,
  toggleCompareProductId,
} from "@/lib/product-compare";

const COMPARE_CHANGE_EVENT = "storefront-compare-change";
const subscribers = new Set<(ids: number[]) => void>();
let listening = false;

function readCompareIds() {
  try {
    return normalizeCompareProductIds(
      JSON.parse(localStorage.getItem(PRODUCT_COMPARE_STORAGE_KEY) || "[]"),
    );
  } catch {
    return [];
  }
}

function publishCompareIds() {
  const ids = readCompareIds();
  subscribers.forEach((subscriber) => subscriber(ids));
}

function startListening() {
  if (listening) return;
  window.addEventListener("storage", publishCompareIds);
  window.addEventListener(COMPARE_CHANGE_EVENT, publishCompareIds);
  listening = true;
}

function stopListening() {
  if (!listening || subscribers.size > 0) return;
  window.removeEventListener("storage", publishCompareIds);
  window.removeEventListener(COMPARE_CHANGE_EVENT, publishCompareIds);
  listening = false;
}

export function useProductCompare() {
  const [ids, setIds] = useState<number[]>([]);

  useEffect(() => {
    const sync = (nextIds: number[]) => setIds(nextIds);
    subscribers.add(sync);
    startListening();
    setIds(readCompareIds());
    return () => {
      subscribers.delete(sync);
      stopListening();
    };
  }, []);

  const toggle = useCallback((productId: number) => {
    const result = toggleCompareProductId(readCompareIds(), productId);
    if (!result.limitReached) {
      localStorage.setItem(PRODUCT_COMPARE_STORAGE_KEY, JSON.stringify(result.ids));
      window.dispatchEvent(new Event(COMPARE_CHANGE_EVENT));
    }
    return result;
  }, []);

  const remove = useCallback((productId: number) => {
    const next = readCompareIds().filter((id) => id !== productId);
    localStorage.setItem(PRODUCT_COMPARE_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(COMPARE_CHANGE_EVENT));
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(PRODUCT_COMPARE_STORAGE_KEY);
    window.dispatchEvent(new Event(COMPARE_CHANGE_EVENT));
  }, []);

  const replace = useCallback((nextIds: number[]) => {
    const normalized = normalizeCompareProductIds(nextIds);
    localStorage.setItem(PRODUCT_COMPARE_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new Event(COMPARE_CHANGE_EVENT));
    return normalized;
  }, []);

  const href = useMemo(() => productCompareHref(ids), [ids]);

  return {
    ids,
    count: ids.length,
    href,
    isCompared: useCallback((productId: number) => ids.includes(productId), [ids]),
    toggle,
    remove,
    clear,
    replace,
  };
}
