# PC Builder StockLevel Backfill Runbook

Hardening #8 makes warehouse `StockLevel.quantity - reserved` the checkout authority. This runbook prepares legacy physical variants that still rely on `ProductVariant.stock`.

## Safety rules

- Run the audit first. It is dry-run by default and performs no writes.
- Do not apply while invalid `StockLevel` rows exist (`quantity < 0`, `reserved < 0`, or `reserved > quantity`).
- Do not apply while negative legacy `ProductVariant.stock` values exist.
- Do not apply while non-physical products have `StockLevel` rows; review those rows manually first.
- Existing `StockLevel` rows are never overwritten by the backfill.
- The apply step inserts only physical variants that have no `StockLevel` row anywhere.
- After insertion, legacy `ProductVariant.stock` is reconciled from warehouse available stock so the legacy display field matches warehouse truth.

## 1. Generate Prisma Client

```bash
npx prisma generate
```

## 2. Audit only

```bash
node scripts/stock-level-integrity.mjs
```

For machine-readable output:

```bash
node scripts/stock-level-integrity.mjs --json
```

A non-ready audit exits with code `2`. Review the counts and samples before continuing.

## 3. Select the target warehouse

If exactly one warehouse is marked `isDefault=true`, the script uses it automatically. Otherwise specify the approved warehouse explicitly:

```bash
node scripts/stock-level-integrity.mjs --warehouse-id=123
```

The command above is still dry-run only.

## 4. Apply the backfill

Apply only after the audit has no blocking integrity issues and the target warehouse has been verified:

```bash
node scripts/stock-level-integrity.mjs --apply --confirm=BACKFILL_STOCK_LEVELS
```

Or with an explicit warehouse:

```bash
node scripts/stock-level-integrity.mjs --warehouse-id=123 --apply --confirm=BACKFILL_STOCK_LEVELS
```

The write runs in a database transaction. Missing physical variants are inserted with `quantity = max(ProductVariant.stock, 0)` and `reserved = 0`. Existing warehouse rows are preserved.

## 5. Require a clean post-apply audit

The script automatically runs another audit after the transaction. Production readiness requires:

- `missingStockLevels = 0`
- `invalidStockLevels = 0`
- `negativeLegacyStock = 0`
- `aggregateMismatches = 0`
- `nonPhysicalStockLevels = 0`
- no blocking warehouse configuration issues
- `readyForStrictWarehouseStock = true`

If any condition remains unresolved, do not remove the storefront legacy-stock fallback yet.

## Rollback / recovery

Do not blindly delete generated `StockLevel` rows after live inventory operations have started. If an apply was performed against the wrong warehouse, stop inventory writes and reconcile using a reviewed database backup or a manually validated transfer/correction procedure. The script intentionally does not provide an automatic destructive rollback.
