# M15 Integration Tests and Security Hardening

M15 now verifies the complete Business Network architecture without writing test fixtures to the configured database.

## Integration coverage

- Confirms the completed M2-M14 persistence migrations are applied.
- Confirms all core organization, corporate sales, partner, commission, settlement, audit, risk, and notification tables exist.
- Confirms `CustomerPurchaseOrder`, `PartnerAttribution`, and `CommissionEntry` connect to the existing `Order` aggregate.
- Rejects shadow `CorporateOrder`, `AffiliateOrder`, or `BusinessOrder` tables.
- Detects orphan customer-order, attribution, commission, and settlement-line references.
- Confirms legacy SCM (`Supplier`, `Rfq`, `SupplierQuotation`, `PurchaseOrder`) and `Investor` aggregates remain queryable and have no forbidden corporate-sales foreign keys.

Run the read-only database integration suite:

```bash
npm run test:business-network-m15-integration
```

## Security hardening

- Credentialed business mutations fail closed unless the request has an exact same-origin `Origin` or trustworthy same-origin Fetch Metadata.
- Every Business Network admin mutation is continuously checked for internal RBAC and same-origin protection.
- Every Business Portal mutation is continuously checked for same-origin protection; tenant authorization remains enforced by the business context/services.
- Public partner-attribution capture now requires same-origin requests in addition to validation, signed cookies, body limits, and rate limiting.
- Reports and CSV exports are rate-limited per authenticated admin identity, not by a spoofable client IP alone.
- Rate-limit storage keys contain a SHA-256 identity digest rather than raw user IDs/IPs.
- Cron secrets use constant-time comparison and require 32 characters in production.
- Audit HMAC/IP secrets fail closed in production when missing or shorter than 32 characters; development keeps explicit non-production fallbacks.
- Business, admin, cron, and partner APIs receive defense-in-depth no-store/no-index response headers.

Run the security regression suite:

```bash
npm run test:business-network-m15-security
```

Run all M15 reporting, integration, and security tests plus static verification:

```bash
npm run verify:business-network-m15
```

## Production configuration

Before deployment configure:

- `NEXTAUTH_SECRET` (at least 32 random characters)
- `BUSINESS_AUDIT_INTEGRITY_SECRET` (recommended dedicated 32+ character secret)
- `BUSINESS_AUDIT_IP_SECRET` (recommended dedicated 32+ character secret)
- `PARTNER_ATTRIBUTION_SECRET` (at least 32 random characters)
- `PARTNER_PAYOUT_ENCRYPTION_KEY`
- `CRON_SECRET` (at least 32 random characters)
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for distributed production rate limiting

The integration suite is intentionally read-only. It may safely run against a staging database after migrations, but production verification should still follow normal change-management controls.
