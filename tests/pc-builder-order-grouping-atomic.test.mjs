import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("PC build order grouping is persisted inside the core order transaction", async () => {
  const [wrapper, core] = await Promise.all([
    readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/orders/route-core.ts", import.meta.url), "utf8"),
  ]);

  assert.match(wrapper, /corePOST\(coreRequest\(request, rawBody\),\s*\{\s*pcBuilderBuilds: matchedBuilds/);
  assert.doesNotMatch(wrapper, /persistOrderBuildGrouping/);
  assert.doesNotMatch(wrapper, /response\.clone\(\)\.json/);

  assert.match(core, /type OrderPostOptions/);
  assert.match(core, /persistPcBuilderOrderGrouping\(/);
  assert.match(core, /await prisma\.\$transaction\(async \(tx: any\) =>/);
  assert.match(core, /await persistPcBuilderOrderGrouping\(tx, o, options\.pcBuilderBuilds\)/);
  assert.match(core, /await tx\.\$executeRawUnsafe\(/);
  assert.match(core, /INSERT INTO "PcBuildOrderItem"/);
  assert.match(core, /PC_BUILDER_GROUPING_ATOMIC_MAPPING_FAILED/);
});

test("grouping failures are surfaced instead of being swallowed after order creation", async () => {
  const [wrapper, core] = await Promise.all([
    readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/orders/route-core.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(wrapper, /order grouping persistence failed/);
  assert.match(core, /PC_BUILDER_ORDER_GROUPING_FAILED/);
  assert.match(core, /status: 409/);
});
