# Product module testing manual

এই manual-টি শুধু **Product module** পরীক্ষা করার জন্য। এর মধ্যে admin panel-এর
category, brand, attribute, product, variant, stock, digital product, service
product ও bundle এবং storefront-এর product catalog, product details ও cart-এ
product যোগ করা অন্তর্ভুক্ত। Order, payment, coupon, review, Q&A, checkout এবং
অন্যান্য module এখন এই test-এর বাইরে।

> লক্ষ্য: নিচের test cases ধারাবাহিকভাবে শেষ করলে একটি product admin panel থেকে
> তৈরি হয়ে storefront ও cart পর্যন্ত ঠিকভাবে কাজ করছে কি না প্রমাণ করা যাবে।

## 1. Test result লেখার নিয়ম

প্রতিটি case শেষে এই format ব্যবহার করুন:

```text
Result: PASS / FAIL / BLOCKED
Actual result:
Evidence: screenshot filename অথবা Network request
Bug ID: প্রয়োজন হলে
Tester:
Date:
```

PASS দেওয়ার আগে case-এর সব Expected result মিলতে হবে। আংশিক মিললে PASS নয়।

## 2. Test শুরুর আগে

### 2.1 নিরাপত্তা ও environment

- শুধু local/demo database ব্যবহার করুন। Production database-এ seed বা delete
  test চালাবেন না।
- `.env`-এর secret screenshot বা report-এ রাখবেন না।
- Chrome DevTools খুলে রাখুন:
  - **Network**: `Preserve log` চালু করুন।
  - **Console**: নতুন JavaScript error হচ্ছে কি না দেখুন।
- Desktop test: অন্তত `1440 × 900`।
- Mobile storefront test: `390 × 844`।

### 2.2 Application প্রস্তুত করুন

```powershell
npm install
npx prisma generate
npx prisma migrate status
npm run verify:products
npm run dev
```

Expected:

- `verify:products` exit code `0`।
- Product security subset, Phase 1 ও Phase 2 product/storefront automated tests,
  lint এবং typecheck pass।
- app `http://localhost:3000`-এ চালু হয়।

Demo data প্রয়োজন হলে, **শুধু demo database-এ** চালান:

```powershell
npm run seed:storefront
```

সতর্কতা: full storefront seed non-demo catalog data archive করতে পারে।

### 2.3 Account ও routes

| Purpose | Email | Password |
| --- | --- | --- |
| Product admin | `admin@example.com` | `admin123` |
| Customer | `customer.one@storefront.demo` | `Demo123!` |

| Area | Route |
| --- | --- |
| Sign in | `/signin` |
| Admin products | `/admin/operations/products` |
| Admin bundles | `/admin/operations/products/bundles` |
| Admin categories | `/admin/management/categories` |
| Admin brands | `/admin/management/brands` |
| Stock management | `/admin/warehouse/stock` |
| Storefront products | `/ecommerce/products` |

### 2.4 এই run-এর unique test data

প্রতি test run-এ নতুন `RUN_ID` ব্যবহার করুন; উদাহরণ `20260818-A`। Product/category
soft-delete হলেও slug unique থাকে, তাই আগের নাম পুনরায় ব্যবহার করবেন না।

| Record | Test value |
| --- | --- |
| `RUN_ID` | `20260818-A` |
| Root category | `QA Tech 20260818-A` |
| Child category | `QA Accessories 20260818-A` |
| Brand | `QA Hardware 20260818-A` |
| Attribute 1 | `QA Color 20260818-A` |
| Attribute 2 | `QA Switch 20260818-A` |
| Simple product | `QA Wired Mouse 20260818-A` |
| Simple SKU | `QA-MOUSE-20260818-A` |
| Variant product | `QA Mechanical Keyboard 20260818-A` |
| Variant base SKU | `QA-KB-20260818-A` |
| Digital product | `QA Antivirus License 20260818-A` |
| Digital SKU | `QA-AV-20260818-A` |
| Service product | `QA PC Setup Service 20260818-A` |
| Service SKU | `QA-SVC-20260818-A` |
| Bundle | `QA Workstation Starter Bundle 20260818-A` |

