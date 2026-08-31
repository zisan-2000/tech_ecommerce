import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { isTrustedBusinessMutationOrigin } from "../lib/business-network/request-origin.ts";
import { rateLimitRequest } from "../lib/request-security.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

async function routeFiles(relativeRoot) {
  const output = [];
  async function visit(relative) {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.name === "route.ts") output.push(child.replaceAll("\\", "/"));
    }
  }
  await visit(relativeRoot);
  return output.sort();
}

test("M15 rejects cross-origin and unverifiable credentialed mutations", () => {
  const make = (headers = {}, url = "https://shop.example/api/business/orders") =>
    new Request(url, { method: "POST", headers });

  assert.equal(isTrustedBusinessMutationOrigin(make({ origin: "https://shop.example" })), true);
  assert.equal(isTrustedBusinessMutationOrigin(make({ origin: "https://evil.example" })), false);
  assert.equal(isTrustedBusinessMutationOrigin(make({ "sec-fetch-site": "cross-site" })), false);
  assert.equal(isTrustedBusinessMutationOrigin(make({ cookie: "session=x" })), false);
  assert.equal(
    isTrustedBusinessMutationOrigin(make({ cookie: "session=x", "sec-fetch-site": "same-origin" })),
    true,
  );
  assert.equal(isTrustedBusinessMutationOrigin(make()), true);
});

test("M15 rate limiting isolates authenticated subjects instead of trusting a spoofable IP", async () => {
  const scope = `m15-subject-${Date.now()}-${Math.random()}`;
  const request = new Request("https://shop.example/api/admin/business-network/reports", {
    headers: { "x-forwarded-for": "203.0.113.10" },
  });
  assert.equal((await rateLimitRequest(request, { scope, identifier: "admin-a", limit: 1, windowMs: 60_000 })).allowed, true);
  assert.equal((await rateLimitRequest(request, { scope, identifier: "admin-a", limit: 1, windowMs: 60_000 })).allowed, false);
  assert.equal((await rateLimitRequest(request, { scope, identifier: "admin-b", limit: 1, windowMs: 60_000 })).allowed, true);
});

test("M15 enforces RBAC and same-origin checks across the complete route surface", async () => {
  const [adminRoutes, portalRoutes] = await Promise.all([
    routeFiles("app/api/admin/business-network"),
    routeFiles("app/api/business"),
  ]);
  assert.ok(adminRoutes.length >= 70, "expected the complete admin Business Network API surface");
  assert.ok(portalRoutes.length >= 40, "expected the complete portal Business Network API surface");

  for (const route of adminRoutes) {
    const source = await read(route);
    assert.match(
      source,
      /require(?:Any)?BusinessNetworkAdminPermission/,
      `${route} must enforce internal RBAC`,
    );
    if (/export\s+async\s+function\s+(?:POST|PUT|PATCH|DELETE)/.test(source)) {
      assert.match(
        source,
        /assertSameOriginBusinessMutation|readBusinessJsonBody/,
        `${route} must reject cross-origin mutations`,
      );
    }
  }

  for (const route of portalRoutes) {
    const source = await read(route);
    if (/export\s+async\s+function\s+(?:POST|PUT|PATCH|DELETE)/.test(source)) {
      assert.match(
        source,
        /assertSameOriginBusinessMutation|readBusinessJsonBody/,
        `${route} must reject cross-origin mutations`,
      );
    }
  }
});

test("M15 hardens public attribution, reporting, cron secrets, and private response caching", async () => {
  const [publicAttribution, report, exportRoute, cronAuth, secrets, config] = await Promise.all([
    read("app/api/public/partner/attributions/route.ts"),
    read("app/api/admin/business-network/reports/route.ts"),
    read("app/api/admin/business-network/reports/export/route.ts"),
    read("lib/business-network/cron-authorization.ts"),
    read("lib/business-network/security-secrets.ts"),
    read("next.config.ts"),
  ]);
  assert.match(publicAttribution, /assertSameOriginBusinessMutation/);
  assert.match(publicAttribution, /rateLimitRequest/);
  for (const source of [report, exportRoute]) {
    assert.match(source, /identifier: actor\.userId/);
    assert.match(source, /Retry-After/);
    assert.match(source, /X-RateLimit-Remaining/);
  }
  assert.match(cronAuth, /timingSafeEqual/);
  assert.match(cronAuth, /secret\.length < 32/);
  assert.match(secrets, /NODE_ENV === "production"/);
  assert.match(secrets, /at least \$\{MIN_PRODUCTION_SECRET_LENGTH\}/);
  for (const routePrefix of [
    "/api/business/:path*",
    "/api/admin/business-network/:path*",
    "/api/cron/business-network/:path*",
    "/api/public/partner/:path*",
  ]) assert.ok(config.includes(routePrefix));
  assert.match(config, /X-Robots-Tag/);
});

