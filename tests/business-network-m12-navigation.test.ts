import assert from "node:assert/strict";
import test from "node:test";
import { isPortalNavigationItemVisible } from "../lib/business-portal/navigation";

const item = { label: "Leads", href: "/business/partner/leads", icon: (() => null) as never, permission: "partner.leads.read" as const, partner: true };

test("partner navigation requires both permission and a partner capability", () => {
  assert.equal(isPortalNavigationItemVisible({ item, permissions: ["partner.leads.read"], capabilities: ["AFFILIATE"] }), true);
  assert.equal(isPortalNavigationItemVisible({ item, permissions: ["partner.leads.read"], capabilities: ["CORPORATE_BUYER"] }), false);
  assert.equal(isPortalNavigationItemVisible({ item, permissions: [], capabilities: ["AFFILIATE"] }), false);
});

test("organization navigation is permission-driven without a commerce capability", () => {
  const organizationItem = { label: "Members", href: "/business/organization/members", icon: (() => null) as never, permission: "organization.members.read" as const };
  assert.equal(isPortalNavigationItemVisible({ item: organizationItem, permissions: ["organization.members.read"], capabilities: [] }), true);
});

