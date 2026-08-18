# Phase 0–2 testing playbook

এই playbook Phase 0 থেকে Phase 2 পর্যন্ত automated verification এবং manual
acceptance testing-এর একক source of truth। প্রতিটি release/PR-এ automated gate
চালাতে হবে এবং relevant manual cases-এর evidence রাখতে হবে।

## 1. Test environment প্রস্তুতি

1. `.env.example` থেকে প্রয়োজনীয় variable names নিয়ে local `.env` প্রস্তুত করুন।
   কোনো real secret test evidence বা screenshot-এ রাখবেন না।
2. অন্তত নিচের development variables configure করুন:

   - `DATABASE_URL`
   - `NEXTAUTH_URL=http://localhost:3000`
   - `NEXTAUTH_SECRET`
   - `CRON_SECRET`

3. Dependency এবং Prisma client প্রস্তুত করুন:

   ```powershell
   npm install
   npx prisma generate
   npx prisma migrate status
   ```

4. Demo database হলে storefront seed চালানো যাবে:

   ```powershell
   npm run seed:storefront
   ```

   সতর্কতা: full storefront seed non-demo catalog records archive করতে পারে এবং
   demo users/products/orders-related data প্রস্তুত করে। Production database-এ এই
   command চালাবেন না। শুধু menu hierarchy refresh করতে হলে ব্যবহার করুন:

   ```powershell
   npm run seed:storefront-menu
   ```

5. Application চালু করুন:

   ```powershell
   npm run dev
   ```

6. Test browser-এ DevTools-এর Console ও Network tab খোলা রাখুন। Desktop-এর জন্য
   1440px বা বড় viewport এবং mobile-এর জন্য 390x844 viewport ব্যবহার করুন।

### Demo accounts and data

| Purpose | Email | Password |
| --- | --- | --- |
| Store admin | `admin@example.com` | `admin123` |
| Customer 1 | `customer.one@storefront.demo` | `Demo123!` |
| Customer 2 | `customer.two@storefront.demo` | `Demo123!` |

Useful demo data:

- Variant product: `PC Power K87 RGB Mechanical Keyboard`
- Multi-capacity product: `Corsair MP600 Pro XT 1TB NVMe SSD`
- Bundle: `Ryzen 5 Complete Gaming Setup Bundle`
- Coupon: `DEMO10` — 10%, minimum ৳3,000, maximum discount ৳1,500

## 2. Automated release gate

সব Phase test, lint এবং TypeScript এক command-এ চালান:

```powershell
npm run verify:phases
```

Individual suites:

```powershell
npm run test:phase0
npm run test:phase1
npm run test:phase2
npm run lint
npm run typecheck
```

Current baseline:

| Suite | Current tests | Coverage summary |
| --- | ---: | --- |
| Phase 0 | 9 | public-data redaction, coupon security, upload signatures, private paths, rate limiting |
| Phase 1 | 18 | menu taxonomy, catalog normalization, availability action/version validation, filters, search safety, SEO URLs, stock and pagination URLs |
| Phase 2 | 9 | product IDs, variants/stock, purchase projection, compare limit, targeted cart fetch, question permissions |
| Total | 36 | সব test অবশ্যই pass করতে হবে |

Production build আলাদাভাবে পরীক্ষা করতে হলে running dev server বন্ধ করে চালান:

```powershell
npm run build:prod
```

Expected: command exit code `0`; কোনো type/build error থাকবে না।

## 3. Phase 0 — security and production-safety cases

### P0-01 — Security headers

Priority: Critical

Steps:

```powershell
$response = Invoke-WebRequest -Method Head -Uri http://localhost:3000/ecommerce
$response.Headers
```

