"use client";

import { normalizeSearchQuery } from "@/lib/search/core";

const VISITOR_KEY = "boe_vid";
const SESSION_KEY = "boe_sid";

type SearchEventName =
  | "SEARCH_SUBMITTED"
  | "SUGGESTION_CLICKED"
  | "RESULTS_VIEWED"
  | "RESULT_CLICKED"
  | "ZERO_RESULTS"
  | "FILTER_APPLIED"
  | "ADD_TO_CART"
  | "PURCHASE_COMPLETED";

type SearchEventPayload = {
  event: SearchEventName;
  query: string;
  queryId?: string | null;
  resultCount?: number | null;
  productId?: number | null;
  position?: number | null;
  filters?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getId(storage: Storage, key: string) {
  const current = storage.getItem(key);
  if (current) return current;
  const value = uuid();
  storage.setItem(key, value);
  return value;
}

export function sendSearchEvent(payload: SearchEventPayload) {
  const query = normalizeSearchQuery(payload.query);
  if (!query) return;
  let visitorId: string | null = null;
  let sessionId: string | null = null;
  try {
    visitorId = getId(localStorage, VISITOR_KEY);
    sessionId = getId(sessionStorage, SESSION_KEY);
  } catch {
    // Privacy modes may disable storage. Anonymous search analytics still work.
  }
  const body = JSON.stringify({ ...payload, query, visitorId, sessionId });
  if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
    const accepted = navigator.sendBeacon(
      "/api/search/events",
      new Blob([body], { type: "application/json" }),
    );
    if (accepted) return;
  }
  void fetch("/api/search/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
    cache: "no-store",
  }).catch(() => undefined);
}
