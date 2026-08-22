# NextAuth v4 → Clerk মাইগ্রেশন প্ল্যান

**তারিখ:** 2026-08-22
**প্রজেক্ট:** tech_ecommerce
**সিদ্ধান্ত:** Clerk-এ যাব; পুরোনো ইউজারদের পাসওয়ার্ড অক্ষত রাখব; Google লগইন যোগ করব; Cloudflare-এ হোস্ট করব।

> এই ডকুমেন্টটি কোড লেখার **আগে** পড়ে অনুমোদন করার জন্য। প্রতিটি সংখ্যা কোডবেস স্ক্যান করে বের করা, অনুমান নয়।

---

## ১. বর্তমান অবস্থার বাস্তব চিত্র

| বিষয় | অবস্থা |
|---|---|
| Auth লাইব্রেরি | `next-auth ^4.24.15`, JWT strategy |
| Next.js | **16.3.1** (`middleware` → `proxy` rename হয়ে গেছে) |
| Provider | শুধুমাত্র Credentials (email + bcryptjs) — কোনো OAuth নেই |
| DB | PostgreSQL, Prisma client custom output → `generated/prisma` |
| `getServerSession` কল সাইট | **~490** টি |
| `useSession` কল সাইট | **~147** টি |
| `signIn` / `signOut` কল সাইট | **৯** টি |
| Edge gate | [proxy.ts](../proxy.ts) — **2,122 লাইন**, **268** টি permission rule |
| RBAC | নিজস্ব DB টেবিল: `Role`, `Permission`, `UserRole`, `WarehouseMembership` |
| Prisma-তে NextAuth মডেল | `Account` / `Session` **নেই** (JWT strategy); `VerificationToken` আছে কিন্তু অব্যবহৃত |
| পাসওয়ার্ড রিসেট | **নিজস্ব** ফ্লো — `PasswordResetToken` টেবিল + forgot/reset API |

### Import প্যাটার্ন (মাইগ্রেশনের জন্য গুরুত্বপূর্ণ)

সব কল সাইট মাত্র কয়েকটা প্যাটার্নে পড়ে — তাই যান্ত্রিকভাবে বদলানো সম্ভব:

```
174 × import { getServerSession } from "next-auth/next";
 10 × import { getServerSession } from 'next-auth/next';   ← single quote
  5 × import { getServerSession } from "next-auth";
 60 × import { useSession } from "next-auth/react";
 12 × import { ... } from "@/lib/auth-client";             ← আগে থেকেই wrapper ব্যবহার করছে
```

**সিদ্ধান্ত:** ৪৯০টা রুট হাতে লেখা হবে না। Shim পদ্ধতি ব্যবহার করব (§২)।

---

## ২. মূল কৌশল — Shim (আবরণ) পদ্ধতি

`lib/auth.ts` কে Clerk-চালিত বানাব, কিন্তু **হুবহু একই `session` অবজেক্ট** ফেরত দেবে। তারপর import লাইনগুলো redirect করব। ব্যবসায়িক কোড অপরিবর্তিত থাকবে।

```
আগে:  route.ts → getServerSession(authOptions) → NextAuth JWT → session.user.permissions
পরে:  route.ts → getServerSession()            → Clerk auth() → clerkId → User
                                                → getAccessContext() → session.user.permissions
                                                  ↑ আউটপুট shape সম্পূর্ণ অভিন্ন
```

এতে `session.user.id`, `.role`, `.permissions`, `.warehouseIds`, `.defaultAdminRoute` — সব আগের মতোই কাজ করবে।

---

## ৩. ধাপে ধাপে পরিকল্পনা

### ধাপ ০ — প্রস্তুতি (কোড নয়)

Clerk dashboard-এ:
1. নতুন application তৈরি
2. **Email + Password** enable
3. **Google** OAuth enable (Clerk-এর shared credentials দিয়ে শুরু করা যায়; production-এ নিজের Google Cloud OAuth client লাগবে)
4. Webhook endpoint যোগ: `https://<domain>/api/webhooks/clerk` — events: `user.created`, `user.updated`, `user.deleted`
5. Keys সংগ্রহ

`.env.local`-এ (এই ফাইল git-এ যাবে না):
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SIGNING_SECRET=whsec_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/signin
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

---

### ধাপ ১ — Prisma schema

