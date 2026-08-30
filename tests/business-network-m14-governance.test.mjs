import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { notificationPreferencesSchema } from "../lib/business-network/notification-schemas.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("M14 adds the frozen fraud, risk, notification, and audit-integrity database contracts", async () => {
  const [schema, migration] = await Promise.all([
    read("prisma/schema.prisma"),
    read("prisma/migrations/20260830_m14_fraud_audit_notifications/migration.sql"),
  ]);
  for (const name of ["BusinessFraudRuleType", "BusinessRiskSeverity", "BusinessRiskCaseStatus", "BusinessNotificationCategory", "BusinessNotificationDeliveryStatus"]) assert.match(schema, new RegExp(`enum ${name}\\s*\\{`));
  for (const model of ["BusinessFraudRule", "BusinessRiskCase", "BusinessNotification", "BusinessNotificationDelivery", "BusinessNotificationPreference"]) {
    assert.match(schema, new RegExp(`model ${model}\\s*\\{`));
    assert.match(migration, new RegExp(`CREATE TABLE "${model}"`));
  }
  assert.match(schema, /model BusinessAuditLog\s*\{[\s\S]*integrityNonce[\s\S]*integrityHash[\s\S]*integrityVersion/s);
  assert.match(migration, /BusinessAuditLog_immutable/);
  assert.match(migration, /BusinessRiskCase_resolution_check/);
  assert.match(migration, /BusinessNotificationDelivery_state_check/);
});

test("M14 seeds all twelve frozen fraud signals and deduplicates privacy-safe evidence", async () => {
  const [migration, fraud] = await Promise.all([
    read("prisma/migrations/20260830_m14_fraud_audit_notifications/migration.sql"),
    read("lib/business-network/fraud.ts"),
  ]);
  for (const rule of ["SELF_REFERRAL", "DUPLICATE_LEAD", "REPEATED_CANCELLED_REFERRALS", "REPEATED_REFUND_REFERRALS", "SAME_ORGANIZATION", "SAME_USER", "SAME_PHONE", "SAME_EMAIL", "SUSPICIOUS_IP", "SUSPICIOUS_DEVICE", "UNUSUAL_CONVERSION_RATE", "COMMISSION_SPIKE"]) {
    assert.match(migration, new RegExp(`'${rule}'`));
    assert.match(fraud, new RegExp(`"${rule}"`));
  }
  assert.match(fraud, /fingerprint = sha256/);
  assert.match(fraud, /identityHash: sha256/);
  assert.match(fraud, /ipHash: `\$\{ipHash\.slice\(0, 12\)\}…`/);
  assert.match(fraud, /runSerializableTransaction/);
  assert.match(fraud, /riskCaseDetected/);
});

test("M14 hardens every new governance mutation with RBAC, same-origin checks, validation, and immutable audit", async () => {
  const [rbac, riskRoute, notificationService, audit, integrityRoute] = await Promise.all([
    read("lib/rbac-config.ts"),
    read("app/api/admin/business-network/risk/[id]/route.ts"),
    read("lib/business-network/notifications.ts"),
    read("lib/business-network/audit.ts"),
    read("app/api/admin/business-network/audit/[id]/integrity/route.ts"),
  ]);
  assert.match(rbac, /business\.audit\.view/);
  assert.match(rbac, /business\.report\.view/);
  assert.match(riskRoute, /requireAnyBusinessNetworkAdminPermission/);
  assert.match(riskRoute, /readBusinessJsonBody/);
  assert.match(notificationService, /requireBusinessContext/);
  assert.match(notificationService, /notificationPreferencesSchema\.parse/);
  assert.match(notificationService, /writeBusinessAudit/);
  assert.match(audit, /createHmac\("sha256"/);
  assert.match(audit, /integrityNonce/);
  assert.match(integrityRoute, /business\.audit\.view/);
});

test("M14 publishes in-app notifications and runs a retryable, claim-safe email outbox", async () => {
  const [core, delivery, cronAuth] = await Promise.all([
    read("lib/business-network/notification-core.ts"),
    read("lib/business-network/notification-delivery.ts"),
    read("lib/business-network/cron-authorization.ts"),
  ]);
  assert.match(core, /dedupeKey/);
  assert.match(core, /notificationPreference/);
  assert.match(core, /deliveries:/);
  assert.match(delivery, /status: \{ in: \["QUEUED", "FAILED"\] \}/);
  assert.match(delivery, /updateMany/);
  assert.match(delivery, /status: "PROCESSING"/);
  assert.match(delivery, /2 \*\* attempts \* 5/);
  assert.doesNotMatch(delivery, /lastError(?:Message|Stack)/);
  assert.match(cronAuth, /CRON_SECRET/);
  for (const route of ["app/api/cron/business-network/fraud-scan/route.ts", "app/api/cron/business-network/notifications/route.ts"]) assert.equal(existsSync(path.join(root, route)), true);
});

test("M14 replaces placeholders with responsive notification and fraud-review workspaces", async () => {
  const [notifications, risk, shell, notificationPage, riskPage] = await Promise.all([
    read("components/business-portal/NotificationCenter.tsx"),
    read("components/admin/business-network/RiskReview.tsx"),
    read("components/business-portal/PortalShell.tsx"),
    read("app/business/(portal)/notifications/page.tsx"),
    read("app/admin/business-network/risk/page.tsx"),
  ]);
  assert.match(notifications, /Mark all read/);
  assert.match(notifications, /Email delivery preferences/);
  assert.match(notifications, /aria-label="Notification read state"/);
  assert.match(risk, /Fraud & Risk Review/);
  assert.match(risk, /Confirm risk/);
  assert.match(risk, /Review evidence/);
  assert.match(shell, /unreadNotifications/);
  assert.match(notificationPage, /NotificationCenter/);
  assert.match(riskPage, /RiskReview/);
});

test("M14 notification preference validation is closed and rejects partial or unknown input", () => {
  const valid = { emailEnabled: true, organizationEmail: true, salesEmail: true, financeEmail: false, partnershipEmail: true, securityEmail: true };
  assert.equal(notificationPreferencesSchema.safeParse(valid).success, true);
  assert.equal(notificationPreferencesSchema.safeParse({ ...valid, unexpected: true }).success, false);
  assert.equal(notificationPreferencesSchema.safeParse({ emailEnabled: true }).success, false);
});

