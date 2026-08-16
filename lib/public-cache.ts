import { NextResponse } from "next/server";

const NO_STORE = "private, no-store, max-age=0";

export function isStorefrontRequest(request: Request) {
  return new URL(request.url).searchParams.get("view") === "storefront";
}

export function publicJson<T>(
  data: T,
  options: {
    status?: number;
    maxAge?: number;
    staleWhileRevalidate?: number;
  } = {},
) {
  const {
    status = 200,
    maxAge = 60,
    staleWhileRevalidate = Math.max(maxAge * 5, 300),
  } = options;
  const value = `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`;

  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": value,
      "CDN-Cache-Control": value,
      "Vercel-CDN-Cache-Control": value,
    },
  });
}

export function privateJson<T>(data: T, options: { status?: number } = {}) {
  return NextResponse.json(data, {
    status: options.status ?? 200,
    headers: { "Cache-Control": NO_STORE },
  });
}