```prisma
model User {
  // ... বিদ্যমান ফিল্ড অপরিবর্তিত
  clerkId String? @unique   // ← নতুন
}
```

**যা রাখতে হবে:**
- `passwordHash` — Clerk-এ import করার জন্য দরকার (ধাপ ২)। Import সফল হওয়ার **পরে**, আলাদা রিলিজে মোছা যাবে।
- `User.id` (cuid) — **কখনোই বদলানো যাবে না**। `Order`, `CartItem`, `Review`, `UserRole`, `WarehouseMembership` সহ বহু টেবিল এই FK ধরে আছে।

**যা পরে মুছবে:** `VerificationToken` (অব্যবহৃত), `PasswordResetToken` (Clerk রিসেট সামলাবে)।

মাইগ্রেশন: `npx prisma migrate dev --name add_clerk_id`

---

### ধাপ ২ — বিদ্যমান ইউজার Clerk-এ import (পাসওয়ার্ড অক্ষত)

**ফাইল:** `scripts/migrate-users-to-clerk.mjs`

Clerk-এর Backend API `createUser()` bcrypt hash সরাসরি গ্রহণ করে:

```js
await clerk.users.createUser({
  emailAddress: [user.email],
  passwordDigest: user.passwordHash,   // আপনার bcryptjs hash
  passwordHasher: "bcrypt",            // Clerk নিজেই যাচাই করবে
  externalId: user.id,                 // আপনার cuid → ফিরতি ম্যাপিং
  firstName: user.name,
  skipPasswordChecks: true,            // পুরোনো দুর্বল পাসওয়ার্ড reject হবে না
});
```

**ফলাফল:** ইউজাররা **একই পাসওয়ার্ডে** লগইন করবে, কিছু টের পাবে না।

স্ক্রিপ্টের শর্তাবলী:
- **Idempotent** — `clerkId` ইতিমধ্যে থাকলে skip; বারবার চালানো নিরাপদ
- **Rate limit** — Clerk-এর API limit মেনে ব্যাচে চলবে (delay সহ)
- **Dry-run mode** — `--dry-run` দিয়ে আগে যাচাই
- **রিপোর্ট** — কতজন সফল, কতজন ব্যর্থ, কেন
- `passwordHash` **null** যাদের (যদি থাকে) — তাদের password ছাড়াই তৈরি হবে, পরে reset করবে

> ⚠️ প্রথমে staging DB-র কপিতে চালাতে হবে, production-এ নয়।

---

### ধাপ ৩ — নতুন `lib/auth.ts` (মাইগ্রেশনের হৃদয়)

```ts
import { auth } from "@clerk/nextjs/server";
import { cache } from "react";
import { db } from "@/lib/db";
import { getAccessContext } from "@/lib/rbac";

export const getServerSession = cache(async () => {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const user = await db.user.findUnique({ where: { clerkId } });
  if (!user) return null;   // webhook এখনো sync করেনি

  const access = await getAccessContext({ id: user.id, role: user.role });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      role: user.role ?? "user",
      permissions: access.permissions,
      roleNames: access.roleNames,
      globalPermissions: access.globalPermissions,
      warehouseIds: access.warehouseIds,
      primaryWarehouseId: access.primaryWarehouseId,
      defaultAdminRoute: access.defaultAdminRoute,
    },
  };
});

// পুরোনো ৪৯০টা কল `getServerSession(authOptions)` লিখেছে — signature না ভাঙার জন্য
export const authOptions = {};
```

**গুরুত্বপূর্ণ:** React `cache()` অপরিহার্য। এটা ছাড়া একটি রিকোয়েস্টে একাধিকবার `getServerSession()` ডাকলে প্রতিবারই DB hit হবে। `cache()` request-scoped, তাই প্রতি রিকোয়েস্টে একবারই চলবে।

---

### ধাপ ৪ — Import redirect (স্ক্রিপ্টেড, ১৮৯ ফাইল)

```bash
# server-side (189 ফাইল)
grep -rl 'from "next-auth/next"' --include=*.ts --include=*.tsx app lib components \
  | xargs sed -i 's|from "next-auth/next"|from "@/lib/auth"|g'
grep -rl "from 'next-auth/next'" ... | xargs sed -i "s|from 'next-auth/next'|from '@/lib/auth'|g"

# client-side (64 ফাইল)
... 'next-auth/react' → '@/lib/auth-client'
```

