import "dotenv/config";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after } from "node:test";
import { assertCommissionEntryTransition } from "../../lib/business-network/commission-core.ts";
import { assertCustomerPoTransition } from "../../lib/business-network/customer-po-core.ts";
import { assertPartnerAttributionTransition } from "../../lib/business-network/partner-referral-core.ts";
import { assertSalesQuotationTransition } from "../../lib/business-network/sales-quotation-core.ts";
import { assertSalesRfqTransition } from "../../lib/business-network/sales-rfq-core.ts";
import { assertPartnerSettlementTransition } from "../../lib/business-network/settlement-core.ts";

const require = createRequire(import.meta.url);
const { Prisma, PrismaClient } = require("../../generated/prisma");
const {
  CommissionStatus,
  CustomerPurchaseOrderStatus,
  PartnerAttributionStatus,
  PartnerSettlementStatus,
  SalesQuotationStatus,
  SalesRfqStatus,
} = require("../../generated/prisma");
const prisma = new PrismaClient();

after(async () => {
  await prisma.$disconnect();
});

const milestoneMigrations = [
  "20260825_add_business_network_organization_core",
  "20260826_add_organization_member_user_fk",
  "20260826_m3_business_account_pricing_engine",
  "20260826_m4_corporate_credit",
  "20260826_m5_sales_rfq",
  "20260826_m6_sales_quotation",
  "20260826_m7_customer_po_order_integration",
  "20260827_m8_partner_profile_agreement",
  "20260827_m9_referral_attribution_leads",
  "20260830_m10_commission_engine_ledger",
  "20260830_m11_partner_settlement_payout",
  "20260830_m14_fraud_audit_notifications",
];

const businessTables = [
  "Organization",
  "OrganizationMember",
  "BusinessAccount",
  "SalesRfq",
  "SalesQuotation",
  "CustomerPurchaseOrder",
  "PartnerProfile",
  "PartnerAttribution",
  "CommissionEntry",
  "PartnerSettlement",
  "BusinessAuditLog",
  "BusinessRiskCase",
  "BusinessNotification",
];

test("M15 integration composes the frozen corporate-to-partner settlement happy path", () => {
  const transitions = [
    [assertSalesRfqTransition, SalesRfqStatus, ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "QUOTED", "CLOSED"]],
    [assertSalesQuotationTransition, SalesQuotationStatus, ["DRAFT", "INTERNAL_REVIEW", "SENT", "VIEWED", "ACCEPTED"]],
    [assertCustomerPoTransition, CustomerPurchaseOrderStatus, ["SUBMITTED", "UNDER_REVIEW", "VERIFIED", "CONVERTED"]],
    [assertPartnerAttributionTransition, PartnerAttributionStatus, ["ACTIVE", "CONVERTED"]],
    [assertCommissionEntryTransition, CommissionStatus, ["PENDING", "HOLD", "APPROVED", "PAYABLE", "PAID"]],
    [assertPartnerSettlementTransition, PartnerSettlementStatus, ["DRAFT", "SUBMITTED", "APPROVED", "PROCESSING", "PAID"]],
  ];

  for (const [assertTransition, states, path] of transitions) {
    for (let index = 1; index < path.length; index += 1) {
      assert.doesNotThrow(() => assertTransition(states[path[index - 1]], states[path[index]]));
    }
  }
});

test("M15 integration database contains every persisted milestone contract", async () => {
  const [migrations, tables] = await Promise.all([
    prisma.$queryRaw(Prisma.sql`
      SELECT migration_name AS name FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
        AND migration_name IN (${Prisma.join(milestoneMigrations)})
    `),
    prisma.$queryRaw(Prisma.sql`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN (${Prisma.join(businessTables)})
    `),
  ]);
  assert.deepEqual(new Set(migrations.map((row) => row.name)), new Set(milestoneMigrations));
  assert.deepEqual(new Set(tables.map((row) => row.name)), new Set(businessTables));
});