সব screenshot-এর নাম case ID দিয়ে দিন, যেমন `P-CAT-01-created.png`।

### 2.5 Recommended execution plan

| Session | কী test করবেন | Cases |
| --- | --- | ---: |
| 1 | Access, dashboard, category, brand, attribute, simple ও variant product | 17 |
| 2 | Manage dialog, warehouse inventory, digital, service ও bundle | 12 |
| 3 | Storefront, cart, delete, security, error handling ও cleanup | 10 |
| **Total** | **Complete product lifecycle** | **39** |

এক বসায় করতে চাইলে document-এর Stage A থেকে I পর্যন্ত order বদলাবেন না। কিছু
negative/delete case আগের তৈরি data-এর উপর নির্ভর করে; সেই dependency সংশ্লিষ্ট
case-এ উল্লেখ আছে।

## 3. Stage A — access এবং product dashboard

### P-ACC-01 — Admin login ও product permission

- [ ] `/signin` খুলুন।
- [ ] admin account দিয়ে login করুন।
- [ ] sidebar থেকে **Operations → Products** খুলুন।
- [ ] `/admin/operations/products` URL নিশ্চিত করুন।

Expected:

- `Product Management` heading দেখা যায়।
- `Warehouse scope`, `Refresh`, `Attributes`, `Digital Assets`, `New Product`
  এবং `Bundles` controls দেখা যায়।
- Console-এ error এবং Network-এ failed request নেই।

### P-ACC-02 — Customer admin panel ব্যবহার করতে পারবে না

- [ ] admin থেকে logout করে customer account দিয়ে login করুন।
- [ ] address bar-এ `/admin/operations/products` লিখুন।
- [ ] একইভাবে categories, brands ও stock route চেষ্টা করুন।

Expected:

- customer product administration page ব্যবহার করতে পারে না এবং authorized
  dashboard/storefront-এ redirect হয়।
- কোনো product data edit/create/delete control দেখা যায় না।

তারপর admin account দিয়ে আবার login করুন।

### P-ADM-01 — Dashboard metrics ও filters

- [ ] Products page-এ `All warehouses` নির্বাচন করে `Refresh` চাপুন।
- [ ] search-এ একটি existing product লিখুন।
- [ ] Category, Type, Availability, Visibility, Stock State ও Sort একে একে বদলান।
- [ ] একাধিক filter একসঙ্গে ব্যবহার করুন।
- [ ] `Clear All Filters` চাপুন।

Expected:

- list selected filters অনুযায়ী বদলায় এবং active filter tags দেখা যায়।
- Type-এ Physical, Digital, Service, Bundle আছে।
- Stock State-এ In Stock, Low Stock, Out of Stock, Non-Physical আছে।
- clear করার পর search/filter default হয় এবং পূর্ণ list ফেরে।

### P-ADM-02 — Dedicated Activate/Deactivate action

- [ ] একটি Available product-এর `Deactivate` action চাপুন।
- [ ] confirmation-এর warning পড়ে প্রথমবার `Cancel` করুন।
- [ ] আবার `Deactivate` করে confirm করুন এবং Network-এর `PATCH` response রাখুন।
- [ ] `Unavailable` filter দিয়ে product খুঁজুন।
- [ ] product-এর action এখন `Activate` হয়েছে কি না দেখুন।
- [ ] অন্য tab-এ একই product edit করার পর stale tab থেকে action চালিয়ে দেখুন।
- [ ] শেষে `Activate` করে product restore করুন।

Expected:

- cancel করলে state বদলায় না; confirm request `200`।
- deactivated product-এ red `Unavailable` badge ও `Activate` action দেখা যায়।
- storefront/catalog/PDP থেকে product সরে যায়, active cart row সরানো হয় এবং নতুন
  cart/order request reject হয়; inventory ও historical orders অক্ষত থাকে।
- stale tab-এর request `409`; latest admin data reload হয় এবং blind overwrite হয় না।
- reactivation-এর পরে green `Available` badge, `Deactivate` action এবং stock rule
  অনুযায়ী storefront visibility ফিরে আসে।

## 4. Stage B — category, brand ও attribute master data

### P-CAT-01 — Root ও child category তৈরি

