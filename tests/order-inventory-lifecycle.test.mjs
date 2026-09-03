import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildOrderInventoryRestockPlan,
  restoreOrderInventory,
} from "../lib/inventory.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

function createInventoryTransaction({ levels, logs, reservations = [] }) {
  const state = {
    levels: levels.map((level, index) => ({ id: index + 1, reserved: 0, ...level })),
    logs: logs.map((log, index) => ({ id: index + 1, ...log })),
    reservations: reservations.map((reservation, index) => ({
      id: index + 1,
      ...reservation,
    })),
    variantStock: new Map(),
  };
  const levelFor = (warehouseId, productVariantId) =>
    state.levels.find(
      (level) =>
        level.warehouseId === warehouseId &&
        level.productVariantId === productVariantId,
    );

  const tx = {
    inventoryReservation: {
      findMany: async ({ where }) =>
        state.reservations
          .filter((reservation) => reservation.orderId === where.orderId)
          .map((reservation) => ({
            ...reservation,
            stockLevel: {
              productVariantId: state.levels.find(
                (level) => level.id === reservation.stockLevelId,
              ).productVariantId,
            },
          })),
      delete: async ({ where }) => {
        state.reservations = state.reservations.filter(
          (reservation) => reservation.id !== where.id,
        );
      },
    },
    inventoryLog: {
      findMany: async ({ where }) =>
        state.logs.filter((movement) => movement.orderId === where.orderId),
      create: async ({ data }) => {
        const created = { id: state.logs.length + 1, ...data };
        state.logs.push(created);
        return created;
      },
    },
    stockLevel: {
      findMany: async ({ where }) =>
        state.levels.filter(
          (level) => level.productVariantId === where.productVariantId,
        ),
      updateMany: async ({ where, data }) => {
        const level = state.levels.find((candidate) => candidate.id === where.id);
        if (!level || level.reserved < where.reserved.gte) return { count: 0 };
        level.reserved -= data.reserved.decrement;
        return { count: 1 };
      },
      upsert: async ({ where, create, update }) => {
        const key = where.warehouseId_productVariantId;
        let level = levelFor(key.warehouseId, key.productVariantId);
        if (!level) {
          level = { id: state.levels.length + 1, ...create };
          state.levels.push(level);
        } else {
          level.quantity += update.quantity.increment;
        }
        return level;
      },
    },
    productVariant: {
      update: async ({ where, data }) => {
        state.variantStock.set(where.id, data.stock);
      },
      findUnique: async ({ where }) => {
        const matchingLevels = state.levels.filter(
          (level) => level.productVariantId === where.id,
        );
        if (!matchingLevels.length) return null;
        return {
          id: where.id,
          productId: matchingLevels[0].productId,
          stock: state.variantStock.get(where.id) ?? 0,
          lowStockThreshold: 1,
          stockLevels: matchingLevels,
        };
      },
    },
    inventoryDailySnapshot: { upsert: async () => null },
    inventoryWarehouseDailySnapshot: {
      deleteMany: async () => null,
      upsert: async () => null,
    },
  };

  return { state, tx };
}

test("restock plan returns the exact outstanding quantity per warehouse", () => {
  const plan = buildOrderInventoryRestockPlan([
    { productId: 10, variantId: 100, warehouseId: 1, change: -2 },
    { productId: 10, variantId: 100, warehouseId: 1, change: -1 },
    { productId: 10, variantId: 100, warehouseId: 2, change: -4 },
    { productId: 10, variantId: 100, warehouseId: 2, change: 1 },
    { productId: 10, variantId: null, warehouseId: 2, change: -9 },
    { productId: 10, variantId: 100, warehouseId: null, change: -9 },
  ]);

  assert.deepEqual(plan, [
    { productId: 10, variantId: 100, warehouseId: 1, quantity: 3 },
    { productId: 10, variantId: 100, warehouseId: 2, quantity: 3 },
  ]);
});

test("restock plan is retry-safe and only repairs a partial restoration", () => {
  assert.deepEqual(
    buildOrderInventoryRestockPlan([
      { productId: 20, variantId: 200, warehouseId: 3, change: -5 },
      { productId: 20, variantId: 200, warehouseId: 3, change: 5 },
    ]),
    [],
  );

  assert.deepEqual(
    buildOrderInventoryRestockPlan([
      { productId: 20, variantId: 200, warehouseId: 3, change: -5 },
      { productId: 20, variantId: 200, warehouseId: 3, change: 2 },
    ]),
    [{ productId: 20, variantId: 200, warehouseId: 3, quantity: 3 }],
  );
});

