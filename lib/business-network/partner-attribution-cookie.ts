import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { BusinessNetworkError } from "./business-error";

export const PARTNER_ATTRIBUTION_COOKIE = "partner_attribution";

export type AttributionCookieClaim = {
  v: 1;
  attributionId: string;
  issuedAt: number;
  expiresAt: number;
};

function attributionSecret(): string {
  const secret = process.env.PARTNER_ATTRIBUTION_SECRET
    || process.env.AUTH_SECRET
    || process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new BusinessNetworkError(
      503,
      "PARTNER_ATTRIBUTION_SIGNING_UNAVAILABLE",
      "Partner attribution signing is not configured.",
    );
  }
  return secret;
}

function signature(encodedPayload: string): string {
  return createHmac("sha256", attributionSecret()).update(encodedPayload, "utf8").digest("base64url");
}

export function createPartnerAttributionCookie(
  attributionId: string,
  capturedAt: Date,
  expiresAt: Date,
): string {
  const claim: AttributionCookieClaim = {
    v: 1,
    attributionId,
    issuedAt: Math.floor(capturedAt.getTime() / 1_000),
    expiresAt: Math.floor(expiresAt.getTime() / 1_000),
  };
  const payload = Buffer.from(JSON.stringify(claim), "utf8").toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function parsePartnerAttributionCookie(
  value: string | null | undefined,
  now = new Date(),
): AttributionCookieClaim | null {
  if (!value || value.length > 1_024) return null;
  const parts = value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  let expected: string;
  try {
    expected = signature(parts[0]);
  } catch {
    return null;
  }
  const actualBuffer = Buffer.from(parts[1], "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Partial<AttributionCookieClaim>;
    const nowSeconds = Math.floor(now.getTime() / 1_000);
    if (
      parsed.v !== 1
      || typeof parsed.attributionId !== "string"
      || parsed.attributionId.length < 8
      || parsed.attributionId.length > 64
      || !Number.isSafeInteger(parsed.issuedAt)
      || !Number.isSafeInteger(parsed.expiresAt)
      || (parsed.issuedAt as number) > nowSeconds + 60
      || (parsed.expiresAt as number) <= nowSeconds
      || (parsed.expiresAt as number) <= (parsed.issuedAt as number)
    ) return null;
    return parsed as AttributionCookieClaim;
  } catch {
    return null;
  }
}

export function hashPartnerAttributionFingerprint(value: string): string {
  return createHmac("sha256", attributionSecret()).update(value, "utf8").digest("hex");
}

export function partnerAttributionCookieOptions(expiresAt: Date) {
  const maxAge = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1_000));
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
    expires: expiresAt,
  };
}

export const clearPartnerAttributionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 0,
};