- [ ] `/admin/management/categories` খুলুন।
- [ ] `Add Root Category` চাপুন।
- [ ] Name-এ root category test value দিন; একটি tech image দিন; save করুন।
- [ ] নতুন root-এর child/add action থেকে child category test value তৈরি করুন।
- [ ] tree expand করে child দেখা যাচ্ছে কি না দেখুন।
- [ ] `Search categories...` দিয়ে root এবং child আলাদাভাবে খুঁজুন।

Expected:

- দুটো record success messageসহ তৈরি হয়।
- child সঠিক parent-এর নিচে থাকে; tree expand/collapse কাজ করে।
- search case-insensitive এবং সঠিক result দেখায়।

### P-CAT-02 — Category edit ও duplicate validation

- [ ] child category edit করে শেষে `Updated` যোগ করুন এবং save করুন।
- [ ] আবার edit করে মূল test name ফিরিয়ে দিন।
- [ ] একই parent-এর নিচে একই নাম দিয়ে আরেকটি category বানানোর চেষ্টা করুন।
- [ ] blank Name দিয়ে save করার চেষ্টা করুন।

Expected:

- edit-এর পর list/tree-তে নতুন নাম সঙ্গে সঙ্গে দেখা যায়।
- duplicate slug/name create হয় না; পরিষ্কার error দেখায়।
- blank required field save হয় না।

### P-CAT-03 — Category relation safety

- [ ] test child category-কে নিজের parent করার চেষ্টা করুন।
- [ ] root category-কে তার own descendant-এর নিচে নেওয়ার চেষ্টা করুন।
- [ ] product তৈরি হওয়ার পর ব্যবহৃত child category delete করার চেষ্টা করুন।

Expected production rule:

- self-parent ও circular hierarchy block হবে।
- product ব্যবহার করছে এমন category delete করার আগে system block করবে অথবা
  explicit safe reassignment চাইবে। Silent orphaning গ্রহণযোগ্য নয়।
- এর কোনোটি allow হলে case **FAIL** দিয়ে bug report করুন; seeded/real category
  দিয়ে এই destructive test করবেন না।

### P-BRAND-01 — Brand create, edit, search ও duplicate

- [ ] `/admin/management/brands` খুলুন।
- [ ] `Add Brand` চাপুন; test brand Name ও Logo দিন; save করুন।
- [ ] brand edit করে Logo/Name বদলান এবং result যাচাই করে মূল নাম ফিরিয়ে দিন।
- [ ] একই নামের brand আবার তৈরি করুন।

Expected:

- create/edit list-এ সঙ্গে সঙ্গে প্রতিফলিত হয়।
- logo preview ভাঙা নয়।
- duplicate create block হয় এবং usable error দেখায়।

### P-BRAND-02 — In-use brand delete safety

এই case product তৈরির পরে চালান।

- [ ] test product-এ ব্যবহৃত brand delete করার চেষ্টা করুন।

Expected production rule:

- warning/confirmationসহ delete block অথবা safe detach/reassignment হবে।
- storefront product broken relation বা 500 error তৈরি করবে না।
- confirmation ছাড়া in-use brand সরিয়ে দিলে **FAIL** লিখুন।

### P-ATTR-01 — Managed attributes ও values

- [ ] Products page থেকে `Attributes` খুলুন।
- [ ] attribute `QA Color <RUN_ID>` তৈরি করুন।
- [ ] values `Black` এবং `White` যোগ করুন।
- [ ] attribute `QA Switch <RUN_ID>` তৈরি করুন।
- [ ] values `Red` এবং `Blue` যোগ করুন।
- [ ] duplicate value এবং blank value যোগ করার চেষ্টা করুন।

Expected:

- দুই attribute ও চার unique value দেখা যায়।
- duplicate/blank value তৈরি হয় না।
- modal close/reopen করার পর data থাকে।

## 5. Stage C — simple physical product

### P-SIMPLE-01 — Required-field validation

- [ ] `/admin/operations/products` → `New Product` চাপুন।
- [ ] কোনো value না দিয়ে submit করুন।
- [ ] Name/Category দিয়ে negative sell price দিন।
- [ ] negative stock এবং negative emergency threshold চেষ্টা করুন।

Expected:

- Name, Category ও Base Sell Price ছাড়া submit হয় না।
- negative price, stock বা threshold গ্রহণ করে না।
- invalid request database-এ partial product তৈরি করে না।

### P-SIMPLE-02 — Product তৈরি

`New Product` form-এ দিন:

| Field | Value |
| --- | --- |
| Name | `QA Wired Mouse <RUN_ID>` |
| Description | `QA-only wired USB mouse for product testing.` |
| Short Description | `USB mouse, 1200 DPI` |
| Type | `PHYSICAL` |
| Product SKU | `QA-MOUSE-<RUN_ID>` |
| Base Sell Price | `1500` |
| Base Purchase Price | `900` |
| Original Price | `1800` |
| Currency | `BDT` |
| Category | test child category |
| Brand | test brand |
| Enable Variants | unchecked |
| Simple Product Stock | `12` |
| Emergency Stock Threshold | `3` |
| Weight | `0.15` |
| Dimensions | `12 × 7 × 4 cm` |
| Available | checked |
| Featured | unchecked |
| Main Image | valid JPG/PNG |
| Gallery | two valid images |

- [ ] `Add Product` চাপুন।
- [ ] Network-এ create request status সংরক্ষণ করুন।

Expected:

- request `201`; success toast; modal বন্ধ হয়।
- product card-এ correct name, category, brand, type, price ও stock `12` দেখা যায়।
- initial variant/SKU তৈরি হয় এবং stock warehouse stock-এ sync হয়।
- uploaded main/gallery image load হয়।

### P-SIMPLE-03 — Duplicate slug/SKU safety

- [ ] একই exact Name দিয়ে আরেকটি product create করুন।
- [ ] আলাদা Name কিন্তু একই SKU দিয়ে আরেকটি product create করুন।

Expected:

- duplicate slug এবং duplicate SKU দুটোই block হয়।
- error বোঝা যায় এবং duplicate/partial record থাকে না।

### P-SIMPLE-04 — Edit ও immediate refresh

- [ ] product card-এর `Edit` চাপুন।
- [ ] Base Sell Price `1600`, Original Price `1900`, Featured checked এবং Short
  Description update করুন।
- [ ] `Update Product` চাপুন।
- [ ] browser hard refresh করুন এবং search দিয়ে product খুঁজুন।

Expected:

- request `200`; updated values refresh-এর পরও থাকে।
- admin card price/featured state update হয়।
- storefront-এ পুরোনো cached price না থেকে নতুন price দেখা যায়।

## 6. Stage D — variant product

### P-VAR-01 — Variant matrix generation

- [ ] `New Product` খুলুন।
- [ ] Name `QA Mechanical Keyboard <RUN_ID>`, Type `PHYSICAL`, Product SKU
  `QA-KB-<RUN_ID>`, Sell Price `4500`, Purchase Price `3000`, Category ও Brand দিন।
- [ ] `Enable Variants` check করুন।
- [ ] first Option-এ managed `QA Color <RUN_ID>` select করে Black ও White দিন।
- [ ] `Add Variant Option` দিয়ে managed `QA Switch <RUN_ID>` select করে Red ও Blue দিন।

Expected:

- `Generated Variant Combinations`-এ ঠিক 4 row হয়:
  Black/Red, Black/Blue, White/Red, White/Blue।
- প্রতিটি generated SKU unique এবং base SKU থেকে তৈরি।
- কোনো combination duplicate নয়।

### P-VAR-02 — Per-variant price, stock, media ও active state

চার row-তে এই data দিন:

| Combination | Sell | Purchase | Stock | Emergency |
| --- | ---: | ---: | ---: | ---: |
| Black / Red | 4500 | 3000 | 8 | 2 |
| Black / Blue | 4700 | 3150 | 5 | 2 |
| White / Red | 4600 | 3050 | 3 | 2 |
| White / Blue | 4800 | 3200 | 0 | 2 |

- [ ] Black ও White option value-তে আলাদা color image upload করুন।
- [ ] অন্তত একটি row-তে `Upload Gallery` দিয়ে image দিন।
- [ ] সব row active রেখে product create করুন।

Expected:

- product তৈরি হয়; total stock `16`।
- product `Low Stock` নয় যদি aggregate/selected warehouse rule threshold অতিক্রম করে।
- variant values, prices, stocks ও images reload-এর পর থাকে।
- barcode এবং QR data প্রতিটি variant-এর জন্য generate হয়।

### P-VAR-03 — Variant validation ও matrix changes

নতুন temporary variant product form-এ পরীক্ষা করুন, save করার দরকার নেই:

- [ ] Enable Variants on রেখে Product SKU blank করুন।
- [ ] option value না দিয়ে submit করুন।
- [ ] generated row-তে negative price/stock দিন।
- [ ] option value remove করে combination count বদলায় কি না দেখুন।

Expected:

- base SKU, option/value ও valid row ছাড়া submit block হয়।
- negative value block হয়।
- value remove করলে stale combination বাদ যায় এবং remaining matrix সঠিক হয়।

## 7. Stage E — Manage dialog, inventory ও codes

### P-REL-01 — Variants tab ও product codes

- [ ] keyboard product card-এর `Manage` চাপুন।
- [ ] `Variants` tab-এ 4 variant এবং তাদের SKU/Price/Stock/Options দেখুন।
- [ ] একটি variant select করে `Print Selected` ব্যবহার করুন।
- [ ] একটি variant-এর `Sticker` action খুলুন।
- [ ] `Regenerate` করে barcode/QR বদলায় এবং reload-এর পর থাকে কি না দেখুন।

Expected:

- barcode ও QR empty নয়; print/sticker view usable।
- regenerate request success এবং code collision নেই।
- Console error নেই।

### P-REL-02 — Variant edit/add validation

- [ ] একটি variant `Edit` করে price বদলান, save করুন এবং restore করুন।
- [ ] `Add Variant` দিয়ে unique SKU ও option values সহ একটি row add করুন।
- [ ] duplicate SKU দিয়ে add করার চেষ্টা করুন।

Expected:

- valid edit/add list ও storefront selector-এ প্রতিফলিত হয়।
- duplicate SKU block হয়; existing variant ক্ষতিগ্রস্ত হয় না।
- test শেষে extra variant delete করুন।

### P-REL-03 — Product attributes

- [ ] `Attributes` tab খুলুন।
- [ ] একটি managed attribute নির্বাচন করে Value দিন এবং add করুন।
- [ ] একই attribute/value আবার add করুন।
- [ ] added row delete করুন।

Expected:

- unique attribute যোগ/মোছা যায়; reload-এর পর state ঠিক থাকে।
- duplicate relation তৈরি হয় না।

### P-INV-01 — Warehouse stock calculation

- [ ] `Inventory` tab-এ keyboard variant select করুন।
- [ ] default warehouse Quantity `10` দিন এবং `Save` চাপুন।
- [ ] Reserved value লক্ষ্য করুন।

Expected:

- Available = `max(0, Quantity - Reserved)`।
- save-এর পর variant stock, admin card total এবং storefront availability sync হয়।
- stock অন্য variant-এ ভুলভাবে যোগ হয় না।

### P-INV-02 — Dedicated Stock Management

- [ ] `/admin/warehouse/stock` খুলুন।
- [ ] `Search Physical Products` দিয়ে keyboard খুঁজে Product select করুন।
- [ ] Attribute, Attribute Value ও Variant filters দিয়ে Black/Red variant নিন।
- [ ] Product Threshold `3` এবং Variant Threshold `2` save করুন।
- [ ] default warehouse Quantity `1` save করুন।

Expected:

- product/variant counters সঠিক।
- Quantity `1`, Reserved `0` হলে Available `1`।
- variant `Low Stock`; quantity `0` করলে `Out of Stock`।
- Products page-এর warehouse-specific metric/filter একই state দেখায়।

### P-INV-03 — Invalid stock ও inventory log

- [ ] stock Quantity-তে negative সংখ্যা save করার চেষ্টা করুন।
- [ ] Quantity-এর চেয়ে Reserved বেশি করার কোনো exposed path থাকলে চেষ্টা করুন।
- [ ] valid Quantity `8` restore করুন।
- [ ] product `Manage` → `Inventory Logs` খুলুন।

Expected:

