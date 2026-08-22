# সিকিউরিটি হার্ডেনিং প্ল্যান — Clerk + Cloudflare + SSLCommerz

**তারিখ:** 2026-08-22
**প্রেক্ষাপট:** প্রজেক্ট নতুন করে redesign হচ্ছে, এখনো deploy হয়নি → **breaking change করা যাবে, কোনো migration constraint নেই**
**লক্ষ্য:** Cloudflare-এ হোস্ট, SSLCommerz লাইভ পেমেন্ট, সর্বোচ্চ নিরাপত্তা

> এই ডকুমেন্টের প্রতিটি দাবি কোডবেস স্ক্যান করে যাচাই করা। যা ঠিক আছে তাও লেখা হয়েছে, যাতে অপ্রয়োজনে ভাঙা না হয়।

---

## ০. সারসংক্ষেপ — আপনার কোডের নিরাপত্তা মান

**সুখবর: এই কোডবেসে ইতিমধ্যে গুরুত্বপূর্ণ নিরাপত্তা কাজ হয়েছে।** সাধারণ e-commerce প্রজেক্টে যে ভুলগুলো থাকে, তার অনেকগুলো এখানে নেই।

### ✅ যা ইতিমধ্যে সঠিক আছে (ভাঙবেন না)

| ক্ষেত্র | অবস্থা | প্রমাণ |
|---|---|---|
| **পেমেন্ট amount যাচাই** | ✅ সার্ভার-সাইডে SSLCommerz-এর কাছে `val_id` দিয়ে যাচাই; amount + currency + tran_id তিনটাই মিলিয়ে দেখা হয় | [lib/sslcommerz.ts:280-288](../lib/sslcommerz.ts#L280-L288) |
| **SQL injection** | ✅ **ঝুঁকি নেই** — সব `$queryRawUnsafe` কল `$1` bound parameter ব্যবহার করে | [cart/route.ts:42](../app/api/cart/route.ts#L42), [orders/route-core.ts:82](../app/api/orders/route-core.ts#L82) |
| **গেটওয়ে ক্রেডেনশিয়াল লিক** | ✅ `redactGatewayData()` দিয়ে `storePassword` সব response থেকে বাদ | [api/payment/route.ts:35](../app/api/payment/route.ts#L35) |
| **পাবলিক gateway endpoint** | ✅ শুধু whitelist করা ফিল্ড ফেরত দেয় | [api/payment-gateways/route.ts](../app/api/payment-gateways/route.ts) |
| **ফাইল আপলোড** | ✅ Magic-byte যাচাই (extension + MIME + content signature), path traversal ব্লক, নাম randomize | [lib/upload-security.ts](../lib/upload-security.ts) |
| **Rate limiting** | ✅ Upstash Redis দিয়ে distributed; **production-এ কনফিগার না থাকলে throw করে** — চমৎকার fail-safe | [lib/request-security.ts:36](../lib/request-security.ts#L36) |
| **গেস্ট পেমেন্ট টোকেন** | ✅ HMAC-SHA256 + expiry + `timingSafeEqual` | [lib/sslcommerz.ts:130-148](../lib/sslcommerz.ts#L130-L148) |
| **Order IDOR** | ✅ ownership + permission দুটোই যাচাই | [api/orders/[id]/route.ts:86](../app/api/orders/[id]/route.ts#L86) |
| **Cron endpoint** | ✅ ৬টি cron রুটেই `CRON_SECRET` যাচাই | `app/api/cron/**` |
| **`.env` git hygiene** | ✅ `.env*` ignored, শুধু `.env.example` tracked | [.gitignore:34](../.gitignore#L34) |
| **নিরাপত্তা টেস্ট** | ✅ ৯টি টেস্ট আছে (`phase0-security.test.mjs`) | কুপন cap, upload যাচাই, rate limit |

**অর্থাৎ:** আপনার মূল দুশ্চিন্তা (পেমেন্ট নিরাপত্তা) ইতিমধ্যে ভালো অবস্থায়। নিচের কাজগুলো এর উপরে **বাড়তি স্তর**।

---

## ১. 🔴 গুরুতর — লাইভে যাওয়ার আগে অবশ্যই ঠিক করতে হবে

### ১.১ Stored XSS — ব্লগ ও নিউজলেটার কনটেন্ট

**সমস্যা:** ব্লগের HTML কাঁচা অবস্থায় সংরক্ষিত হয় এবং কাঁচা অবস্থায় render হয়।

```ts
// app/api/blog/route.ts:148 — কোনো sanitization নেই
content: content || '',
```
```tsx
// components/admin/blog/BlogDetails.tsx:447
dangerouslySetInnerHTML={{ __html: blog.content }}
```

**আক্রমণ:** ব্লগ লেখার অনুমতি আছে এমন কেউ (বা আপলোড API দুর্বল হলে) `<script>` ঢুকিয়ে দিলে সেটি **অ্যাডমিনের ব্রাউজারে** চলবে → সেশন hijack → পুরো প্যানেল দখল।

আপনার প্রজেক্টে TinyMCE + Jodit রিচ-টেক্সট এডিটর আছে, তাই HTML সংরক্ষণ করতেই হবে — কিন্তু **সার্ভার-সাইডে sanitize করে**।

**সমাধান:**
- সংরক্ষণের সময় (`api/blog`, `api/newsletter`) `isomorphic-dompurify` দিয়ে sanitize — allowlist ট্যাগ/অ্যাট্রিবিউট সহ
- render-এর সময়ও দ্বিতীয় স্তরের sanitize (defense in depth)
- `dompurify` ইতিমধ্যে `package.json`-এ আছে, শুধু সঠিক জায়গায় ব্যবহার হচ্ছে না

> নোট: `JSON.stringify(jsonLd)` ব্যবহারকারী `dangerouslySetInnerHTML` গুলো (SEO structured data) ঝুঁকিপূর্ণ নয়, তবে `<`/`>` escape করা ভালো অভ্যাস।

---

### ১.২ CSP (Content-Security-Policy) হেডার নেই

[next.config.ts:112-125](../next.config.ts#L112-L125)-এ ভালো হেডার আছে (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) — **কিন্তু CSP নেই**।

CSP হলো XSS-এর বিরুদ্ধে **শেষ প্রতিরক্ষা**। §১.১-এ কোনো ফাঁক থেকে গেলেও CSP স্ক্রিপ্ট চলা আটকাবে।

**সমাধান:** nonce-ভিত্তিক CSP। Clerk, SSLCommerz redirect, TinyMCE — সবার জন্য allowlist লাগবে, তাই সাবধানে করতে হবে। প্রথমে `Content-Security-Policy-Report-Only` মোডে চালিয়ে কী ভাঙে দেখে নিতে হবে, তারপর enforce।

---

### ১.৩ HSTS হেডার নেই

Cloudflare-এ HTTPS থাকবে, কিন্তু `Strict-Transport-Security` হেডার ছাড়া প্রথম রিকোয়েস্টে downgrade আক্রমণ সম্ভব।

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

> সতর্কতা: একবার `preload` দিলে সহজে ফেরা যায় না। ডোমেইন চূড়ান্ত হলে তবেই preload।

---

### ১.৪ SSLCommerz ক্রেডেনশিয়াল ডেটাবেসে প্লেইনটেক্সটে

`storeId` / `storePassword` `Payment.paymentGatewayData` JSON কলামে **এনক্রিপশন ছাড়া** থাকে ([lib/sslcommerz.ts:252-253](../lib/sslcommerz.ts#L252-L253))।

API লেয়ার ঠিকভাবে redact করে (ভালো), কিন্তু DB dump, backup ফাঁস, বা কোনো SQL-পড়া bug হলে **লাইভ পেমেন্ট ক্রেডেনশিয়াল** ফাঁস হবে।

**সমাধান (দুটি বিকল্প):**

| বিকল্প | সুবিধা | অসুবিধা |
|---|---|---|
| **ক) env var-এ সরানো** (সুপারিশ) | সবচেয়ে সহজ ও নিরাপদ; Cloudflare secrets-এ থাকবে | একাধিক গেটওয়ে কনফিগ করা যাবে না |
| **খ) DB-তে AES-256-GCM এনক্রিপ্ট** | বহু-গেটওয়ে সমর্থন থাকবে | key management লাগবে |

যেহেতু redesign হচ্ছে এবং সাধারণত একটাই SSLCommerz অ্যাকাউন্ট থাকে — **বিকল্প (ক)** সুপারিশ করছি। `.env.example`-এ এখন SSLCommerz কী নেই, সেটাও যোগ করতে হবে।

---

## ২. 🟠 গুরুত্বপূর্ণ — Cloudflare + Clerk-এ যাওয়ার সময়

### ২.১ `proxy.ts`-এর session fetch (নিরাপত্তা + পারফরম্যান্স)

[proxy.ts:1929](../proxy.ts#L1929) প্রতিটি সুরক্ষিত রিকোয়েস্টে নিজের কাছেই HTTP কল করে:

```ts
const response = await fetch(new URL("/api/auth/session", request.url), {
  headers: { cookie: request.headers.get("cookie") || "" },
});
```

**সমস্যা:**
1. Clerk-এ গেলে এই endpoint থাকবে না → **২৬৮টি permission rule একসাথে ভেঙে পড়বে**
2. প্রতি পেজ লোডে বাড়তি round-trip — Cloudflare Workers-এ এটি বেশি ব্যয়বহুল
3. fetch ব্যর্থ হলে `catch` করে `session = null` → **fail-closed** (ভালো), কিন্তু নেটওয়ার্ক সমস্যায় বৈধ ইউজারও আটকে যাবে

**সমাধান:** `clerkMiddleware()` দিয়ে session claims থেকে সরাসরি পড়া — কোনো নেটওয়ার্ক কল নয়। বিস্তারিত [clerk-migration-plan.md §৬](./clerk-migration-plan.md)-এ।

---

### ২.২ `proxy.ts`-এর নিরাপত্তা মডেল — allowlist না denylist?

বর্তমান যুক্তি:
```ts
if (pathname.startsWith("/api/") && (!matchedApiRule || rule.permissions.length === 0)) {
  return NextResponse.next();   // ← কোনো rule না মিললে ঢুকতে দেয়
}
```

**এটি denylist** — অর্থাৎ নতুন API রুট বানালে, সেটি `apiPermissionRules`-এ যোগ করতে ভুলে গেলে **স্বয়ংক্রিয়ভাবে অরক্ষিত** থাকবে।

প্রতিটি route.ts-এ আলাদা করে `getServerSession()` চেক আছে (defense in depth, ভালো), তাই এটি সরাসরি ছিদ্র নয়। কিন্তু ২৬৮টি rule হাতে রক্ষণাবেক্ষণ করা ভঙ্গুর।

**সুপারিশ:** redesign-এর সুযোগে **fail-closed** করা — `/api/*` ডিফল্টে সুরক্ষিত, শুধু স্পষ্টভাবে ঘোষিত public রুট (`/api/webhooks/clerk`, `/api/sslcommerz/ipn`, storefront read) খোলা। এটি বড় পরিবর্তন, কিন্তু deploy হয়নি বলে **এখনই করার সঠিক সময়**।

---

### ২.৩ SSLCommerz IPN — Cloudflare-এ পৌঁছাবে তো?

[app/api/sslcommerz/ipn/route.ts](../app/api/sslcommerz/ipn/route.ts) SSLCommerz-এর সার্ভার থেকে সরাসরি POST পায়। এটি অবশ্যই:
- `proxy.ts` matcher-এ **public** থাকতে হবে (নাহলে auth-এ আটকে যাবে)
- Cloudflare Bot Fight Mode / WAF এ **whitelist** করতে হবে — নাহলে Cloudflare বৈধ IPN ব্লক করে দেবে → **টাকা কেটে নেওয়া হবে কিন্তু অর্ডার confirm হবে না**
- SSLCommerz-এর IP রেঞ্জ থেকে এলে তবেই গ্রহণ (বাড়তি স্তর)

> ⚠️ এটি লাইভে যাওয়ার আগে **অবশ্যই sandbox দিয়ে end-to-end টেস্ট** করতে হবে। IPN নীরবে ব্যর্থ হওয়া e-commerce-এ সবচেয়ে ব্যয়বহুল bug।

বর্তমানে IPN রুটে rate limit নেই (init রুটে আছে) — যোগ করা উচিত, তবে উদারভাবে, যাতে বৈধ retry ব্লক না হয়।

---

### ২.৪ Cloudflare Workers-এ Prisma

সাধারণ Prisma client Workers-এ চলে না। **Hyperdrive + driver adapter** বা **Prisma Accelerate** লাগবে।

নিরাপত্তা কোণ: Hyperdrive ব্যবহার করলে DB credential Cloudflare-এ থাকবে, এবং DB-কে শুধু Cloudflare থেকে অ্যাক্সেসযোগ্য রাখা যাবে (IP allowlist) — এটি নিরাপত্তার জন্য **ভালো**।

`serverExternalPackages: ['fs', 'path', 'os']` ([next.config.ts:156](../next.config.ts#L156)) Workers-এ কাজ করবে না — পুনর্বিবেচনা লাগবে।

---

### ২.৫ ফাইল আপলোড স্টোরেজ

`@vercel/blob` ব্যবহার হচ্ছে ([BLOB_READ_WRITE_TOKEN](../.env.example))। Cloudflare-এ গেলে **R2**-এ সরানো যুক্তিসঙ্গত।

নিরাপত্তা শর্ত:
- ব্যক্তিগত ফাইল (investor KYC, delivery proof, payment screenshot) **কখনোই পাবলিক bucket-এ নয়** — signed URL দিয়ে
- কোডে ইতিমধ্যে `createUploadAccessToken` / `verifyUploadAccessToken` আছে ✅ — R2-তেও এই প্যাটার্ন রাখতে হবে
- আপলোড করা ফাইল **কখনো** `Content-Type` হিসেবে `text/html` দিয়ে serve করা যাবে না (stored XSS) → R2-তে `Content-Disposition: attachment` + আলাদা সাবডোমেইন

---

## ৩. 🟡 উন্নতি — যা করলে ভালো হয়

| # | বিষয় | কেন |
|---|---|---|
| ৩.১ | **Clerk-এ Bot protection + MFA** চালু | অ্যাডমিন অ্যাকাউন্টে MFA বাধ্যতামূলক করা উচিত |
| ৩.২ | **Cloudflare WAF + Rate limiting** | অ্যাপ-লেভেল rate limit-এর আগে edge-এ ব্লক (সস্তা) |
| ৩.৩ | **Cloudflare Turnstile** | signup/contact/review ফর্মে bot ঠেকাতে |
| ৩.৪ | `X-Frame-Options: SAMEORIGIN` → `DENY` | checkout পেজ iframe-এ না চলাই নিরাপদ (clickjacking) |
| ৩.৫ | **Audit log সম্প্রসারণ** | `logActivity` আছে ✅ — পেমেন্ট, রিফান্ড, RBAC পরিবর্তনে বাধ্যতামূলক করা |
| ৩.৬ | **নিরাপত্তা টেস্ট বাড়ানো** | ৯টি আছে; XSS sanitization ও IPN জালিয়াতির টেস্ট যোগ করা |
| ৩.৭ | **Dependency audit** | `npm audit`; `html2pdf.js`, `jodit` এর মতো প্যাকেজ XSS-প্রবণ |
| ৩.৮ | **`bcryptjs` → Clerk** | Clerk-এ গেলে পাসওয়ার্ড হ্যান্ডলিং আপনার কোড থেকে সরে যাবে — বড় নিরাপত্তা লাভ |
| ৩.৯ | **Error message sanitize** | [api/register/route.ts:40](../app/api/register/route.ts#L40) `e.message` সরাসরি ফেরত দেয় → internal তথ্য ফাঁস হতে পারে |

---

## ৪. পরামর্শকৃত ক্রম

যেহেতু deploy হয়নি, নিরাপত্তার কাজ **Clerk মাইগ্রেশনের সাথে মিলিয়ে** করাই দক্ষ — দুবার একই ফাইল ছোঁয়ার দরকার নেই।

```
পর্যায় ১ — এখনই (Clerk-নিরপেক্ষ, স্বাধীন)
  ১.১  ব্লগ/নিউজলেটার XSS sanitization          🔴
  ১.৪  SSLCommerz ক্রেডেনশিয়াল env-এ সরানো        🔴
  ৩.৯  Error message sanitize                    🟡
  ৩.৭  npm audit + dependency আপডেট              🟡

পর্যায় ২ — Clerk মাইগ্রেশন (আলাদা ডকুমেন্ট)
  → docs/clerk-migration-plan.md অনুসরণ
  ২.১  proxy.ts পুনঃসংযোগ (session fetch বাদ)     🟠
  ২.২  proxy.ts fail-closed করা                   🟠
  ৩.১  Clerk MFA + bot protection                 🟡

পর্যায় ৩ — হেডার ও নীতি
  ১.২  CSP (আগে Report-Only, পরে enforce)        🔴
  ১.৩  HSTS                                       🔴
  ৩.৪  X-Frame-Options: DENY                      🟡

পর্যায় ৪ — Cloudflare deploy
  ২.৪  Prisma + Hyperdrive/Accelerate             🟠
  ২.৫  Vercel Blob → R2                           🟠
  ২.৩  IPN whitelist + end-to-end sandbox টেস্ট   🔴
  ৩.২  WAF + edge rate limiting                   🟡
  ৩.৩  Turnstile                                  🟡

পর্যায় ৫ — লাইভের আগে
  ৩.৬  নিরাপত্তা টেস্ট সম্প্রসারণ
  →   SSLCommerz sandbox-এ পূর্ণ পেমেন্ট চক্র টেস্ট
  →   penetration checklist
```

**সময়ের অনুমান:** পর্যায় ১ ≈ ১ দিন। পর্যায় ৩ ≈ ১ দিন (CSP-তে TinyMCE/Clerk নিয়ে ঝামেলা হতে পারে)। পর্যায় ৪ ≈ ২–৩ দিন (Prisma adapter-এর উপর নির্ভরশীল)।

---

## ৫. সিদ্ধান্তের জন্য প্রশ্ন

1. **SSLCommerz ক্রেডেনশিয়াল** — env var (সহজ, এক গেটওয়ে) নাকি DB-তে এনক্রিপ্টেড (বহু গেটওয়ে)? আপনার একটাই SSLCommerz অ্যাকাউন্ট হলে env সুপারিশ করছি।
2. **`proxy.ts` fail-closed** করব কি? এটি নিরাপদ কিন্তু ২৬৮টি rule পুনর্বিন্যাস — deploy হয়নি বলে এখনই সঠিক সময়।
3. **ফাইল স্টোরেজ** Vercel Blob-এ রাখবেন নাকি R2-তে যাবেন? Cloudflare-এ হোস্ট করলে R2 সস্তা ও দ্রুত।
4. **কোনটা আগে** — নিরাপত্তা পর্যায় ১ (স্বাধীন, আজই করা যায়) নাকি Clerk মাইগ্রেশন?
