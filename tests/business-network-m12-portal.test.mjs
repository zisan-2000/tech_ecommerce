import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const portalRoot = "app/business/(portal)";
const exactPages = [
  "page.tsx", "catalog/page.tsx", "rfqs/page.tsx", "rfqs/new/page.tsx", "rfqs/[id]/page.tsx",
  "quotations/page.tsx", "quotations/[id]/page.tsx", "purchase-orders/page.tsx", "purchase-orders/new/page.tsx",
  "purchase-orders/[id]/page.tsx", "orders/page.tsx", "orders/[id]/page.tsx", "invoices/page.tsx", "invoices/[id]/page.tsx",
  "credit/page.tsx", "credit/statement/page.tsx", "partner/page.tsx", "partner/links/page.tsx", "partner/leads/page.tsx",
  "partner/leads/new/page.tsx", "partner/leads/[id]/page.tsx", "partner/orders/page.tsx", "partner/commissions/page.tsx",
  "partner/settlements/page.tsx", "partner/settlements/[id]/page.tsx", "partner/payout-accounts/page.tsx",
  "organization/page.tsx", "organization/members/page.tsx", "organization/members/invite/page.tsx",
  "organization/branches/page.tsx", "organization/addresses/page.tsx", "organization/documents/page.tsx",
  "notifications/page.tsx", "settings/page.tsx",
];

test("M12 exposes every frozen business portal route", () => {
  for (const route of exactPages) assert.equal(existsSync(`${portalRoot}/${route}`), true, `missing ${route}`);
  assert.equal(existsSync("app/business/apply/page.tsx"), true);
  assert.equal(existsSync("app/business/apply/success/page.tsx"), true);
  assert.equal(existsSync("app/partner/apply/page.tsx"), true);
});

test("portal layout authenticates on the server and derives tenant context", () => {
  const source = readFileSync(`${portalRoot}/layout.tsx`, "utf8");
  assert.match(source, /getServerSession\(authOptions\)/);
  assert.match(source, /getBusinessContext\(\)/);
  assert.match(source, /redirect\("\/signin\?returnUrl=\/business"\)/);
  assert.match(source, /redirect\("\/business\/apply"\)/);
});

test("new read APIs enforce permission and tenant-scoped data access", () => {
  const ordersRoute = readFileSync("app/api/business/orders/route.ts", "utf8");
  const invoiceRoute = readFileSync("app/api/business/invoices/route.ts", "utf8");
  const service = readFileSync("lib/business-portal/portal-read.ts", "utf8");
  assert.match(ordersRoute, /requireBusinessPermission\("order\.read"\)/);
  assert.match(invoiceRoute, /requireBusinessPermission\("invoice\.read"\)/);
  assert.match(service, /organizationId: context\.activeMembership\.organization\.id/);
  assert.match(service, /partnerProfileId: partner\.id/);
});

test("application endpoint is rate limited, same-origin parsed, audited, and no-store", () => {
  const route = readFileSync("app/api/business/applications/route.ts", "utf8");
  const service = readFileSync("lib/business-portal/application.ts", "utf8");
  assert.match(route, /rateLimitRequest/);
  assert.match(route, /readBusinessJsonBody/);
  assert.match(route, /private, no-store/);
  assert.match(service, /requireAuthenticatedBusinessUser/);
  assert.match(service, /PENDING_VERIFICATION/);
  assert.match(service, /organizationApplicationCreated/);
});

test("payout UI never expects or renders the encrypted account number", () => {
  const resource = readFileSync("components/business-portal/BusinessResourcePage.tsx", "utf8");
  const manager = readFileSync("components/business-portal/PayoutAccountManager.tsx", "utf8");
  assert.doesNotMatch(resource, /accountNumberEncrypted/);
  assert.match(resource, /accountNumberLast4/);
  assert.match(manager, /never returned by the API/);
});

