import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

const frozenRoutes = [
  "app/admin/business-network/page.tsx",
  "app/admin/business-network/organizations/page.tsx",
  "app/admin/business-network/organizations/new/page.tsx",
  "app/admin/business-network/organizations/[id]/page.tsx",
  "app/admin/business-network/organizations/[id]/members/page.tsx",
  "app/admin/business-network/organizations/[id]/documents/page.tsx",
  "app/admin/business-network/organizations/[id]/capabilities/page.tsx",
  "app/admin/business-network/accounts/page.tsx",
  "app/admin/business-network/accounts/[id]/page.tsx",
  "app/admin/business-network/rfqs/page.tsx",
  "app/admin/business-network/rfqs/[id]/page.tsx",
  "app/admin/business-network/quotations/page.tsx",
  "app/admin/business-network/quotations/new/page.tsx",
  "app/admin/business-network/quotations/[id]/page.tsx",
  "app/admin/business-network/customer-pos/page.tsx",
  "app/admin/business-network/customer-pos/[id]/page.tsx",
  "app/admin/business-network/orders/page.tsx",
  "app/admin/business-network/pricing/tiers/page.tsx",
  "app/admin/business-network/pricing/tiers/[id]/page.tsx",
  "app/admin/business-network/pricing/contracts/page.tsx",
  "app/admin/business-network/credit/page.tsx",
  "app/admin/business-network/credit/[id]/page.tsx",
  "app/admin/business-network/partners/page.tsx",
  "app/admin/business-network/partners/[id]/page.tsx",
  "app/admin/business-network/agreements/page.tsx",
  "app/admin/business-network/agreements/[id]/page.tsx",
  "app/admin/business-network/leads/page.tsx",
  "app/admin/business-network/leads/[id]/page.tsx",
  "app/admin/business-network/commission/plans/page.tsx",
  "app/admin/business-network/commission/plans/[id]/page.tsx",
  "app/admin/business-network/commission/ledger/page.tsx",
  "app/admin/business-network/settlements/page.tsx",
  "app/admin/business-network/settlements/[id]/page.tsx",
  "app/admin/business-network/payout-accounts/page.tsx",
  "app/admin/business-network/risk/page.tsx",
  "app/admin/business-network/disputes/page.tsx",
  "app/admin/business-network/audit/page.tsx",
  "app/admin/business-network/reports/page.tsx",
];

test("M13 implements every frozen admin Business Network route", () => {
  for (const route of frozenRoutes) assert.equal(existsSync(path.join(root, route)), true, `Missing ${route}`);
});

test("M13 shared admin workspace has live filtering, pagination, detail rendering and audited actions", async () => {
  const [list, detail, rowActions, config] = await Promise.all([
    read("components/admin/business-network/ResourceList.tsx"),
    read("components/admin/business-network/ResourceDetail.tsx"),
    read("components/admin/business-network/RowActions.tsx"),
    read("components/admin/business-network/config.ts"),
  ]);
  assert.match(list, /URLSearchParams/);
  assert.match(list, /AbortController/);
  assert.match(list, /status.*ALL/s);
  assert.match(list, /pagination\.page/);
  assert.match(detail, /permissions\.has\(action\.permission\)/);
  assert.match(detail, /method: "POST"/);
  assert.match(rowActions, /Confirm this audited workflow action/);
  for (const key of ["organizations", "accounts", "rfqs", "quotations", "customer-pos", "credit", "partners", "agreements", "leads", "commission-ledger", "settlements", "payout-accounts", "audit"]) assert.match(config, new RegExp(`(?:\\"|\\b)${key.replaceAll("-", "\\-")}`));
});

test("M13 organization administration is server-authorized, validated and audited", async () => {
  const [route, service, schemas, audit] = await Promise.all([
    read("app/api/admin/business-network/organizations/route.ts"),
    read("lib/business-network/admin-organizations.ts"),
    read("lib/business-network/admin-organization-schemas.ts"),
    read("lib/business-network/audit.ts"),
  ]);
  assert.match(route, /requireBusinessNetworkAdminPermission\("business\.account\.manage"\)/);
  assert.match(route, /createAdminOrganizationSchema\.parse/);
  assert.match(service, /runSerializableTransaction/);
  assert.match(service, /INVALID_ORGANIZATION_TRANSITION/);
  assert.match(service, /writeBusinessAudit/);
  assert.match(schemas, /\.strict\(\)/);
  assert.match(audit, /organizationDocumentVerified/);
});

test("M13 governance APIs expose masked evidence without payout secrets", async () => {
  const [insights, payoutRoute] = await Promise.all([
    read("lib/business-network/admin-insights.ts"),
    read("app/api/admin/business-network/payout-accounts/route.ts"),
  ]);
  assert.match(insights, /businessAuditLog\.findMany/);
  assert.match(insights, /ipHash: item\.ipHash \?/);
  assert.doesNotMatch(insights, /accountNumberEncrypted/);
  assert.match(payoutRoute, /partner\.payout_account\.view/);
});

test("M13 navigation is permission-aware and keeps Business Network separate from SCM", async () => {
  const sidebar = await read("components/admin/Sidebar.tsx");
  assert.match(sidebar, /name: "Business Network"/);
  assert.match(sidebar, /href: "\/admin\/business-network"/);
  assert.match(sidebar, /business\.account\.view/);
  assert.match(sidebar, /partner\.settlement\.view/);
  assert.match(sidebar, /name: "SCM"[\s\S]*name: "Business Network"[\s\S]*name: "Investors"/);
});

test("M13 create screens submit structured organization and quotation payloads", async () => {
  const [organization, quotation] = await Promise.all([
    read("components/admin/business-network/OrganizationForm.tsx"),
    read("components/admin/business-network/QuotationForm.tsx"),
  ]);
  assert.match(organization, /capabilities/);
  assert.match(organization, /\/api\/admin\/business-network\/organizations/);
  assert.match(quotation, /items: lines\.map/);
  assert.match(quotation, /\/api\/admin\/business-network\/quotations/);
  assert.doesNotMatch(quotation, /JSON\.parse\(.*textarea/s);
});
