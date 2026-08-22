# এক্সিকিউটিভ রিপোর্ট — Auth মাইগ্রেশন, সিকিউরিটি ও Cloudflare ডিপ্লয়

**প্রজেক্ট:** tech_ecommerce
**তারিখ:** ২২ আগস্ট, ২০২৬
**প্রস্তুতকারী:** Claude (কোডবেস স্ক্যান-ভিত্তিক)
**অবস্থা:** সিদ্ধান্তের অপেক্ষায় — কোড এখনো লেখা হয়নি

---

## ১. এক নজরে (TL;DR)

| প্রশ্ন | উত্তর |
|---|---|
| **প্রজেক্টের আকার** | ২৬২টি API রুট, ১৮৫টি পেজ, ১৫৭টি DB মডেল, ৭৭৫টি TS/TSX ফাইল |
| **এখন কী আছে** | NextAuth v4 (শুধু email+password), নিজস্ব RBAC, SSLCommerz ইন্টিগ্রেটেড |
| **কোথায় যেতে চান** | Clerk + Google লগইন, Cloudflare হোস্টিং, লাইভ SSLCommerz |
| **সবচেয়ে বড় সুবিধা** | **এখনো deploy হয়নি** → breaking change করা যাবে, migration constraint নেই |
| **সবচেয়ে জরুরি সমস্যা** | 🔴 **৩টি অ্যাডমিন রুট সম্পূর্ণ অরক্ষিত** (নিচে §৩.১) |
| **মোট আনুমানিক সময়** | **১১–১৫ কর্মদিবস** (৩টি পর্বে) |
| **সবচেয়ে ঝুঁকিপূর্ণ কাজ** | `proxy.ts` (২,১২২ লাইন, ২৬৮টি নিয়ম) পুনর্গঠন |

### সবচেয়ে গুরুত্বপূর্ণ কথা

আপনার কোডবেসে **ইতিমধ্যে উঁচু মানের নিরাপত্তা কাজ হয়েছে** — পেমেন্ট যাচাই, SQL injection প্রতিরোধ, ফাইল আপলোড যাচাই সবই সঠিক। কিন্তু নিরাপত্তা **দুই স্তরে** ভাগ হয়ে আছে (রুটের ভেতরে + `proxy.ts`-এ), আর কিছু রুট **দুই স্তরের কোনোটাতেই নেই** — এটাই মূল ছিদ্র।

---

## ২. বর্তমান অবস্থা — যা ইতিমধ্যে ভালো আছে ✅

**এগুলো ভাঙবেন না।** সাধারণ e-commerce প্রজেক্টের বেশিরভাগ ভুল এখানে নেই।

