# Business Network M1–M15 Full Test Flow

এই document-টি Business Network-এর M1 থেকে M15 পর্যন্ত automated test, live database verification, admin-panel acceptance test এবং organization/partner portal end-to-end test-এর canonical flow।

## 1. কোন environment-এ test করবেন

Database verification scripts কিছু rollback-safe fixture transaction ব্যবহার করে। তাই:

- Local অথবা disposable staging PostgreSQL database ব্যবহার করুন।
- Production database-এ manual lifecycle বা database guard test চালাবেন না।
- `.env`-এর `DATABASE_URL` test database-এ point করছে নিশ্চিত করুন।
- Test শুরুর আগে staging database backup রাখুন।
- একই database-এ অন্য কেউ migration বা seed চালাচ্ছে না নিশ্চিত করুন।

প্রাথমিক setup:

```bash
npm install
npx prisma generate
npx prisma validate
npx prisma migrate status
```

Expected result:

- Prisma schema valid হবে।
- `66 migrations found` এবং `Database schema is up to date` দেখাবে।
- কোনো pending/failed migration থাকবে না।

## 2. তিন স্তরের automated test

### A. M1–M15 application regression

```bash
npm run test:business-network-m1-to-m15
```

এটি ক্রমানুসারে M1 থেকে M15 পর্যন্ত schema contract, lifecycle state machine, RBAC, validation, portal/admin UI contract, reporting, integration এবং security tests চালায়। একটি milestone fail করলে পরের milestone চালু হবে না।

### B. Live database verification

```bash
npm run verify:business-network-database
```

এটি migration status-এর সঙ্গে credit, Sales RFQ, quotation, customer PO/order, partner agreement, referral, commission এবং settlement-এর PostgreSQL constraints, indexes, triggers, sequences ও rollback-safe guards যাচাই করে।

### C. Full release gate

```bash
npm run verify:business-network-release
```

এই command-এর success criteria:

1. M1–M15 automated tests pass
2. Live database verification pass
3. ESLint pass
4. TypeScript pass
5. Next.js production build pass

CI/CD বা production release candidate-এর final gate হিসেবে এই command ব্যবহার করুন।

## 3. Milestone-by-milestone automated flow

| Milestone | প্রধান scope | Command | আবশ্যিক result |
| --- | --- | --- | --- |
| M1 | Organization identity/core | `npm run test:business-network-m1` তারপর `npm run verify:business-organization-db` | Foundation models এবং normalized Trade License/TIN/BIN duplicate guard pass |
| M2 | Membership, portal RBAC, invitation | `npm run test:business-network-m2` | Tenant selection, role restrictions, token safety ও invitation transaction pass |
| M3 | Business account ও pricing engine | `npm run test:business-network-m3` | Pricing precedence, quantity tier, currency এবং effective-date rules pass |
| M4 | Corporate credit ও immutable ledger | `npm run test:business-network-m4` | Limit, balance, direction, idempotency এবং append-only rules pass |
| M5 | Corporate Sales RFQ | `npm run test:business-network-m5` | Corporate `SalesRfq` supplier `Rfq` থেকে isolated এবং lifecycle pass |
| M6 | Versioned sales quotation | `npm run test:business-network-m6` | Maker-checker, current version, totals ও immutable issued version pass |
| M7 | Customer PO → existing Order | `npm run test:business-network-m7` | PO match, inventory revalidation, reservation এবং canonical `Order` conversion pass |
| M8 | Partner profile ও agreement | `npm run test:business-network-m8` | Partner lifecycle, capability এবং versioned agreement pass |
| M9 | Referral asset, attribution ও lead | `npm run test:business-network-m9` | Signed attribution, safe redirect, spoof prevention, lead lifecycle pass |
| M10 | Commission engine ও ledger | `npm run test:business-network-m10` | Deterministic rule selection, Decimal calculation এবং lifecycle pass |
| M11 | Settlement ও encrypted payout | `npm run test:business-network-m11` | Encryption, maker-checker payout, immutable lines এবং reversal rules pass |
| M12 | Business Portal UI | `npm run test:business-network-m12` | Portal routes, capability-aware navigation এবং tenant-scoped reads pass |
| M13 | Admin Business Network UI | `npm run test:business-network-m13` | Admin routes, permissions, filters, pagination ও audited actions pass |
| M14 | Fraud, audit ও notifications | `npm run test:business-network-m14` | Fraud signals, HMAC audit, immutable trigger ও retryable outbox pass |
| M15 | Reports, integration ও security | `npm run test:business-network-m15` | Reporting + live read-only integration + full-route security pass |

