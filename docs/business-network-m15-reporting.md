# Business Network M15 Reporting

M15 reporting is available at `/admin/business-network/reports` and requires the global `business.report.view` permission. The page and both APIs are private, non-cacheable resources.

## Endpoints

- `GET /api/admin/business-network/reports`: period summary, comparisons, trend, pipeline, partner, credit and risk data.
- `GET /api/admin/business-network/reports/export`: allowlisted CSV export for `overview`, `organizations`, `partners`, `credit` or `pipeline`.

Both endpoints return `401` without a session and `403` when the authenticated user lacks `business.report.view`.

## Reporting contract

- Reporting timezone: `Asia/Dhaka`.
- `from` and `to` are inclusive calendar dates in `YYYY-MM-DD` format.
- Maximum range: 366 days.
- Daily granularity is limited to 120 days; use weekly or monthly granularity for longer periods.
- Currency is explicit and defaults to `BDT`; amounts from different currencies are never combined.
- Period change compares the selected range with the immediately preceding range of equal length.

Canonical sources are the existing `Order`, `Organization`, `SalesRfq`, `SalesQuotation`, `PartnerAttribution`, `PartnerLead`, `CommissionEntry`, `PartnerSettlement`, `OrganizationCreditAccount` and `BusinessRiskCase` records. Reporting does not create shadow order, partner or finance records.

## Important definitions

- Corporate revenue: `Order.grand_total` for orders linked to an organization in the selected currency and period.
- Paid revenue: the corporate-revenue subset whose order payment status is `PAID`.
- Quote conversion: accepted quotations divided by all quotations created in the selected period.
- Commission expense: the signed sum of commission entries created in the selected period.
- Credit exposure: current point-in-time balance and limit for active credit accounts in the selected currency.
- Open risk cases: cases currently `OPEN`, `UNDER_REVIEW` or `CONFIRMED` that were detected in the selected period.

CSV fields are quoted, UTF-8 BOM encoded and neutralized against spreadsheet formula injection. Exports contain reporting summaries only and do not expose customer email, phone, IP or device data.
