"use client";

import { useEffect } from "react";
import { sendSearchEvent } from "@/lib/search/client-analytics";

export default function SearchResultsTelemetry({
  query,
  resultCount,
  filters,
}: {
  query: string;
  resultCount: number;
  filters?: Record<string, unknown>;
}) {
  useEffect(() => {
    if (!query.trim()) return;
    sendSearchEvent({
      event: resultCount > 0 ? "RESULTS_VIEWED" : "ZERO_RESULTS",
      query,
      resultCount,
      filters,
    });
  }, [filters, query, resultCount]);

  return null;
}
