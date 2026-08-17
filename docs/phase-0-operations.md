# Phase 0 operations

## Required secrets

- `NEXTAUTH_SECRET` (or `AUTH_SECRET`) signs short-lived guest payment-init tokens.
- `CRON_SECRET` protects inventory-reservation cleanup.
- `BLOB_READ_WRITE_TOKEN` enables durable Vercel Blob upload storage and is required
  in production.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` enable distributed rate
  limiting and are required in production. `KV_REST_API_URL` and
  `KV_REST_API_TOKEN` are accepted as compatible aliases.
- `MAILBOX_API_KEY` is optional. Without it, email checks fall back to format validation.

Rotate the old MailboxLayer key that previously existed in Git history. Removing it
from the current source does not revoke the credential or erase earlier commits.

## Inventory cleanup schedule

Call `GET /api/cron/release-expired-inventory` every 5 minutes with either:

```text
Authorization: Bearer <CRON_SECRET>
```

or:

```text
x-cron-secret: <CRON_SECRET>
```

The job releases expired SSLCommerz reservations, fails unfinished payment attempts,
and returns coupon usage when an unpaid order expires.

## Verification

```bash
npm audit --omit=dev
npm run test:phase0
npm run lint
npm run typecheck
```

`npm run typecheck` must pass before deployment. Next.js build error suppression has
been removed, so production builds enforce the same TypeScript gate.

## Deployment note

Uploads use local `public/upload` storage only during development. Production fails
closed unless Vercel Blob is configured. Protected SCM, investor, payment, delivery,
and digital-asset objects are stored as private blobs and remain behind the existing
route-level token/RBAC controls.

Rate limiting uses an in-memory fallback only outside production. Production fails
closed unless Upstash Redis is configured, preventing per-instance serverless limits
from being mistaken for a distributed limit.
