# Business Network M14 Operations

M14 adds fraud detection, immutable audit evidence and an in-app/email notification outbox. Apply the migration before deploying application code because existing business mutations begin writing the new audit-integrity fields and notification records immediately.

## Deployment order

1. Back up PostgreSQL and verify the target environment.
2. Run `npx prisma migrate deploy`.
3. Run `npx prisma generate` (normally handled by `postinstall`).
4. Deploy the application.
5. Configure both protected scheduled jobs below.
6. Run `npm run test:business-network-m14` and the M1–M14 regression suite.

The migration is additive. Existing audit rows are sealed as `LEGACY_SEALED`; all new audit rows receive a versioned HMAC integrity hash. A database trigger rejects updates and deletes for every audit row.

## Required production secrets

- `CRON_SECRET`: bearer token for both scheduled jobs.
- `BUSINESS_AUDIT_INTEGRITY_SECRET`: random value of at least 32 characters.
- `NEXT_PUBLIC_BASE_URL`: canonical HTTPS origin used in notification links.
- `BUSINESS_NOTIFICATION_FROM_EMAIL`: verified sender address.
- `RESEND_API_KEY`, or the existing `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` configuration.

Never rotate `BUSINESS_AUDIT_INTEGRITY_SECRET` without retaining the previous key and performing a controlled versioned audit migration.

## Scheduled jobs

Call with `Authorization: Bearer $CRON_SECRET` and HTTPS only:

- `GET /api/cron/business-network/fraud-scan?maxCases=100` every 5 minutes.
- `GET /api/cron/business-network/notifications?limit=50` every minute.

Both endpoints fail closed when `CRON_SECRET` is absent. Fraud fingerprints make repeated scans idempotent. The email worker atomically claims each outbox row and retries with exponential backoff, up to `BUSINESS_NOTIFICATION_MAX_ATTEMPTS` (maximum 5).

## Operational verification

1. Open `/business/notifications` as an active organization member.
2. Trigger a non-destructive workflow event in staging, such as submitting an RFQ.
3. Confirm one in-app notification per active member and at most one email delivery per notification.
4. Call the notification cron and confirm the delivery becomes `DELIVERED` or a sanitized `FAILED` record is retained for retry.
5. Call the fraud scan twice and confirm the second scan does not create duplicate fingerprints.
6. Review the case in `/admin/business-network/risk`, start review, confirm/mark false positive, and resolve as applicable.
7. Verify a new audit entry using `GET /api/admin/business-network/audit/{id}/integrity` with an account holding `business.audit.view`.

Do not run destructive audit-table repair statements. A failed integrity result should be handled as a security incident and investigated against database backups and infrastructure logs.