## 4. Manual test accounts

Staging-এ একই ব্যক্তিকে সব permission না দিয়ে আলাদা account ব্যবহার করুন।

| Account | প্রয়োজনীয় access | কী test করবে |
| --- | --- | --- |
| BN Admin | সব `business.*` ও `partner.*` global permission | Organization, account, pricing ও governance administration |
| BN Sales Maker | RFQ/quotation create-update-send permission | RFQ assignment এবং quotation preparation |
| BN Sales Approver | `business.quotation.approve` | Maker-checker separation |
| BN Finance Maker | credit/commission/settlement create-adjust permission | Credit ও settlement preparation |
| BN Finance Approver | commission/settlement approve-pay permission | Independent approval ও payment evidence |
| Organization OWNER | active membership + OWNER | Organization settings, member invitation এবং all portal capabilities |
| Organization BUYER | BUYER + `CORPORATE_BUYER` capability | RFQ, PO, order ও invoice flow |
| Organization APPROVER | APPROVER + `CORPORATE_BUYER` | Quotation accept/reject |
| Organization FINANCE | FINANCE + `CORPORATE_BUYER` | Credit, invoices ও payments read-only flow |
| Partner Manager | PARTNER_MANAGER + active partner capability | Assets, leads, orders ও commissions |
| Partner Finance | PARTNER_FINANCE + active partner capability | Payout account ও settlement visibility |
| Viewer | VIEWER | Read-only negative permission tests |

প্রতিটি account-এর জন্য expected denial-ও test করুন: missing permission-এ `403`, missing session-এ `401`, wrong organization ID-তে safe `404`।

## 5. M1–M4 organization, membership, pricing ও credit flow

### M1 — Organization onboarding

1. Incognito window থেকে `/business/apply` খুলুন।
2. বৈধ company identity/contact data দিয়ে application submit করুন।
3. Duplicate trade license/TIN/BIN অথবা malformed data দিয়ে আবার submit করুন।
4. BN Admin দিয়ে `/admin/business-network/organizations` খুলুন।
5. Application review করে Verify, Activate, Suspend এবং Reactivate/Activate lifecycle test করুন।
6. প্রথম Verify-এর `Verified At` note করুন; Suspend → Activate-এর পর একই timestamp আছে নিশ্চিত করুন।

Expected:

- Valid application pending/review state-এ তৈরি হবে।
- একই Trade License, TIN অথবা BIN (case, space বা hyphen variation-সহ) submit করলে `409 Conflict`, code `ORGANIZATION_IDENTIFIER_CONFLICT` এবং `An organization with this Trade License, TIN, or BIN already exists.` message দেবে।
- Admin permission ছাড়া list/action পাওয়া যাবে না।
- `PENDING_VERIFICATION`-এ শুধু Verify/Reject, `ACTIVE`-এ শুধু Suspend এবং `SUSPENDED`-এ শুধু Activate action দেখা যাবে।
- Suspend → Activate original `verifiedAt` ও `verifiedById` অপরিবর্তিত রাখবে; কেবল প্রথম Verify এগুলো set করবে।
- প্রতিটি status change audit log তৈরি করবে।

### M2 — Membership, roles ও invitations

1. Organization OWNER হিসেবে `/business/organization/members` খুলুন।
2. `/business/organization/members/invite` থেকে BUYER, APPROVER এবং FINANCE invite পাঠান।
3. Wrong email account দিয়ে invite accept করার চেষ্টা করুন।
4. Correct email দিয়ে accept করুন এবং organization switch করুন।
5. BUYER দিয়ে OWNER role grant, final OWNER demotion/removal এবং cross-organization member edit চেষ্টা করুন।

