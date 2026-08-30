import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("M15 reporting is permission-isolated and private", async () => {
  const [route, exportRoute] = await Promise.all([
    read("app/api/admin/business-network/reports/route.ts"),
    read("app/api/admin/business-network/reports/export/route.ts"),
  ]);
  for (const source of [route, exportRoute]) {
    assert.match(source, /business\.report\.view/);
    assert.match(source, /private, no-store/);
    assert.match(source, /Vary: "Cookie"/);
  }
  assert.match(exportRoute, /X-Content-Type-Options/);
  assert.match(exportRoute, /text\/csv/);
});

test("M15 reporting validates and bounds every requested period", async () => {
  const schema = await read("lib/business-network/reporting-schemas.ts");
  assert.match(schema, /businessReportQuerySchema/);
  assert.match(schema, /inclusiveDays > 366/);
  assert.match(schema, /REPORT_RANGE_INVALID/);
  assert.match(schema, /REPORT_GRANULARITY_INVALID/);
  assert.match(schema, /Asia\/Dhaka/);
  assert.match(schema, /\.strict\(\)/);
});

test("M15 aggregates canonical corporate, partner, credit and risk records", async () => {
  const reporting = await read("lib/business-network/reporting.ts");
  for (const model of [
    "db.order", "db.salesRfq", "db.salesQuotation", "db.commissionEntry",
    "db.partnerSettlement", "db.businessRiskCase", "db.organizationCreditAccount",
  ]) assert.match(reporting, new RegExp(model.replace(".", "\\.")));
  assert.match(reporting, /Prisma\.sql/);
  assert.doesNotMatch(reporting, /\$queryRawUnsafe|\$executeRawUnsafe/);
  assert.match(reporting, /previousOrderWhere/);
  assert.match(reporting, /quotationConversionRate/);
  assert.match(reporting, /partnerPerformance/);
});

test("M15 CSV export is allowlisted and spreadsheet-injection safe", async () => {
  const [schema, reporting] = await Promise.all([
    read("lib/business-network/reporting-schemas.ts"),
    read("lib/business-network/reporting.ts"),
  ]);
  for (const section of ["overview", "organizations", "partners", "credit", "pipeline"]) {
    assert.match(schema, new RegExp(`"${section}"`));
  }
  assert.match(reporting, /\^\[=\+\\-@\\t\\r\]/);
  assert.match(reporting, /replaceAll\('\"', '\"\"'\)/);
  assert.match(reporting, /business-network-\$\{section\}/);
});

test("M15 replaces the generic report placeholder with a professional workspace", async () => {
  const [page, component] = await Promise.all([
    read("app/admin/business-network/reports/page.tsx"),
    read("components/admin/business-network/BusinessReports.tsx"),
  ]);
  assert.match(page, /BusinessReports/);
  assert.doesNotMatch(page, /BusinessInsights/);
  for (const contract of [
    "Apply report", "Export", "Revenue trend", "Commercial pipeline",
    "Top corporate organizations", "Partner performance", "Credit exposure", "Risk distribution",
  ]) assert.match(component, new RegExp(contract));
  assert.match(component, /AbortController/);
  assert.match(component, /role="alert"/);
  assert.match(component, /No corporate orders in this period/);
});