- negative quantity এবং invalid reservation গ্রহণ হয় না।
- log-এ Date, Change, Variant, Warehouse এবং Reason দেখা যায়।
- stock restore-এর পর storefront-এ variant আবার In Stock।

### P-INV-04 — Non-physical inventory separation

Digital/Service products তৈরি করার পর:

- [ ] তাদের `Manage` → `Inventory` খুলুন।
- [ ] Stock Management search-এ তাদের খুঁজুন।

Expected:

- dialog বলে inventory শুধু PHYSICAL product-এর জন্য।
- dedicated Stock Management শুধু physical products দেখায়।
- digital/service product-এ fake stock row তৈরি হয় না।

## 8. Stage F — digital ও service product

### P-DIG-01 — Digital asset ও digital product

- [ ] Products page → `Digital Assets` খুলুন।
- [ ] Title `QA Antivirus File <RUN_ID>` দিন।
- [ ] demo-safe private file upload অথবা configured File URL দিন; save করুন।
- [ ] `New Product` দিয়ে `QA Antivirus License <RUN_ID>`, Type `DIGITAL`, unique
  SKU, price `2500`, test category/brand ও Digital Asset select করে create করুন।

Expected:

- digital product তৈরি হয় এবং Non-Physical filter-এ দেখা যায়।
- physical Stock input প্রয়োজন হয় না।
- storefront public request/source-এ private file URL, storage key বা digital
  asset ID expose হয় না। Purchase ছাড়া private file download করা যায় না।

### P-SVC-01 — Service product ও service slots

- [ ] `New Product` দিয়ে Name `QA PC Setup Service <RUN_ID>`, Type `SERVICE`,
  unique SKU, price `2000`, Duration `60`, Location `Dhaka Service Center`,
  optional online link, category/brand দিয়ে create করুন।
- [ ] product-এর `Manage` খুলে `Service Slots` tab নিন।
- [ ] Start/End, Capacity `2`, Timezone `Asia/Dhaka`, Location ও Notes দিয়ে
  `Add Slot` চাপুন।
- [ ] End সময় Start-এর আগে দিয়ে আরেকটি slot চেষ্টা করুন।

Expected:

- service product Non-Physical; inventory stock চায় না।
- valid slot list-এ Start, End, Capacity `2`, Booked `0` দেখায়।
- invalid time range block হয়।
- slot delete করলে reload-এর পর ফিরে আসে না।

## 9. Stage G — bundle product

### P-BUNDLE-01 — Bundle create ও capacity

- [ ] Products page → `Bundles` → `Create Bundle` খুলুন।
- [ ] Bundle Name `QA Workstation Starter Bundle <RUN_ID>` দিন।
- [ ] test category, brand, default Warehouse, Available ও Featured নির্বাচন করুন।
- [ ] `Bundle Products`-এ mouse quantity `2` এবং keyboard-এর in-stock variant
  quantity `1` add করুন।
- [ ] component stock যদি mouse `12` ও keyboard `8` হয়, expected maximum
  buildable = `min(floor(12/2), floor(8/1)) = 6` লিখে রাখুন।
- [ ] Bundle Stock Limit `5` দিন।
- [ ] percentage/fixed discount দিয়ে Final Bundle Price component total-এর নিচে
  রাখুন; image দিন; `Create Bundle` চাপুন।

Expected:

- `Bundle Stock Summary`-এর Max Buildable `6` এবং effective stock `5`।
- create success; bundle list-এ correct price, saving, stock, Active ও Featured।
- storefront catalog/PDP-তে bundle এবং included items দেখা যায়।

### P-BUNDLE-02 — Bundle stock guard

- [ ] Bundle Stock Limit maximum buildable-এর চেয়ে বেশি দিন।
- [ ] out-of-stock White/Blue variant bundle-এ add করার চেষ্টা করুন।
- [ ] duplicate component অথবা zero quantity চেষ্টা করুন।

Expected:

- stock limit build capacity-এর বেশি save হয় না।
- out-of-stock item সম্পর্কে clear warning হয়।
- zero/invalid quantity এবং accidental duplicate line block হয়।

### P-BUNDLE-03 — Component stock change propagation