এরপর `npm run typecheck` — TypeScript যা ধরবে সেটাই বাকি হাতের কাজ।

> সতর্কতা: `sed -i` চালানোর আগে git commit করে নিতে হবে, যাতে `git diff` দিয়ে পুরোটা যাচাই ও rollback করা যায়।

---

### ধাপ ৫ — ক্লায়েন্ট সাইড (`lib/auth-client.ts`)

১৪৭টা `useSession()` কল সাইট অক্ষত রাখতে shape নকল করতে হবে। NextAuth দেয় `{ data, status }`।

```ts
"use client";
import { useUser, useClerk } from "@clerk/nextjs";

export function useSession() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { data: access } = useSWR(isSignedIn ? "/api/rbac/me" : null, fetcher);

  return {
    data: isSignedIn && access ? { user: { ...access, ... } } : null,
    status: !isLoaded ? "loading" : isSignedIn ? "authenticated" : "unauthenticated",
  };
}
```

**সুবিধা:** [app/api/rbac/me/route.ts](../app/api/rbac/me/route.ts) **আগে থেকেই** ঠিক এই ডেটা ফেরত দেয় (`permissions`, `roleNames`, `warehouseIds`, `defaultAdminRoute`)। নতুন endpoint লাগবে না।

`signIn` / `signOut` → Clerk-এর সমতুল্যে ম্যাপ (৯টি জায়গা):