Expected:

- Raw invitation token database-এ থাকবে না; hash থাকবে।
- Wrong email, expired বা revoked invitation reject হবে।
- Repeated valid acceptance idempotent হবে।
- Final OWNER remove/demote হবে না।
- Active organization cookie অন্য tenant select করতে পারবে না।

### M3 — Business account ও pricing

1. Admin `/admin/business-network/accounts` থেকে active organization-এর business account তৈরি করুন।
2. `/admin/business-network/pricing/tiers` থেকে active tier ও quantity-based rule তৈরি করুন।
3. `/admin/business-network/pricing/contracts` থেকে account-specific contract price তৈরি করুন।
4. একই product-এর public, tier, contract এবং quotation price compare করুন।
5. Future/expired/wrong-currency contract test করুন।

Expected precedence:

```text
Quotation snapshot → Contract price → Pricing tier → Public price
```

Wrong currency, inactive rule অথবা unmet minimum quantity price override করবে না।

### M4 — Corporate credit

1. `/admin/business-network/credit` থেকে limit ও payment terms set করুন।
2. একটি debit adjustment unique idempotency key দিয়ে post করুন।
3. একই key ও একই payload আবার submit করুন।
4. একই key দিয়ে different amount submit করুন।
5. Limit-এর চেয়ে বেশি debit এবং current balance-এর চেয়ে বেশি credit চেষ্টা করুন।
6. Portal `/business/credit` এবং `/business/credit/statement` যাচাই করুন।

Expected:

- Same key/same payload duplicate ledger row করবে না।
- Same key/different payload conflict দেবে।
- Available credit = limit − outstanding।
- Ledger edit/delete করা যাবে না।

## 6. M5–M7 complete corporate sales flow

এই flow-টি একটানা চালান; IDs এবং numbers evidence হিসেবে সংরক্ষণ করুন।

### M5 — Sales RFQ

1. BUYER `/business/rfqs/new` থেকে অন্তত একটি catalog item দিয়ে draft RFQ তৈরি করুন।
2. Draft edit ও attachment add/remove test করুন।
3. RFQ submit করুন।
4. Submit-এর পরে edit চেষ্টা করুন।
5. Admin `/admin/business-network/rfqs` থেকে internal salesperson assign করুন।

Expected lifecycle:

```text
DRAFT → SUBMITTED → UNDER_REVIEW → QUOTED → CLOSED
```

Corporate `SalesRfq` কোনো SCM supplier `Rfq` list/report-এ দেখা যাবে না।

### M6 — Sales quotation

1. Sales Maker `/admin/business-network/quotations/new` থেকে RFQ-linked quotation তৈরি করুন।
2. Totals, tax, discount, currency এবং validity যাচাই করুন।
3. Submit review করুন।
4. `business.quotation.approve` permission ছাড়া Maker account দিয়ে approve করে `403` নিশ্চিত করুন।
5. আলাদা Sales Approver account দিয়ে approve এবং Sales Maker দিয়ে send করুন।
6. Portal `/business/quotations` থেকে view করুন।
7. APPROVER account দিয়ে accept করুন।
8. Accepted quotation revise/cancel করার চেষ্টা করুন।

Expected lifecycle:

```text
DRAFT → INTERNAL_REVIEW → SENT → VIEWED → ACCEPTED
```

Issued version overwrite হবে না; revision নতুন version তৈরি করবে।

### M7 — Customer PO এবং canonical Order conversion

1. BUYER `/business/purchase-orders/new` থেকে accepted quotation-এর exact amount/currency দিয়ে PO submit করুন।
2. Mismatched amount/currency দিয়ে negative case চালান।
3. Admin `/admin/business-network/customer-pos` থেকে Verify করুন।
4. Conversion-এর আগে product/variant stock available নিশ্চিত করুন।
5. `Convert to order` চালান।
6. Portal `/business/orders` ও `/business/invoices` যাচাই করুন।
7. একই PO আবার convert করার চেষ্টা করুন।

Expected:

- PO → Order conversion একই transaction-এ হবে।
- Existing `Order` model ব্যবহৃত হবে; shadow CorporateOrder হবে না।
- Inventory reservation, price snapshot ও credit movement atomic হবে।
- Repeated conversion duplicate order তৈরি করবে না।