test("restoration returns deducted stock to its source warehouses exactly once", async () => {
  const { state, tx } = createInventoryTransaction({
    levels: [
      { warehouseId: 1, productId: 10, productVariantId: 100, quantity: 7 },
      { warehouseId: 2, productId: 10, productVariantId: 100, quantity: 2 },
    ],
    logs: [
      { orderId: 50, productId: 10, variantId: 100, warehouseId: 1, change: -3 },
      { orderId: 50, productId: 10, variantId: 100, warehouseId: 2, change: -4 },
      { orderId: 50, productId: 10, variantId: 100, warehouseId: 2, change: 1 },
    ],
  });

  const first = await restoreOrderInventory({
    tx,
    orderId: 50,
    reason: "Order #50 cancelled inventory restoration",
  });
  const second = await restoreOrderInventory({
    tx,
    orderId: 50,
    reason: "Order #50 cancelled inventory restoration retry",
  });

  assert.equal(first.restoredQuantity, 6);
  assert.equal(second.restoredQuantity, 0);
  assert.deepEqual(
    state.levels.map(({ warehouseId, quantity }) => ({ warehouseId, quantity })),
    [
      { warehouseId: 1, quantity: 10 },
      { warehouseId: 2, quantity: 5 },
    ],
  );
  assert.equal(state.variantStock.get(100), 15);
});

test("reservation-only cancellation releases stock without increasing on-hand quantity", async () => {
  const { state, tx } = createInventoryTransaction({
    levels: [
      {
        warehouseId: 1,
        productId: 10,
        productVariantId: 100,
        quantity: 10,
        reserved: 4,
      },
    ],
    logs: [],
    reservations: [{ orderId: 60, stockLevelId: 1, quantity: 4 }],
  });

  const result = await restoreOrderInventory({
    tx,
    orderId: 60,
    reason: "Order #60 failed inventory restoration",
  });

  assert.equal(result.releasedReservationQuantity, 4);
  assert.equal(result.restoredQuantity, 0);
  assert.equal(state.levels[0].quantity, 10);
  assert.equal(state.levels[0].reserved, 0);
  assert.equal(state.variantStock.get(100), 10);
});

test("all order terminal-status entry points use the atomic inventory lifecycle", async () => {
  const [
    schema,
    migration,
    inventory,
    lifecycle,
    checkout,
    orderRoute,
    shipmentRoute,
    deliveryAssignments,
    sslcommerz,
  ] = await Promise.all([
    read("../prisma/schema.prisma"),
    read("../prisma/migrations/20260903_order_inventory_lifecycle/migration.sql"),
    read("../lib/inventory.ts"),
    read("../lib/order-inventory-lifecycle.ts"),
    read("../app/api/orders/route-core.ts"),
    read("../app/api/orders/[id]/route.ts"),
    read("../app/api/shipments/[id]/route.ts"),
    read("../lib/delivery-assignments.ts"),
    read("../lib/sslcommerz.ts"),
  ]);

  assert.match(schema, /model InventoryLog \{[\s\S]*orderId\s+Int\?[\s\S]*order\s+Order\?/);
  assert.match(schema, /@@index\(\[orderId, variantId, warehouseId\]\)/);
  assert.match(migration, /checkout deduction\|SSLCommerz payment capture/);
  assert.match(migration, /InventoryLog_orderId_fkey/);
  assert.match(inventory, /buildOrderInventoryRestockPlan/);
  assert.match(inventory, /where: \{ orderId \}/);
  assert.match(inventory, /quantity: \{ increment: allocation\.quantity \}/);
  assert.match(checkout, /deductVariantInventory\(\{ tx, orderId: o\.id,/);
  assert.match(lifecycle, /FOR UPDATE/);
  assert.match(lifecycle, /OrderStatus\.CANCELLED/);
  assert.match(lifecycle, /OrderStatus\.FAILED/);
  assert.match(lifecycle, /OrderStatus\.RETURNED/);

  for (const source of [orderRoute, shipmentRoute, deliveryAssignments, sslcommerz]) {
    assert.match(source, /transitionOrderStatusWithInventory\(\{/);
  }
  assert.doesNotMatch(orderRoute, /soldCount:\s*Math\.max/);
  assert.doesNotMatch(shipmentRoute, /soldCount:\s*Math\.max/);
});