- [ ] keyboard component stock `8` থেকে `2` করুন।
- [ ] bundle list/detail refresh করুন।
- [ ] stock আবার `8` restore করুন।

Expected:

- maximum/effective bundle stock component stock অনুযায়ী কমে।
- stale bundle availability দিয়ে oversell সম্ভব নয়।
- restore-এর পর capacity আবার সঠিক হয়।

## 10. Stage H — storefront product journey

Incognito window ব্যবহার করুন যাতে admin session/cache ফলাফলকে প্রভাবিত না করে।

### P-SF-01 — Admin-to-storefront visibility ও cache

- [ ] `/ecommerce/products` খুলুন।
- [ ] search-এ `QA Wired Mouse <RUN_ID>` লিখুন; desktop-এ 450ms অপেক্ষা করুন।
- [ ] page reload/server restart ছাড়াই updated ৳1,600 price দেখুন।

Expected:

- desktop filter নিজে update হয়; `Filters update automatically` লেখা থাকে।
- URL-এ `q` থাকে; matching product ছাড়া অন্য product থাকে না।
- admin create/edit storefront-এ stale cache ছাড়াই দেখা যায়।

### P-SF-02 — Category, brand, type, price ও stock filters

- [ ] test Category select করুন।
- [ ] test Brand checkbox দিন।
- [ ] Type `Physical`; Price `1500–5000`; `In stock only` দিন।
- [ ] Featured filter ও Sort `Price: Low to High/High to Low` পরীক্ষা করুন।
- [ ] একেকটি active filter chip-এর `×` চাপুন; শেষে `Clear all` চাপুন।

Expected:

- checkbox/select সঙ্গে সঙ্গে apply; কোনো desktop Apply button প্রয়োজন নেই।
- URL query, active chips, result count ও product list পরস্পর consistent।
- price order numeric; out-of-stock variant/product in-stock filter-এ ভুলভাবে আসে না।
- clear all clean `/ecommerce/products` URL ও full catalog ফেরায়।

### P-SF-03 — Mobile filter UX

- [ ] viewport `390 × 844` করুন।
- [ ] `Filters` → `Show / hide` খুলুন।
- [ ] কয়েকটি filter বদলান; result সঙ্গে সঙ্গে page jump করবে না।
- [ ] `Show products` চাপুন।

Expected:

- mobile-এ explicit `Show products` button আছে; desktop Apply button নেই।
- submit-এর পর drawer বন্ধ, URL update ও filtered results দেখা যায়।
- active-filter count এবং clear link কাজ করে; horizontal overflow নেই।

### P-SF-04 — Product details data

- [ ] mouse product card খুলুন।
- [ ] name, main/gallery images, sell/original price, discount, stock, category,
  brand, Description ও Specifications মিলিয়ে দেখুন।
- [ ] page refresh ও direct URL open করুন।

Expected:

- admin-এর public fields সঠিক; image broken নয়; direct URL `200`।
- Base Purchase Price/cost, internal digital asset ID, barcode/QR এবং internal
  threshold public HTML/API payload-এ নেই।

### P-SF-05 — Variant selector

- [ ] keyboard PDP খুলুন।
- [ ] Black/Red, Black/Blue, White/Red ও White/Blue একে একে select করুন।

Expected:

- selected combination অনুযায়ী price, image, SKU ও stock state বদলায়।
- White/Blue stock `0` হলে `Out of Stock` এবং purchase action disabled।
- incomplete/invalid selection cart-এ যায় না।

### P-SF-06 — Add to cart ও quantity safety

- [ ] in-stock mouse একবার cart-এ দিন।
- [ ] in-stock keyboard variant cart-এ দিন।
- [ ] একই variant আবার add করুন এবং quantity বাড়ান।
- [ ] available stock-এর চেয়ে বেশি quantity করার চেষ্টা করুন।
- [ ] out-of-stock White/Blue add করার চেষ্টা করুন।

Expected:

- cart line product+variant identity ধরে; আলাদা variants merge হয় না।
- same variant expectedভাবে quantity বাড়ায়।
- unit price ও line total correct; quantity stock-এর বেশি হয় না।
- out-of-stock item cart-এ যায় না।

### P-SF-07 — Unavailable ও deleted product

