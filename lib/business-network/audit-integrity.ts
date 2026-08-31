import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { BusinessNetworkError } from "./errors";
import { resolveBusinessSecuritySecret } from "./security-secrets";

function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function expectedHash(nonce: string, payload: unknown) {
  const secret = resolveBusinessSecuritySecret(
    ["BUSINESS_AUDIT_INTEGRITY_SECRET", "BUSINESS_AUDIT_IP_SECRET", "NEXTAUTH_SECRET"],
    "development-business-audit-integrity-key",
  );
  return createHmac("sha256", secret).update(`${nonce}:${stableJson(payload)}`, "utf8").digest("hex");
}

export async function verifyBusinessAuditLogIntegrity(id: bigint) {
  const row = await db.businessAuditLog.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
      memberId: true,
      actorUserId: true,
      action: true,
      entityType: true,
      entityId: true,
      before: true,
      after: true,
      ipHash: true,
      userAgent: true,
      integrityNonce: true,
      integrityHash: true,
      integrityVersion: true,
      createdAt: true,
    },
  });
  if (!row) throw new BusinessNetworkError(404, "BUSINESS_AUDIT_NOT_FOUND", "Business audit entry not found.");
  if (row.integrityNonce.startsWith("legacy-")) {
    return { id: row.id.toString(), status: "LEGACY_SEALED" as const, valid: true, integrityVersion: row.integrityVersion, createdAt: row.createdAt };
  }
  const expected = expectedHash(row.integrityNonce, {
    organizationId: row.organizationId,
    memberId: row.memberId,
    actorUserId: row.actorUserId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    before: row.before,
    after: row.after,
    ipHash: row.ipHash,
    userAgent: row.userAgent,
  });
  const actualBuffer = Buffer.from(row.integrityHash, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const valid = actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  return { id: row.id.toString(), status: valid ? "VERIFIED" as const : "TAMPERED" as const, valid, integrityVersion: row.integrityVersion, createdAt: row.createdAt };
}
