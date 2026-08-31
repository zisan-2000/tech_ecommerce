import "server-only";

import { timingSafeEqual } from "node:crypto";

function matchesSecret(candidate: string | null, secret: string): boolean {
  if (!candidate) return false;
  const actual = Buffer.from(candidate, "utf8");
  const expected = Buffer.from(secret, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isAuthorizedBusinessCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  if (process.env.NODE_ENV === "production" && secret.length < 32) return false;
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  return matchesSecret(bearer, secret) || matchesSecret(request.headers.get("x-cron-secret"), secret);
}