| ক্ষেত্র | অবস্থা | প্রমাণ |
|---|---|---|
| **পেমেন্ট জালিয়াতি প্রতিরোধ** | ✅ সার্ভার থেকে SSLCommerz-এ `val_id` যাচাই; amount + currency + tran_id তিনটাই মেলানো হয় | [lib/sslcommerz.ts:280-288](../lib/sslcommerz.ts#L280-L288) |
| **SQL Injection** | ✅ **ঝুঁকি নেই** — `$queryRawUnsafe` নাম ভীতিকর হলেও সব কল `$1` bound parameter ব্যবহার করে | [cart/route.ts:42](../app/api/cart/route.ts#L42) |
| **গেটওয়ে পাসওয়ার্ড ফাঁস** | ✅ `redactGatewayData()` সব response থেকে বাদ দেয় | [api/payment/route.ts:35](../app/api/payment/route.ts#L35) |
| **ফাইল আপলোড** | ✅ Magic-byte যাচাই (শুধু extension নয়), path traversal ব্লক, নাম randomize | [lib/upload-security.ts](../lib/upload-security.ts) |
| **Rate limiting** | ✅ Redis-ভিত্তিক; **production-এ কনফিগার না থাকলে throw করে** — উৎকৃষ্ট fail-safe | [lib/request-security.ts:36](../lib/request-security.ts#L36) |
| **গেস্ট পেমেন্ট টোকেন** | ✅ HMAC-SHA256 + expiry + `timingSafeEqual` | [lib/sslcommerz.ts:130-148](../lib/sslcommerz.ts#L130-L148) |
| **অর্ডার IDOR** | ✅ ownership + permission দুটোই যাচাই | [api/orders/[id]/route.ts:86](../app/api/orders/[id]/route.ts#L86) |
| **ইনভেস্টর/সাপ্লায়ার পোর্টাল** | ✅ `resolveInvestorRequestContext()` দিয়ে সুরক্ষিত | [api/investor/overview](../app/api/investor/overview/route.ts) |
| **Cron রুট** | ✅ ৬টিতেই `CRON_SECRET` যাচাই | `app/api/cron/**` |
| **`.env` hygiene** | ✅ git-এ কোনো secret নেই | [.gitignore:34](../.gitignore#L34) |

---

## ৩. যা ঠিক করতে হবে — গুরুত্ব অনুসারে

### ৩.১ 🔴 সর্বোচ্চ জরুরি — সম্পূর্ণ অরক্ষিত অ্যাডমিন রুট

**এটি তাত্ত্বিক ঝুঁকি নয় — যাচাই করা, শোষণযোগ্য ছিদ্র।**

`/api/admin/products/bundles` রুটে **কোনো নিরাপত্তা স্তর নেই**:
- ❌ ফাইলের ভেতরে `getServerSession()` নেই
- ❌ `proxy.ts`-এ কোনো নিয়ম নেই (`grep "bundles" proxy.ts` → শূন্য)
- ❌ `proxy.ts` না-মেলা `/api/*` রুটকে **ঢুকতে দেয়** ([proxy.ts:1904](../proxy.ts#L1904))

**উন্মুক্ত মেথড:**
```
POST   /api/admin/products/bundles          → যে কেউ প্রোডাক্ট বান্ডল বানাতে পারে
PUT    /api/admin/products/bundles/[id]     → যে কেউ দাম/ডিসকাউন্ট বদলাতে পারে
DELETE /api/admin/products/bundles/[id]     → যে কেউ বান্ডল মুছে দিতে পারে
```

**ব্যবসায়িক প্রভাব:** লগইন ছাড়া যে কেউ বান্ডলের ডিসকাউন্ট ৯৯% করে দিতে পারবে → সরাসরি আর্থিক ক্ষতি।

**একই অবস্থায় আরও যেসব রুট** (কোনো in-file চেক নেই **এবং** কোনো proxy নিয়ম নেই):

| রুট | মেথড | ঝুঁকি |
|---|---|---|
| `/api/admin/products/bundles` | POST, PUT, DELETE | 🔴 দাম কারসাজি |
| `/api/shipment` | POST | 🔴 ভুয়া শিপমেন্ট তৈরি |
| `/api/shipment/[id]` | PATCH, DELETE | 🔴 শিপমেন্ট স্ট্যাটাস বদল |
| `/api/service-slots` | POST, PUT, DELETE | 🟠 সার্ভিস স্লট কারসাজি |
| `/api/reviews/batch` | POST | 🟠 ভুয়া রিভিউ স্প্যাম |
| `/api/ocr` | POST | 🟠 ব্যয়বহুল CPU অপব্যবহার (DoS) |
| `/api/analytics/collect` | POST | 🟡 ডেটা দূষণ |

> **সুখবর:** `/api/attributes`, `/api/product-variants`, `/api/payroll`, `/api/digital-assets`, `/api/delivery-men` — এগুলোতে in-file চেক না থাকলেও **`proxy.ts`-এ নিয়ম আছে**, তাই সুরক্ষিত। এই বিভাজনই প্রমাণ করে কেন §৩.২ দরকার।

---

### ৩.২ 🔴 মূল স্থাপত্য সমস্যা — নিরাপত্তা "denylist" মডেলে

[proxy.ts:1904-1909](../proxy.ts#L1904-L1909):
```ts
if (pathname.startsWith("/api/") && (!matchedApiRule || rule.permissions.length === 0)) {
  return NextResponse.next();   // ← নিয়ম না মিললে ঢুকতে দেয়
}
```

**অর্থ:** নতুন API রুট বানিয়ে ২৬৮টি নিয়মের তালিকায় যোগ করতে ভুলে গেলে সেটি **স্বয়ংক্রিয়ভাবে সবার জন্য উন্মুক্ত** থাকবে। §৩.১-এর ছিদ্রগুলো ঠিক এভাবেই তৈরি হয়েছে।

**সমাধান — fail-closed করা:** `/api/*` ডিফল্টে বন্ধ, শুধু স্পষ্ট ঘোষিত public রুট খোলা (storefront read, `register`, `contact`, `newsletter/subscribe`, `coupons/validate`, SSLCommerz IPN, Clerk webhook)।

**কেন এখনই:** deploy হয়নি বলে এখন করলে খরচ কম। পরে করলে প্রতিটি ভাঙা রুট লাইভ ইউজার প্রভাবিত করবে।

---

### ৩.৩ 🔴 Stored XSS — ব্লগ ও নিউজলেটার

ব্লগের HTML **sanitize ছাড়াই** সংরক্ষিত ([blog/route.ts:148](../app/api/blog/route.ts#L148)) এবং **কাঁচা render** হয় ([BlogDetails.tsx:447](../components/admin/blog/BlogDetails.tsx#L447))।

**আক্রমণ:** ব্লগে `<script>` ঢোকালে সেটি **অ্যাডমিনের ব্রাউজারে** চলবে → সেশন hijack → পুরো প্যানেল দখল।

`dompurify` ইতিমধ্যে `package.json`-এ **আছে**, শুধু এখানে ব্যবহার হয়নি। সার্ভার-সাইডে sanitize করতে হবে (ক্লায়েন্টে নয়)।

---

### ৩.৪ 🔴 CSP ও HSTS হেডার নেই

[next.config.ts:112](../next.config.ts#L112)-এ ভালো হেডার আছে (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) — **কিন্তু CSP নেই**।

CSP হলো XSS-এর **শেষ প্রতিরক্ষা**। §৩.৩ ঠিক করার পরেও কোনো ফাঁক থাকলে CSP স্ক্রিপ্ট চলা আটকাবে।

`Strict-Transport-Security`-ও নেই → প্রথম রিকোয়েস্টে HTTPS downgrade আক্রমণ সম্ভব।

---

### ৩.৫ 🔴 SSLCommerz ক্রেডেনশিয়াল ডেটাবেসে প্লেইনটেক্সটে

`storeId` / `storePassword` `Payment.paymentGatewayData` JSON কলামে **এনক্রিপশন ছাড়া** ([lib/sslcommerz.ts:252](../lib/sslcommerz.ts#L252))। API redact করে (ভালো), কিন্তু DB backup ফাঁস হলে **লাইভ পেমেন্ট ক্রেডেনশিয়াল** যাবে।

**সুপারিশ:** env var-এ সরানো (Cloudflare secrets)। `.env.example`-এ এখন SSLCommerz কী **নেই** — যোগ করতে হবে।

---

### ৩.৬ 🟠 Clerk মাইগ্রেশনের মূল বাধা — `proxy.ts`-এর session fetch

[proxy.ts:1929](../proxy.ts#L1929) প্রতি সুরক্ষিত রিকোয়েস্টে **নিজের কাছেই HTTP কল** করে:
```ts
await fetch(new URL("/api/auth/session", request.url), { headers: { cookie } });
```

Clerk-এ গেলে এই endpoint **থাকবে না** → **২৬৮টি নিয়ম একসাথে ভেঙে পড়বে**। পাশাপাশি এটি বিদ্যমান পারফরম্যান্স সমস্যা (প্রতি পেজে বাড়তি round-trip), যা Cloudflare Workers-এ আরও ব্যয়বহুল।

**সমাধান:** `clerkMiddleware()` + session claims থেকে সরাসরি পড়া — কোনো নেটওয়ার্ক কল নয়।

---

### ৩.৭ 🟠 Cloudflare-এ যাওয়ার তিনটি বাধা

| বাধা | সমস্যা | সমাধান |
|---|---|---|
| **Prisma** | সাধারণ Prisma client Workers-এ চলে না | Hyperdrive + driver adapter, অথবা Prisma Accelerate |
| **SSLCommerz IPN** | Cloudflare Bot Fight Mode বৈধ IPN ব্লক করতে পারে → **টাকা কাটবে, অর্ডার confirm হবে না** | WAF-এ whitelist + sandbox দিয়ে end-to-end টেস্ট |
| **ফাইল স্টোরেজ** | `@vercel/blob` ব্যবহার হচ্ছে | R2-তে সরানো (সস্তা ও দ্রুত) |

> ⚠️ IPN নীরবে ব্যর্থ হওয়া e-commerce-এ **সবচেয়ে ব্যয়বহুল bug**। লাইভের আগে অবশ্যই টেস্ট।

---

### ৩.৮ 🟡 ছোট বিষয়

| বিষয় | বিবরণ |
|---|---|
| **npm audit** | ৩টি high — তবে সবই **একটি dev-dependency** (`prisma` → `@prisma/config` → `deepmerge-ts`)। রানটাইম কোডে নয়, তাই ঝুঁকি কম। Prisma আপডেটে ঠিক হবে। |
| **Error message ফাঁস** | [api/register:40](../app/api/register/route.ts#L40) `e.message` সরাসরি ফেরত দেয় → internal তথ্য ফাঁস |
| **X-Frame-Options** | `SAMEORIGIN` → checkout-এর জন্য `DENY` নিরাপদ |
| **Clerk MFA** | অ্যাডমিন অ্যাকাউন্টে বাধ্যতামূলক করা উচিত |
| **Turnstile** | signup/contact/review ফর্মে bot প্রতিরোধ |

---

## ৪. কীভাবে করলে ভালো হবে — কৌশল

### ৪.১ মূল কৌশল: ৪৯০টি রুট **হাতে লিখব না**

Clerk মাইগ্রেশনের সবচেয়ে বড় ভয় — ৪৯০টি `getServerSession()` কল। কিন্তু সব একই প্যাটার্নে, তাই **shim (আবরণ)** পদ্ধতিতে **১টি ফাইল** বদলালেই হবে:

```
আগে:  route.ts → getServerSession(authOptions) → NextAuth JWT → session.user.permissions
পরে:  route.ts → getServerSession()            → Clerk auth() → clerkId → User
                                                → getAccessContext() → session.user.permissions
                                                  ↑ আউটপুট shape সম্পূর্ণ অভিন্ন
```

`lib/auth.ts` কে Clerk-চালিত করে **হুবহু একই session অবজেক্ট** ফেরত দেব। তারপর ১৮৯টি server import + ৬৪টি client import `sed` দিয়ে redirect। **ব্যবসায়িক কোড অপরিবর্তিত।**

**সুখবর:** [api/rbac/me](../app/api/rbac/me/route.ts) ইতিমধ্যে ঠিক সেই ডেটা ফেরত দেয় যা client-side shim-এর দরকার — নতুন endpoint লাগবে না।

### ৪.২ কাজগুলো একসাথে করা, আলাদা নয়

নিরাপত্তা ও Clerk — দুটোই `proxy.ts` আর auth রুট ছোঁয়। **আলাদা করলে একই ফাইল দুবার ভাঙতে হবে।** তাই §৩.২ (fail-closed) ও §৩.৬ (proxy পুনঃসংযোগ) **একই পর্বে** করা উচিত।

### ৪.৩ পাসওয়ার্ড অক্ষত রাখার উপায় নিশ্চিত

Clerk-এর `createUser()` **`passwordHasher: "bcrypt"`** গ্রহণ করে → আপনার বিদ্যমান hash সরাসরি import হবে, ইউজাররা **একই পাসওয়ার্ডে** লগইন করবে।

তবে যেহেতু deploy হয়নি, লাইভ ইউজার নেই — এটি শুধু dev/seed ডেটার জন্য প্রযোজ্য। **সিদ্ধান্ত দরকার** (§৬)।

---

## ৫. রোডম্যাপ — ৩টি পর্ব

প্রতিটি ধাপ আলাদা commit, যেকোনো জায়গায় থামা যাবে।

### 🟥 পর্ব ১ — জরুরি নিরাপত্তা (২–৩ দিন) — *Clerk-নিরপেক্ষ, আজই শুরু করা যায়*

| # | কাজ | ফাইল |
|---|---|---|
| ১.১ | **অরক্ষিত রুটে auth যোগ** (bundles, shipment, service-slots, reviews/batch, ocr) | ৭টি রুট |
| ১.২ | **ব্লগ/নিউজলেটার XSS sanitization** | `api/blog`, `api/newsletter` + ২টি component |
| ১.৩ | **SSLCommerz ক্রেডেনশিয়াল env-এ সরানো** | `lib/sslcommerz.ts`, `.env.example` |
| ১.৪ | **Error message sanitize** | `api/register` সহ |
| ১.৫ | **নিরাপত্তা টেস্ট যোগ** | `tests/phase0-security.test.mjs` |

> এই পর্ব শেষে **সবচেয়ে বড় ছিদ্রগুলো বন্ধ** — Clerk শুরু না করলেও।

### 🟧 পর্ব ২ — Clerk মাইগ্রেশন + proxy পুনর্গঠন (৫–৭ দিন)

| # | কাজ | ঝুঁকি |
|---|---|---|
| ২.১ | Prisma schema-তে `clerkId` | 🟢 |
| ২.২ | Clerk setup + Google OAuth + webhook | 🟢 |
| ২.৩ | `lib/auth.ts` shim (React `cache()` সহ) | 🟡 |
| ২.৪ | Import redirect (sed, ১৮৯+৬৪ ফাইল) + typecheck | 🟡 |
| ২.৫ | `lib/auth-client.ts` + signin/signup পেজ | 🟡 |
| ২.৬ | **`proxy.ts` পুনঃসংযোগ + fail-closed** | 🔴 **সবচেয়ে সতর্ক ধাপ** |
| ২.৭ | পাসওয়ার্ড সংক্রান্ত ৬টি রুট পুনর্লিখন | 🟡 |
| ২.৮ | `next-auth` uninstall + মৃত কোড সাফ | 🟢 |

### 🟨 পর্ব ৩ — Cloudflare ডিপ্লয় + চূড়ান্ত হার্ডেনিং (৪–৫ দিন)

| # | কাজ |
|---|---|
| ৩.১ | Prisma + Hyperdrive/Accelerate |
| ৩.২ | OpenNext অ্যাডাপ্টার + `wrangler.jsonc` |
| ৩.৩ | Vercel Blob → R2 (signed URL সহ) |
| ৩.৪ | **CSP** (আগে Report-Only, পরে enforce) + **HSTS** |
| ৩.৫ | WAF + edge rate limiting + Turnstile |
| ৩.৬ | **SSLCommerz sandbox end-to-end টেস্ট** (IPN সহ) |
| ৩.৭ | লাইভের আগে চূড়ান্ত checklist |

---

## ৬. সিদ্ধান্তের জন্য প্রশ্ন

| # | প্রশ্ন | আমার সুপারিশ |
|---|---|---|
| ১ | **কোন পর্ব আগে?** | **পর্ব ১ এখনই** — Clerk-নিরপেক্ষ, ২–৩ দিনে সবচেয়ে বড় ছিদ্র বন্ধ |
| ২ | **`proxy.ts` fail-closed করব?** | **হ্যাঁ** — deploy হয়নি বলে এখনই সঠিক সময়; §৩.১ প্রমাণ করে কেন দরকার |
| ৩ | **SSLCommerz creds env নাকি DB-encrypted?** | **env** — একটাই গেটওয়ে হলে সহজ ও নিরাপদ |
| ৪ | **পুরোনো ইউজার ডেটা** | deploy হয়নি → **clean slate** সবচেয়ে সহজ। লাইভ ইউজার সত্যিই নেই তো? |
| ৫ | **ফাইল স্টোরেজ** | Cloudflare-এ গেলে **R2** |
| ৬ | **Clerk অ্যাকাউন্ট** | এখনো বানানো হয়নি — পর্ব ২ শুরুর আগে দরকার |

---

## ৭. সংশ্লিষ্ট ডকুমেন্ট

- **[docs/clerk-migration-plan.md](./clerk-migration-plan.md)** — Clerk মাইগ্রেশনের ১০টি ধাপের বিস্তারিত
- **[docs/security-hardening-plan.md](./security-hardening-plan.md)** — নিরাপত্তা অডিটের পূর্ণ বিবরণ

---

## ৮. উপসংহার

আপনার প্রজেক্টের নিরাপত্তা ভিত্তি **প্রত্যাশার চেয়ে ভালো** — পেমেন্ট, SQL, আপলোড সবই সঠিকভাবে সুরক্ষিত। মূল সমস্যা কোনো একক bug নয়, বরং **স্থাপত্যগত**: নিরাপত্তা দুই স্তরে ছড়ানো, আর ডিফল্ট আচরণ "খোলা" — যার ফলে কিছু রুট ফাঁক গলে বেরিয়ে গেছে।

**deploy না হওয়াটাই আপনার সবচেয়ে বড় সুবিধা।** fail-closed মডেলে যাওয়ার এটিই সঠিক ও সস্তা সময়।

**সুপারিশ:** পর্ব ১ আজই শুরু করুন (২–৩ দিন, স্বাধীন), তারপর Clerk অ্যাকাউন্ট বানিয়ে পর্ব ২।
