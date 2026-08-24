import { NextRequest } from "next/server";

/**
 * Rebuild a Route Handler request after its body has been consumed.
 *
 * Passing request.clone() into the NextRequest constructor is unsafe across
 * the Web Request implementations used by Next.js/Turbopack. Reconstructing
 * from primitives avoids private-field brand errors while preserving the
 * request metadata needed by delegated handlers.
 */
export function replayNextRequest(
  request: NextRequest,
  rawBody: string,
): NextRequest {
  const headers = new Headers(request.headers);
  headers.delete("content-length");

  return new NextRequest(request.url, {
    method: request.method,
    headers,
    body: rawBody || undefined,
  });
}