test("M15 integration keeps corporate and affiliate commerce on the canonical Order aggregate", async () => {
  const foreignKeys = await prisma.$queryRaw`
    SELECT tc.table_name AS "tableName", kcu.column_name AS "columnName", ccu.table_name AS "foreignTable"
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.constraint_schema = kcu.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ((tc.table_name = 'CustomerPurchaseOrder' AND kcu.column_name = 'orderId')
        OR (tc.table_name = 'PartnerAttribution' AND kcu.column_name = 'orderId')
        OR (tc.table_name = 'CommissionEntry' AND kcu.column_name = 'orderId'))
  `;
  const orderLinks = new Map(foreignKeys.map((row) => [`${row.tableName}.${row.columnName}`, row.foreignTable]));
  assert.equal(orderLinks.get("CustomerPurchaseOrder.orderId"), "Order");
  assert.equal(orderLinks.get("PartnerAttribution.orderId"), "Order");
  assert.equal(orderLinks.get("CommissionEntry.orderId"), "Order");

  const shadowTables = await prisma.$queryRaw`
    SELECT table_name AS name FROM information_schema.tables
    WHERE table_schema = 'public' AND lower(table_name) IN ('corporateorder', 'affiliateorder', 'businessorder')
  `;
  assert.deepEqual(shadowTables, []);
});

test("M15 integration finds no broken cross-domain references", async () => {
  const [row] = await prisma.$queryRaw`
    SELECT
      (SELECT COUNT(*)::int FROM "CustomerPurchaseOrder" po LEFT JOIN "Order" o ON o.id = po."orderId" WHERE po."orderId" IS NOT NULL AND o.id IS NULL) AS "orphanCustomerOrders",
      (SELECT COUNT(*)::int FROM "PartnerAttribution" pa LEFT JOIN "Order" o ON o.id = pa."orderId" WHERE pa."orderId" IS NOT NULL AND o.id IS NULL) AS "orphanAttributions",
      (SELECT COUNT(*)::int FROM "CommissionEntry" ce LEFT JOIN "Order" o ON o.id = ce."orderId" WHERE ce."orderId" IS NOT NULL AND o.id IS NULL) AS "orphanCommissions",
      (SELECT COUNT(*)::int FROM "PartnerSettlementLine" sl LEFT JOIN "CommissionEntry" ce ON ce.id = sl."commissionEntryId" WHERE ce.id IS NULL) AS "orphanSettlementLines"
  `;
  assert.deepEqual(row, {
    orphanCustomerOrders: 0,
    orphanAttributions: 0,
    orphanCommissions: 0,
    orphanSettlementLines: 0,
  });
});

test("M15 integration proves legacy SCM and Investor aggregates remain queryable and isolated", async () => {
  const legacyTables = ["Supplier", "Rfq", "SupplierQuotation", "PurchaseOrder", "Investor"];
  const tables = await prisma.$queryRaw(Prisma.sql`
    SELECT table_name AS name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN (${Prisma.join(legacyTables)})
  `);
  assert.deepEqual(new Set(tables.map((row) => row.name)), new Set(legacyTables));

  const [counts] = await prisma.$queryRaw`
    SELECT
      (SELECT COUNT(*)::int FROM "Supplier") AS suppliers,
      (SELECT COUNT(*)::int FROM "Rfq") AS "supplierRfqs",
      (SELECT COUNT(*)::int FROM "PurchaseOrder") AS "purchaseOrders",
      (SELECT COUNT(*)::int FROM "Investor") AS investors
  `;
  for (const value of Object.values(counts)) assert.equal(Number.isInteger(value) && value >= 0, true);

  const forbiddenCrossLinks = await prisma.$queryRaw`
    SELECT tc.table_name AS "tableName", ccu.table_name AS "foreignTable"
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name IN ('SalesRfq', 'SalesQuotation', 'CustomerPurchaseOrder')
      AND ccu.table_name IN ('Supplier', 'Rfq', 'SupplierQuotation', 'PurchaseOrder', 'Investor')
  `;
  assert.deepEqual(forbiddenCrossLinks, []);
});
