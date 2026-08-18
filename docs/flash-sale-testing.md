# Flash Sale rollout and acceptance test

## 1. Apply the database change

Stop the development server first so the generated Prisma engine is not locked on Windows. Use the command that matches the database's existing schema-management convention.

```powershell
# Database already managed by Prisma migrations:
npx prisma migrate deploy
npx prisma generate
```

For a legacy/local database created with `prisma db push` (no `_prisma_migrations` table), use `npx prisma db push` and then `npx prisma generate`. Do not run `migrate deploy` against an unbaselined database containing existing tables. Establish a migration baseline before moving that database to a production migration workflow.

## 2. Load demo deals

```powershell
npm run seed:flash-sales
```

The dedicated, idempotent seed configures up to eight eligible, available technology products as live flash deals with different discount percentages and end times. It does not recreate customers, orders, catalog masters, or inventory.

## 3. Admin acceptance test

1. Sign in with a user that has `products.manage`.
2. Open `/admin/management/flash-sales`.
3. Search by product name or SKU and select **Configure**.
4. Enter a sale price lower than the regular price, a start time, an end time, and display order.
5. Save and confirm that the row shows `live` or `scheduled`.
6. Try saving a price equal to the regular price, an end time before the start time, and a flash sale for an inactive product. Each must be rejected.
7. Open the same product in two browser tabs. Save in the first tab, then save from the stale second tab. The second request must return a conflict and ask for a refresh.
8. Remove the sale and verify that its price/schedule are cleared and the storefront cache refreshes.
9. Sign in without `products.manage` and verify the list and mutation APIs return `403`.

## 4. Storefront acceptance test

1. Open the home page. Only enabled, active, in-stock-time-window products should appear under **Flash Sale**.
2. Confirm each card has a real savings amount, sale/regular prices, an individual countdown, and **View Deal**.
3. Test previous/next controls, touch scrolling, phone/tablet/desktop widths, keyboard focus, and the `/ecommerce/flash-sale` View All page.
4. Open a deal product and confirm its product page, catalog, cart, wishlist, tax quote, and checkout use the same sale price.
5. Set a deal to expire in two minutes. When it expires, the countdown must show `Deal ended`; refresh within 30 seconds and confirm the card disappears.
6. Attempt checkout after expiry using an already-open browser tab. The order must use the regular price because the server recalculates pricing at submission time.
7. Deactivate a product during a live deal. It must disappear from the storefront and be rejected by cart/order availability checks.

## 5. Automated verification

```powershell
npm run test:flash-sale
npm run typecheck
npm run lint
```

The flash-sale unit suite covers start/end boundaries, invalid price/date configuration, disabled schedules, savings, and proportional variant pricing.
