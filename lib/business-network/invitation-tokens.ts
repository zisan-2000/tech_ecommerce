import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function invitationTokenHashesMatch(
  leftHash: string,
  rightHash: string,
): boolean {
  const left = Buffer.from(leftHash, "hex");
  const right = Buffer.from(rightHash, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}
