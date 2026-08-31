import "server-only";

import { BusinessNetworkError } from "./business-error";
import { isTrustedBusinessMutationOrigin } from "./request-origin";

const MAX_BUSINESS_JSON_BYTES = 16 * 1024;

export function assertSameOriginBusinessMutation(request: Request): void {
  if (!isTrustedBusinessMutationOrigin(request)) {
    throw new BusinessNetworkError(
      403,
      "CROSS_ORIGIN_REQUEST_REJECTED",
      "Cross-origin business mutations are not allowed.",
    );
  }
}

export async function readBusinessJsonBody(request: Request): Promise<unknown> {
  assertSameOriginBusinessMutation(request);
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.startsWith("application/json")) {
    throw new BusinessNetworkError(
      422,
      "JSON_CONTENT_TYPE_REQUIRED",
      "Content-Type must be application/json.",
    );
  }
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BUSINESS_JSON_BYTES) {
    throw new BusinessNetworkError(422, "REQUEST_TOO_LARGE", "Request body is too large.");
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BUSINESS_JSON_BYTES) {
    throw new BusinessNetworkError(422, "REQUEST_TOO_LARGE", "Request body is too large.");
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new BusinessNetworkError(422, "INVALID_JSON", "Request body must be valid JSON.");
  }
}