Expected:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` camera এবং microphone block করে
- `X-Powered-By` header থাকবে না

### P0-02 — Unauthenticated route/API protection

Priority: Critical

Steps:

1. Incognito browser-এ `/admin` এবং `/ecommerce/user/orders` খুলুন।
2. Sign-in ছাড়া API পরীক্ষা করুন:

   ```powershell
   $response = Invoke-WebRequest -SkipHttpErrorCheck -Uri http://localhost:3000/api/orders
   $response.StatusCode
   $response.Content
   ```

Expected:

- Protected page sign-in page-এ redirect করবে বা access denied দেখাবে।
- `/api/orders` status `401`; কোনো order/customer data return করবে না।

### P0-03 — Public product-data redaction

Priority: Critical

Steps:

```powershell
$body = (Invoke-WebRequest -Uri 'http://localhost:3000/api/products?view=storefront').Content
$body -match '"costPrice"|"digitalAssetId"|"codes"|"lowStockThreshold"'
```

Expected: output `False`। Public payload-এ cost, digital asset ID, activation codes বা
internal stock threshold থাকবে না।

### P0-04 — Customer order-data isolation

Priority: Critical

Steps:

1. Customer 1 দিয়ে sign in করে `/ecommerce/user/orders` খুলুন।
2. অন্য customer-এর order ID URL/API-তে ব্যবহার করার চেষ্টা করুন।
3. Network response-এ `costPriceSnapshot` খুঁজুন।

Expected:

- Customer শুধু নিজের orders দেখতে পারবে।
- অন্য customer-এর order `403/404` হবে।
- কোনো response-এ `costPriceSnapshot` থাকবে না।

### P0-05 — Coupon server authority

Priority: High

Steps:

1. ৳3,000-এর কম cart-এ `DEMO10` apply করুন।
2. ৳3,000 বা বেশি cart-এ apply করুন।
3. বড় cart দিয়ে maximum discount পরীক্ষা করুন।
4. DevTools দিয়ে subtotal/discount request value পরিবর্তনের চেষ্টা করুন।

Expected:

- Minimum-এর নিচে coupon reject হবে।
- Valid subtotal-এ discount `min(subtotal × 10%, ৳1,500)`।
- Client-edited discount server গ্রহণ করবে না; order total server-side পুনরায় হিসাব হবে।

### P0-06 — Upload spoof and private-file protection

Priority: Critical

Steps:

1. একটি text file-এর নাম `proof.png` করে payment/document upload form-এ দিন।
2. Sign-in ছাড়া একটি protected payment/SCM upload URL request করুন।
3. Valid PNG/JPEG development upload পরীক্ষা করুন।

Expected:

- Fake extension/file signature reject হবে।
- Protected file unauthorized user download করতে পারবে না।
- Valid supported file accepted হবে; executable/unsupported file reject হবে।

### P0-07 — Cron authentication

Priority: Critical

Safe negative test:

```powershell
$response = Invoke-WebRequest -SkipHttpErrorCheck -Uri http://localhost:3000/api/cron/release-expired-inventory
$response.StatusCode
```

Expected: `401`। Valid `CRON_SECRET` test শুধু disposable/demo database-এ করুন, কারণ
এই endpoint expired reservations এবং coupon usage পরিবর্তন করতে পারে।

### P0-08 — Rate-limit behavior

Priority: High

Steps:

1. `npm run test:phase0` চালিয়ে fixed-window unit case pass নিশ্চিত করুন।
2. Staging-এ একই write endpoint দ্রুত repeat করুন।

Expected:

- Limit অতিক্রম করলে `429` বা equivalent throttling response।
- Production-এ Upstash configuration ছাড়া rate-limited operation fail closed করবে।

### P0-09 — Production configuration gate

Priority: Critical

Staging/production environment-এ নিশ্চিত করুন:

- `BLOB_READ_WRITE_TOKEN` configured
- `UPSTASH_REDIS_REST_URL` এবং `UPSTASH_REDIS_REST_TOKEN` configured
- `NEXTAUTH_SECRET`/`AUTH_SECRET` configured
- `CRON_SECRET` configured
- `npm audit --omit=dev` review করা হয়েছে
- `npm run build:prod` pass

## 4. Phase 1 — storefront, menu and catalog cases

### P1-01 — Storefront smoke test

Priority: Critical

Steps: `/ecommerce`, `/ecommerce/products`, `/ecommerce/categories` এবং
`/ecommerce/brands` খুলুন।

Expected: status `200`, tech catalog content দৃশ্যমান, broken layout/image নয়, Console-এ
uncaught error নেই।

### P1-02 — Three-level desktop menu

Priority: Critical

Steps:

1. Desktop-এ `Accessories` hover করুন।
2. `Cable & Converter` hover/focus করুন।
3. প্রতিটি child link খুলুন।

Expected: নিচের 9টি third-level item দৃশ্যমান এবং clickable:

`HDMI Cable`, `DisplayPort Cable`, `USB Cable`, `USB Type-C Cable`,
`VGA & DVI Cable`, `Audio Cable`, `Network Cable`, `Power Cable`,
`Converter & Adapter`। Child ছাড়া `Keyboard`-এর মতো item-এ false arrow থাকবে না।

### P1-03 — Mobile recursive menu

Priority: Critical

Steps: 390x844 viewport-এ menu খুলে `Accessories` expand করুন, তারপর
`Cable & Converter` expand করুন।

Expected: একই 9টি level-3 item দেখা যাবে; expand/collapse button-এর state পরিবর্তন
হবে; item click করলে catalog category URL খুলবে এবং drawer বন্ধ হবে।

### P1-04 — Header search

Priority: High

Steps: header search-এ `HP Victus` লিখুন; suggestion নির্বাচন করুন। আবার search text
লিখে Enter/Search button ব্যবহার করুন।

Expected: suggestion সঠিক PDP-তে যাবে; full search
`/ecommerce/products?q=...` খুলবে; empty text submit করলে invalid navigation হবে না।

### P1-05 — Desktop instant filters

Priority: Critical

Steps:

1. `/ecommerce/products` desktop viewport-এ খুলুন।
2. Brand checkbox, category, type, stock এবং sort একে একে change করুন।
3. Search/min/max price লিখে প্রায় 450ms অপেক্ষা করুন।

Expected:

- Apply button ছাড়াই checkbox/select সঙ্গে সঙ্গে result এবং URL update করবে।
- Text/number input debounce-এর পরে update হবে।
- Page পুরো reload/scroll-top হবে না; `Updating products…` status সাময়িক দেখা যাবে।

### P1-06 — Mobile filter submit

Priority: Critical

Steps: mobile viewport-এ `Filters` খুলুন, কয়েকটি filter select করুন, তারপর
`Show products` চাপুন।

Expected: drawer/section বন্ধ হবে, URL ও results একবার update হবে। Desktop-only
automatic behavior mobile-এ accidental multiple navigation তৈরি করবে না।

### P1-07 — Multi-filter correctness

Priority: Critical

Example URL:

```text
/ecommerce/products?q=laptop&brand=hp&category=laptop&inStock=1&sort=price-asc
```

Expected: সব visible product query/category/brand/stock conditions satisfy করবে;
prices ascending; active filter chips এবং count সঠিক।

### P1-08 — Price and hostile-query normalization

Priority: High

Test URLs:

```text
/ecommerce/products?minPrice=5000&maxPrice=1000
/ecommerce/products?page=999999&perPage=999&brand=not%20a%20slug
```

Expected: inverted price range safely normalize হবে; page/per-page bounded হবে;
invalid brand ignored হবে; server error বা raw SQL error প্রকাশ হবে না।

### P1-09 — Sort and pagination persistence

Priority: High

Steps: `Products per page = 12`, brand/category filter এবং price sort দিন; page 2-এ যান;
Previous চাপুন।

Expected: filters/sort pagination URL-এ বজায় থাকবে; first page-এ Previous disabled;
duplicate/missing product থাকবে না।

### P1-10 — Active chips and clear

Priority: Medium

Steps: একাধিক filter দিন; একটি chip-এর `×` চাপুন; পরে `Clear all` চাপুন।

Expected: প্রথম action শুধু targeted filter সরাবে; Clear all clean
`/ecommerce/products` state ফিরিয়ে দেবে।

### P1-11 — Empty state

Priority: Medium

Steps: search করুন `no-such-tech-product-987654`।

Expected: `No products found`, recovery copy এবং `View all products` link; broken grid নয়।

### P1-12 — Stock and product visibility

Priority: Critical

Expected:

- Deleted/unavailable products public catalog-এ নেই।
- `In stock only` zero-stock products বাদ দেয়।
- Bundle availability child inventory এবং required quantity দ্বারা সীমাবদ্ধ।
- Negative inventory UI/API-তে negative availability হিসেবে প্রকাশ হয় না।

### P1-13 — SEO and accessibility smoke test

Priority: Medium

Check:

- Category-only catalog has self-consistent canonical metadata।
- Highly filtered/search pages indexable duplicate হিসেবে expose হয় না।
- Form labels keyboard-focusable; Tab দিয়ে menu/filter ব্যবহার করা যায়।
- Light/dark theme-এ text contrast এবং focus indicator দৃশ্যমান।

## 5. Phase 2 — PDP, cart, compare and engagement cases

### P2-01 — Valid and invalid product routes

Priority: Critical

Steps: catalog থেকে যেকোনো product খুলুন; তারপর `/ecommerce/products/0`,
`/ecommerce/products/2.5`, `/ecommerce/products/product` খুলুন।

Expected: valid PDP status `200`; invalid/nonexistent IDs friendly 404; server stack trace নয়।

### P2-02 — Product content completeness

Priority: High

Expected: breadcrumb, image/gallery, name, price, discount/original price যেখানে প্রযোজ্য,
SKU, stock, brand/category, description, specifications, reviews, Q&A এবং related products
সঠিক product-এর data দেখায়।

### P2-03 — Variant selection

Priority: Critical

Steps: `PC Power K87 RGB Mechanical Keyboard` খুলে Black এবং White variants select করুন।

Expected: selected state, price/image/stock যেখানে applicable update হবে; out-of-stock variant
disabled; cart line-এ selected variant ID/label/price থাকবে।

### P2-04 — Quantity boundary

Priority: Critical

Steps: minus/plus ব্যবহার করে quantity কমান/বাড়ান।

Expected: quantity কখনো 1-এর নিচে বা selected stock-এর ওপরে যাবে না; add-to-cart stock-এর
চেয়ে বেশি quantity যোগ করবে না।

### P2-05 — Add to cart and persistence

Priority: Critical

Steps: একটি variant add করুন; একই variant আবার add করুন; অন্য variant add করুন; cart খুলে
quantity update/remove করুন; refresh দিন।

Expected: same product+variant merge হবে, different variant separate line হবে, totals correct,
refresh-এর পরে guest/local or authenticated cart persist করবে। Network-এ add operation শুধু
target product endpoint load করবে, entire catalog নয়।

### P2-06 — Buy now and authentication

Priority: High

Steps: guest অবস্থায় `Buy now`; তারপর signed-in customer হিসেবে `Buy now`।

Expected: guest sign-in flow-এ যায় এবং callback product/checkout context preserve করে;
authenticated user selected itemসহ checkout-এ যায়।

### P2-07 — Wishlist

Priority: High

Steps: guest এবং signed-in user হিসেবে wishlist toggle করুন; wishlist page ও refresh পরীক্ষা করুন।

Expected: guest-কে sign-in prompt/redirect; authenticated state API/local state-এর সঙ্গে sync;
duplicate item নয়; remove করলে badge/list update।

### P2-08 — Compare products

Priority: Critical

Steps: catalog/PDP থেকে 4টি unique product add করুন; 5মটি add করার চেষ্টা করুন; Compare page খুলুন;
একটি remove করুন।

Expected: maximum 4; duplicate ID নয়; comparison table-এ price, brand, category, SKU, type,
availability, rating, options ও specifications side-by-side; remove করলে URL/count update।

### P2-09 — Reviews

Priority: High

Steps: guest হিসেবে review submit; customer হিসেবে 1–5 rating ও comment submit; একই customer
আবার edit/update করুন।

Expected: guest sign-in-এ যাবে; invalid/no rating disabled/rejected; authenticated review list ও
average refresh হবে; একই user duplicate row না বানিয়ে নিজের review update করবে।

এই case database mutate করে—শুধু demo/staging-এ চালান।

### P2-10 — Product questions and staff answer

Priority: High

Steps:

1. Guest হিসেবে question করতে চেষ্টা করুন।
2. Customer দিয়ে 5 characters-এর কম এবং valid question submit করুন।
3. Admin দিয়ে official answer publish/update করুন।

Expected: guest sign-in; short/500-এর বেশি question reject; valid question `Awaiting an answer`
দেখায়; customer answer control পায় না; authorized staff answer করতে পারে।

এই case database mutate করে—শেষে test question clean করুন বা storefront seed rerun করুন।

### P2-11 — EMI and delivery estimate

Priority: Medium

Steps: 3/6/9/12 month EMI toggle করুন; district ও delivery area দিয়ে `Check delivery` চাপুন।

Expected: monthly estimate selected month অনুযায়ী বদলায়; valid quote shipping cost/free delivery
এবং estimated days দেখায়; empty district validation error; checkout quote-এর সঙ্গে rate consistent।

### P2-12 — Bundle product

Priority: High

Steps: `Ryzen 5 Complete Gaming Setup Bundle` খুলুন এবং cart-এ যোগ করুন।

Expected: type `BUNDLE`, child items visible/represented, available quantity child product stock
ও bundle limit-এর minimum; unavailable child হলে bundle out of stock।

### P2-13 — Optional end-to-end checkout

Priority: Critical before client demo

শুধু disposable/demo database-এ:

1. Customer দিয়ে sign in করুন।
2. In-stock variant cart-এ দিন।
3. address/area পূরণ করে shipping quote নিন।
4. `DEMO10` apply করুন।
5. Available test/COD gateway নির্বাচন করে order complete করুন। Real gateway/payment ব্যবহার করবেন না।
6. `/ecommerce/user/orders` এবং admin order view পরীক্ষা করুন।

Expected: order একবার তৈরি, totals server calculation-এর সঙ্গে match, inventory/coupon usage একবার
decrement/claim, customer শুধু নিজের order দেখে, admin operational view পায়। Refresh/back করলে
duplicate order হবে না। Test শেষে DB reset/reseed করুন।

## 6. Responsive and browser matrix

কমপক্ষে নিচের matrix চালান:

| Browser/viewport | Required cases |
| --- | --- |
| Chrome latest, 1440px | P1-02, P1-05, P1-07, P2-02–P2-08 |
| Chrome latest, 390x844 | P1-03, P1-06, P2-02–P2-07 |
| Edge latest, 1440px | Storefront/PDP/cart smoke |
| Firefox latest, 1440px | Catalog filter, PDP variant, cart smoke |

প্রতিটি run-এ horizontal overflow, clipped menu/modal, layout shift, broken image এবং Console
error পরীক্ষা করুন।

## 7. Evidence template

প্রতিটি manual case-এর জন্য record রাখুন:

| Field | Value |
| --- | --- |
| Test ID | যেমন `P1-05` |
| Build/commit | Git SHA |
| Environment | Local / staging |
| Browser + viewport | যেমন Chrome, 1440x900 |
| Actual result | সংক্ষিপ্ত result |
| Status | Pass / Fail / Blocked |
| Evidence | Screenshot, Network response বা console log path |
| Bug reference | থাকলে issue ID |

## 8. Release acceptance rule

Phase 0–2 ready বলা যাবে যখন:

- `npm run verify:phases` pass
- production build pass
- সব Critical manual case pass
- High priority case-এ unresolved release blocker নেই
- browser Console-এ uncaught error নেই
- public API-তে internal cost/secret/private asset data নেই
- desktop এবং mobile main purchase journey pass
- test mutations production data-তে চালানো হয়নি
