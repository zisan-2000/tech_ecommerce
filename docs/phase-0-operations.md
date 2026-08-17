# Phase 0 operations

## Required secrets

- `NEXTAUTH_SECRET` (or `AUTH_SECRET`) signs short-lived guest payment-init tokens.
- `CRON_SECRET` protects inventory-reservation cleanup.
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

`npm run typecheck` currently reports pre-existing SCM type errors. Do not remove
`typescript.ignoreBuildErrors` until that backlog is fixed and the command is clean.

## Deployment note

The current upload implementation writes to local `public/upload` storage. This is
not durable on serverless deployments. Configure object storage before production;
the route-level type, size, rate, token, and RBAC controls should be retained when
the storage adapter is replaced.