| ফাইল | বর্তমান |
|---|---|
| [signin-form.tsx:58](<../app/(main)/(auth)/signin/signin-form.tsx#L58>) | `signIn("credentials", ...)` |
| [signup-form.tsx:64](<../app/(main)/(auth)/sign-up/signup-form.tsx#L64>) | `signIn("credentials", ...)` |
| [ShoppingCart.tsx:465](../app/ecommerce/cart/ShoppingCart.tsx#L465) | `signIn(undefined, { callbackUrl })` |
| [FloatingCartButton.tsx:382](../components/ecommarce/FloatingCartButton.tsx#L382) | `signIn(undefined, { callbackUrl })` |
| [admin/Header.tsx:207](../components/admin/Header.tsx#L207) | `signOut()` |
| [ecommarce/header.tsx:861](../components/ecommarce/header.tsx#L861) | `signOut()` |
| [InvestorNav.tsx:178](../components/investor/InvestorNav.tsx#L178) | `signOut({ redirect: false })` |
| [SupplierNav.tsx:120](../components/supplier/SupplierNav.tsx#L120) | `signOut({ redirect: false })` |

**`app/providers.tsx`:** `SessionProvider` → `ClerkProvider`

---

### ধাপ ৬ — `proxy.ts` পুনঃসংযোগ ⚠️ **সবচেয়ে ঝুঁকিপূর্ণ ধাপ**

**সমস্যা:** [proxy.ts:1929](../proxy.ts#L1929) প্রতিটি সুরক্ষিত রিকোয়েস্টে **HTTP fetch** করে:

```ts
const response = await fetch(new URL("/api/auth/session", request.url), {
  headers: { cookie: request.headers.get("cookie") || "" },
});
```

Clerk-এ গেলে `/api/auth/session` **আর থাকবে না** → ২৬৮টা permission rule একসাথে ভেঙে পড়বে।

এটি একই সাথে একটি **বিদ্যমান পারফরম্যান্স সমস্যা** — প্রতি পেজ লোডে একটা বাড়তি HTTP round-trip।

**সমাধান:** `clerkMiddleware()` দিয়ে মুড়ে, session-fetch এর বদলে একটা lightweight internal endpoint (`/api/internal/access`) — অথবা আরও ভালো: Clerk **session claims**-এ permission গুলো ঢুকিয়ে দেওয়া, যাতে edge-এ কোনো নেটওয়ার্ক কল ছাড়াই RBAC যাচাই হয়।

```ts
export default clerkMiddleware(async (auth, request) => {
  const { sessionClaims } = await auth();
  const session = sessionClaims?.metadata ?? null;   // fetch নেই
  // ... বাকি ২,১২২ লাইনের যুক্তি অপরিবর্তিত
});
```

তবে Clerk JWT-র আকারসীমা (~1.2KB cookie) আছে — আপনার permission array বড় হলে সব claim-এ আঁটবে না। **তাই দুটো বিকল্প যাচাই করতে হবে বাস্তব ডেটা দিয়ে:**
- **ক)** claims-এ শুধু `role` + `defaultAdminRoute` রেখে বাকিটা endpoint থেকে (edge-এ ১ কল, কিন্তু ক্যাশযোগ্য)
- **খ)** পুরো permission set claims-এ (দ্রুততম, কিন্তু সীমায় আটকাতে পারে)

> এই ধাপটি আলাদা করে টেস্ট করতে হবে — ২৬৮টা rule-এর regression risk সর্বোচ্চ।

---

### ধাপ ৭ — Webhook sync (Google signup-এর জন্য অপরিহার্য)

**ফাইল:** `app/api/webhooks/clerk/route.ts`

Google দিয়ে কেউ নতুন signup করলে Clerk-এ ইউজার তৈরি হবে, কিন্তু **আপনার `User` টেবিলে হবে না** → `getServerSession()` null ফেরত দেবে → সে কিছুই করতে পারবে না।

```ts
// user.created  → db.user.create({ clerkId, email, name, role: "user" })
// user.updated  → db.user.update(...)
// user.deleted  → soft-delete (hard delete করলে Order/Review FK ভাঙবে)
```

- Svix signature verify **বাধ্যতামূলক** (নাহলে যে কেউ ইউজার বানাতে পারবে)
- এই route টি `proxy.ts` matcher থেকে **public** রাখতে হবে
- Race condition: webhook আসার আগেই ইউজার পেজ লোড করলে? → `getServerSession()`-এ fallback: `clerkId` না মিললে email দিয়ে খুঁজে `clerkId` লিখে দেওয়া (just-in-time linking)

---

### ধাপ ৮ — পাসওয়ার্ড সংক্রান্ত ৬টি রুট পুনর্লিখন

bcrypt ব্যবহার করা রুটগুলো (স্ক্যান করে পাওয়া):

| রুট | কাজ | Clerk-এ কী হবে |
|---|---|---|
| [api/register](../app/api/register/route.ts) | নতুন signup | Clerk `createUser()` + DB row |
| [api/user/password](../app/api/user/password/route.ts) | নিজের পাসওয়ার্ড বদল | Clerk `updateUser({ password })` |
| [api/users/[id]/password](../app/api/users/[id]/password/route.ts) | admin কর্তৃক বদল | Clerk backend API |
| [api/users](../app/api/users/route.ts) | admin ইউজার তৈরি | Clerk `createUser()` |
| [api/delivery-men](../app/api/delivery-men/route.ts) | delivery man তৈরি | Clerk `createUser()` |
| [api/auth/reset-password](../app/api/auth/reset-password/route.ts) | রিসেট | **মুছে ফেলা** — Clerk সামলাবে |
| [api/auth/forgot-password](../app/api/auth/forgot-password/route.ts) | রিসেট মেইল | **মুছে ফেলা** — Clerk সামলাবে |

`prisma/seed*` ফাইলগুলোর bcrypt রাখা যাবে (seed শুধু dev-এ চলে), তবে seed করা ইউজাররা Clerk-এ থাকবে না — seed script-এও Clerk sync যোগ করতে হবে, নাহলে dev-এ লগইন করা যাবে না।

---

### ধাপ ৯ — লগইন / সাইনআপ পেজ

আপনার বিদ্যমান ডিজাইন **রাখা হবে** — শুধু ইঞ্জিন বদলাবে (`useSignIn` / `useSignUp` hook)। Google বাটন যোগ হবে।

⚠️ [signin-form.tsx:66](<../app/(main)/(auth)/signin/signin-form.tsx#L66>) সরাসরি `fetch("/api/auth/session")` করে redirect ঠিক করতে — এই endpoint Clerk-এ থাকবে না, তাই `/api/rbac/me` দিয়ে বদলাতে হবে।

`sessionStorage`-এর `pendingCheckout` / `redirectAfterLogin` যুক্তি অপরিবর্তিত থাকবে।

---

### ধাপ ১০ — Cloudflare deploy (আলাদা কাজ)

> এটি Clerk-নির্ভর নয়, কিন্তু আপনার লক্ষ্য বলে এখানে রাখা হলো।

1. `@opennextjs/cloudflare` অ্যাডাপ্টার + `wrangler.jsonc` (এখন কিছুই নেই)
2. **Prisma সমস্যা:** সাধারণ Prisma client Workers-এ চলে না → **Prisma Accelerate** অথবা **Hyperdrive + driver adapter** লাগবে। এটি বড় কাজ, আলাদা করে পরিকল্পনা করা উচিত।
3. **`bcrypt` (native)** Workers-এ চলবে না — তবে Clerk-এ গেলে auth path থেকে bcrypt সরে যাচ্ছে, তাই এটি বরং সমাধান হয়ে যাচ্ছে। শুধু `prisma/seed*`-এ থাকবে (যা Workers-এ চলে না, সমস্যা নেই)।
4. `next.config.ts`-এর `webpack` কাস্টমাইজেশন OpenNext-এর সাথে যাচাই করতে হবে।
5. সব env var Cloudflare secrets-এ।

---

## ৪. ঝুঁকি তালিকা (গুরুত্ব অনুসারে)

| # | ঝুঁকি | প্রভাব | প্রশমন |
|---|---|---|---|
| ১ | **`proxy.ts` ভাঙা** — ২৬৮টি rule, `/api/auth/session` উধাও | 🔴 সর্বোচ্চ — পুরো RBAC অকেজো | আলাদা ধাপে, নিজস্ব টেস্ট সহ |
| ২ | **Prisma on Workers** | 🔴 উচ্চ — deploy আটকে যাবে | Accelerate/Hyperdrive আগেই যাচাই |
| ৩ | **পাসওয়ার্ড import ব্যর্থ** | 🔴 উচ্চ — ইউজার লগইন করতে পারবে না | staging-এ dry-run, rollback প্ল্যান |
| ৪ | **Webhook race** — Google signup-এ DB row নেই | 🟠 মাঝারি | just-in-time linking fallback (§৭) |
| ৫ | **`getAccessContext()` প্রতি রিকোয়েস্টে DB** | 🟠 মাঝারি | React `cache()` (§৩) |
| ৬ | **Clerk JWT আকারসীমা** vs বড় permission array | 🟠 মাঝারি | বাস্তব ডেটা দিয়ে মেপে সিদ্ধান্ত (§৬) |
| ৭ | **MAU খরচ** — ১০k-এর পরে বিল | 🟡 নিম্ন | ব্যবসায়িক সিদ্ধান্ত |
| ৮ | `sed` দিয়ে গণ-পরিবর্তন | 🟡 নিম্ন | আগে commit, `git diff` যাচাই, `typecheck` |

---

## ৫. পরামর্শকৃত ক্রম (rollback-বান্ধব)

প্রতিটি ধাপ আলাদা commit — যেকোনো জায়গায় থামা/ফেরা যাবে।

```
১. schema + clerkId                    ← কিছুই ভাঙে না, NextAuth চলতে থাকে
২. Clerk setup + import script (dry-run) ← কিছুই ভাঙে না
৩. import script (staging-এ আসল রান)     ← কিছুই ভাঙে না
─────────────── এখান থেকে NextAuth বন্ধ হতে শুরু করবে ───────────────
৪. lib/auth.ts shim + webhook + providers
৫. import redirect (sed) + typecheck
৬. auth-client + signin/signup পেজ
৭. proxy.ts পুনঃসংযোগ                    ← সবচেয়ে সতর্ক ধাপ
৮. পাসওয়ার্ড রুট ৬টি
৯. next-auth uninstall + মৃত কোড সাফ
──────────────── আলাদা প্রকল্প ────────────────
১০. Cloudflare + Prisma driver adapter
```

**সময়ের অনুমান:** ধাপ ১–৯ প্রায় ৩–৪ দিন। ধাপ ১০ আলাদা, ১–২ দিন (Prisma adapter-এর উপর নির্ভরশীল)।

---

## ৬. অনুমোদনের জন্য প্রশ্ন

1. **ধাপ ৬ (proxy.ts)** — claims-ভিত্তিক (দ্রুত, সীমাবদ্ধ) নাকি endpoint-ভিত্তিক (নমনীয়, ১ কল)? বাস্তব permission array মেপে সিদ্ধান্ত নিতে চাই।
2. **Staging DB** আছে কি? পাসওয়ার্ড import production-এ সরাসরি চালানো উচিত নয়।
3. **ধাপ ১০ (Cloudflare)** এখনই, নাকি আগে Clerk শেষ করে Vercel-এ যাচাই করে তারপর?