- [ ] admin-এ mouse product-এর dedicated `Deactivate` action confirm করুন।
- [ ] storefront list, search ও direct PDP URL পরীক্ষা করুন।
- [ ] admin-এর `Activate` action দিয়ে restore করুন।

Expected:

- unavailable product public catalog/search থেকে বাদ যায় এবং direct purchase করা
  যায় না।
- restore করলে cache invalidation-এর পরে আবার দেখা যায়।

## 11. Stage I — delete, error ও API safety

### P-DEL-01 — Product soft delete

- [ ] নতুন disposable product `QA Delete Me <RUN_ID>` তৈরি করুন।
- [ ] product card-এর delete action চাপুন এবং confirmation cancel করুন।
- [ ] আবার delete করে confirm করুন।
- [ ] admin search, storefront search এবং direct PDP পরীক্ষা করুন।
- [ ] চাইলে `npx prisma studio` দিয়ে record inspect করুন।

Expected:

- cancel করলে কিছু বদলায় না।
- confirm request `200`; product admin active list ও storefront থেকে বাদ যায়।
- database record hard-delete নয়; `deleted = true` থাকে।

Known UI check: dialog যদি “permanently delete” বলে, কিন্তু API soft-delete করে,
তাহলে wording mismatch আলাদা UX bug হিসেবে লিখুন।

### P-SEC-01 — Product mutation permission

- [ ] DevTools Network থেকে একটি product create/update/delete request-এর URL,
  method ও JSON body note করুন; secret/cookie copy করবেন না।
- [ ] logout/customer session-এ একই mutation করার চেষ্টা করুন।

Expected:

- unauthenticated request `401`; authenticated but unauthorized request `403`।
- database-এ কোনো mutation হয় না।
- public product response-এ cost/private fields থাকে না।

### P-ERR-01 — Upload ও server error handling

- [ ] image field-এ non-image/oversized file দিন।
- [ ] Network offline করে একটি save চেষ্টা করুন, তারপর online করুন।
- [ ] double-click করে একই product দুবার submit করার চেষ্টা করুন।

Expected:

- invalid file clear errorসহ reject; executable upload হয় না।
- network failure-এ modal data হারায় না এবং retry করা যায়।
- submit চলাকালে button disabled/loading; duplicate record তৈরি হয় না।
- Console-এ uncaught exception নয়।

## 12. Cleanup

নিচের order-এ শুধু এই `RUN_ID`-এর test data সরান:

1. Cart থেকে test items সরান।
2. Test bundle delete/deactivate করুন।
3. Service slots ও disposable relations সরান।
4. Digital, Service, Variant ও Simple test products soft-delete করুন।
5. Test digital asset সরান, যদি অন্য record ব্যবহার না করে।
6. Test attribute values/attributes সরান, যদি অন্য product ব্যবহার না করে।
7. Test brand সরান।
8. Child category, তারপর root category সরান।

কোনো seeded বা real client data delete করবেন না। Cleanup শেষে admin search এবং
storefront search-এ `<RUN_ID>` লিখে কোনো active test product না থাকার প্রমাণ রাখুন।

## 13. Final product sign-off

সব box check এবং evidence review করে sign-off দিন:

| Gate | Pass condition | Result |
| --- | --- | --- |
| Automated | `npm run verify:products` exit `0` | |
| Access | customer admin product CRUD করতে পারে না | |
| Masters | category, brand, attribute validation safe | |
| CRUD | simple ও variant product create/edit/soft-delete safe | |
| Inventory | warehouse stock, thresholds ও logs consistent | |
| Non-physical | digital/service stock থেকে পৃথক ও private data protected | |
| Bundle | component capacity অনুযায়ী stock ও price | |
| Storefront | catalog/filter/PDP/cart admin data-এর সঙ্গে consistent | |
| Responsive | desktop auto-filter এবং mobile Show products দুটোই correct | |
| Cleanup | test records active catalog-এ নেই | |

Release decision:

```text
Product module: READY / NOT READY
Open blocker bugs:
Approved by:
Approval date:
```

Product module `READY` হবে শুধু যখন সব critical case PASS, automated gate green,
কোনো permission/data-leak/negative-stock/oversell issue নেই এবং blocker bug শূন্য।