## 7. M8–M11 complete partner earning-to-payout flow

### M8 — Partner profile ও agreement

1. Organization-এ একটি partner capability enable করুন: `AFFILIATE`, `RESELLER`, `DEALER`, `MARKETING_PARTNER` অথবা `SERVICE_PARTNER`।
2. Admin `/admin/business-network/partners` থেকে partner profile approve করুন।
3. `/admin/business-network/agreements` থেকে agreement/version তৈরি করুন।
4. Submit → independent Approve করুন।
5. Active agreement overwrite না করে নতুন version তৈরি করুন।

Expected:

- Partner pages capability ছাড়া দেখা যাবে না।
- Approved terms immutable snapshot হবে।
- Suspension/revocation portal access ও new attribution বন্ধ করবে।

### M9 — Referral এবং lead

1. Partner Manager `/business/partner/links` থেকে referral asset/code তৈরি করুন।
2. Incognito browser-এ `/r/{code}` খুলুন।
3. Redirect destination, `HttpOnly`, `SameSite=Lax`, signed attribution cookie যাচাই করুন।
4. `/business/partner/leads/new` থেকে lead register করুন।
5. Admin `/admin/business-network/leads` থেকে Accept → Assign → Mark won/lost flow test করুন।
6. Duplicate email/phone/organization lead test করুন।

Expected:

- Client-provided partner ID trust করা হবে না।
- Unsafe external redirect reject হবে।
- Duplicate lead explicit terminal/evidence state পাবে।
- Converted attribution existing `Order`-এর সঙ্গে link হবে।

### M10 — Commission

1. `/admin/business-network/commission/plans` থেকে active plan/rule তৈরি করুন।
2. Global, category, product এবং variant scope overlap করান।
3. Eligible attributed order তৈরি/complete করুন।
4. `/admin/business-network/commission/ledger` এবং portal `/business/partner/commissions` যাচাই করুন।
5. Approve, cancel এবং reversal evidence test করুন।

Expected:

- Most-specific eligible rule deterministicভাবে select হবে।
- Money `Decimal`; float rounding drift থাকবে না।
- Lifecycle হবে `PENDING → HOLD → APPROVED → PAYABLE → PAID`।
- Partner commission amount/edit/status নিজে পরিবর্তন করতে পারবে না।

### M11 — Payout account ও settlement

1. Partner Finance `/business/partner/payout-accounts` থেকে account যোগ করুন।
2. Admin `/admin/business-network/payout-accounts` থেকে masked last-four দেখে Verify করুন।
3. `/admin/business-network/settlements` থেকে eligible commission period-এর draft settlement তৈরি করুন।
4. Finance Maker দিয়ে Submit, আলাদা Approver দিয়ে Approve করুন।
5. Start processing → unique payment reference দিয়ে Mark paid করুন।
6. Portal `/business/partner/settlements` থেকে result দেখুন।

Expected:

- Full payout account UI/API response-এ প্রকাশ হবে না; encrypted at rest থাকবে।
- Settlement lines immutable থাকবে।
- Paid reference unique থাকবে।
- Cancelled settlement eligible commission release করবে।

## 8. M12–M13 portal ও admin UI acceptance

### M12 — Business Portal

প্রতিটি role দিয়ে login করে desktop ও mobile viewport test করুন:

- `/business`
- `/business/organization`
- `/business/rfqs`, `/business/quotations`, `/business/purchase-orders`
- `/business/orders`, `/business/invoices`, `/business/credit`
- `/business/partner`, leads, orders, commissions, settlements, payout accounts
- `/business/notifications`, `/business/settings`

Expected:

- Navigation role ও active capability অনুযায়ী বদলাবে।
- Empty/loading/error states layout ভাঙবে না।
- Tenant switch-এর পরে আগের organization-এর data থাকবে না।
- VIEWER mutation controls পাবে না এবং direct API mutation-এ `403` পাবে।

### M13 — Admin Business Network

BN Admin এবং restricted admin account দিয়ে test করুন:

- Overview, Organizations, Accounts
- Pricing tiers/contracts, Credit
- RFQs, Quotations, Customer POs, Orders
- Partners, Agreements, Leads
- Commission plans/ledger, Settlements, Payout Accounts
- Risk, Disputes, Audit, Reports

Expected:

- Search/filter/status/pagination refresh-safe হবে।
- Detail page deep link কাজ করবে।
- Permission ছাড়া sidebar item লুকাবে এবং direct URL/API deny হবে।
- Sensitive payout, IP/device এবং secret fields masked/sanitized থাকবে।
- SCM এবং Investor navigation/data অপরিবর্তিত থাকবে।

## 9. M14 governance flow

1. `/business/notifications` খুলে preferences update করুন।
2. Staging-এ RFQ submit-এর মতো non-destructive event trigger করুন।
3. In-app notification একবার এসেছে নিশ্চিত করুন।
4. Correct `Authorization: Bearer {CRON_SECRET}` দিয়ে notification cron call করুন।
5. Invalid secret দিয়ে একই cron call করে `401` নিশ্চিত করুন।
6. Fraud scan দুইবার চালিয়ে duplicate fingerprint তৈরি হয়নি নিশ্চিত করুন।
7. `/admin/business-network/risk` থেকে review/confirm/false-positive/resolve flow চালান।
8. `/admin/business-network/audit` থেকে event খুঁজে integrity endpoint verify করুন।

Expected:

- Audit row update/delete করা যাবে না।
- Raw token, password, authorization, cookie, payout number, IP/device evidence প্রকাশ হবে না।
- Notification outbox retry-safe এবং claim-safe থাকবে।
- Production cron/audit secrets minimum 32 characters হবে।

## 10. M15 reporting, integration ও security flow

### Reporting

1. `business.report.view` account দিয়ে `/admin/business-network/reports` খুলুন।
2. 30-day daily, 12-month monthly এবং multiple currency filter test করুন।
3. `from > to`, 366 দিনের বেশি range এবং 120 দিনের বেশি daily range দিন।
4. Overview, organizations, partners, credit ও pipeline CSV export করুন।
5. Permission ছাড়া account এবং signed-out browser দিয়ে page/API test করুন।

Expected:

- Valid range canonical records থেকে totals দেখাবে।
- Invalid range `422`, missing session `401`, missing permission `403`।
- CSV UTF-8, spreadsheet-injection safe এবং customer PII ছাড়া হবে।
- Responses `private, no-store`, `Vary: Cookie`, `nosniff` হবে।

### Integration ও security

```bash
npm run test:business-network-m15-integration
npm run test:business-network-m15-security
```

Expected:

- সব canonical foreign key valid এবং orphan count zero।
- `CorporateOrder`, `AffiliateOrder` বা `BusinessOrder` shadow table থাকবে না।
- SCM/Investor tables queryable এবং Corporate Sales foreign key থেকে isolated থাকবে।
- Cross-origin authenticated mutation `403` হবে।
- Public attribution cross-origin POST `403` হবে।
- Report/export rate limit response-এ `429` ও `Retry-After` থাকবে।

## 11. Evidence checklist

Client/UAT handoff-এর জন্য রাখুন:

- Automated command output বা CI job link
- Prisma migration-status output
- প্রতিটি test role ও permission mapping
- Organization, RFQ, quotation, PO, Order, attribution, commission ও settlement IDs
- Status transition screenshots
- Inventory/credit before-and-after snapshot
- Audit integrity result
- Notification delivery/fraud deduplication evidence
- CSV export sample
- Production build success output

## 12. Final pass/fail rule

Release কেবল তখনই pass:

- `npm run verify:business-network-release` exit code `0`
- কোনো pending migration নেই
- কোনো unexpected `401/403/404/409/422/429/500` নেই
- Cross-tenant data exposure zero
- Financial duplicate/orphan mismatch zero
- SCM এবং Investor regression zero
- Required production secrets ও distributed rate limiting configured

কোনো security, tenant isolation, financial integrity অথবা migration test fail করলে release block করুন; UI-only workaround দিয়ে bypass করবেন না।
