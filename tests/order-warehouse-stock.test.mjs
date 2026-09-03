import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOrderWarehouseStockAvailability,
  canWarehouseFulfillOrder,
  getOrderWarehouseStockAvailability,
} from "../lib/order-warehouse-stock.ts";

function demand(entries, hasUntrackedUnits = false) {
  return {
    requiredUnits: entries.reduce((total, [, quantity]) => total + quantity, 0),
    hasUntrackedUnits,
    byVariant: new Map(entries),
  };
}

test("warehouse fulfilment checks every required variant, not only total units", () => {
  const availability = buildOrderWarehouseStockAvailability({
    warehouseIds: [1, 2],
    demand: demand([
      [101, 2],
      [202, 1],
    ]),
    stockLevels: [
      { warehouseId: 1, variantId: 101, quantity: 3, reserved: 0 },
      { warehouseId: 1, variantId: 202, quantity: 0, reserved: 0 },
      { warehouseId: 2, variantId: 101, quantity: 2, reserved: 0 },
      { warehouseId: 2, variantId: 202, quantity: 1, reserved: 0 },
    ],
    reservations: [],
    movements: [],
  });

  assert.deepEqual(availability, {
    requiresStock: true,
    requiredUnits: 3,
    warehouses: [
      { warehouseId: 1, requiredUnits: 3, availableUnits: 3, canFulfill: false },
      { warehouseId: 2, requiredUnits: 3, availableUnits: 3, canFulfill: true },
    ],
  });
});

test("an order's reservation remains available to that order only", () => {
  const availability = buildOrderWarehouseStockAvailability({
    warehouseIds: [1],
    demand: demand([[101, 3]]),
    stockLevels: [
      { warehouseId: 1, variantId: 101, quantity: 5, reserved: 5 },
    ],
    reservations: [{ warehouseId: 1, variantId: 101, quantity: 3 }],
    movements: [],
  });

  assert.deepEqual(availability.warehouses[0], {
    warehouseId: 1,
    requiredUnits: 3,
    availableUnits: 3,
    canFulfill: true,
  });
});

test("committed checkout deductions are not demanded a second time", () => {
  const availability = buildOrderWarehouseStockAvailability({
    warehouseIds: [1],
    demand: demand([[101, 4]]),
    stockLevels: [
      { warehouseId: 1, variantId: 101, quantity: 1, reserved: 0 },
    ],
    reservations: [],
    movements: [
      { warehouseId: 1, variantId: 101, change: -4 },
      { warehouseId: 1, variantId: 101, change: 1 },
    ],
  });

  assert.deepEqual(availability.warehouses[0], {
    warehouseId: 1,
    requiredUnits: 4,
    availableUnits: 4,
    canFulfill: true,
  });
});

test("digital-only orders do not require warehouse stock", () => {
  const availability = buildOrderWarehouseStockAvailability({
    warehouseIds: [1],
    demand: demand([]),
    stockLevels: [],
    reservations: [],
    movements: [],
  });

  assert.deepEqual(availability, {
    requiresStock: false,
    requiredUnits: 0,
    warehouses: [
      { warehouseId: 1, requiredUnits: 0, availableUnits: 0, canFulfill: true },
    ],
  });
});

function createClient() {
  return {
    orderItem: {
      findMany: async () => [{ variantId: 101, quantity: 2 }],
    },
    warehouse: {
      findMany: async () => [{ id: 1 }, { id: 2 }],
    },
    stockLevel: {
      findMany: async () => [
        { warehouseId: 1, productVariantId: 101, quantity: 2, reserved: 0 },
        { warehouseId: 2, productVariantId: 101, quantity: 1, reserved: 0 },
      ],
    },
    inventoryReservation: { findMany: async () => [] },
    inventoryLog: { findMany: async () => [] },
  };
}

test("database-backed availability and boolean guard share the same rules", async () => {
  const client = createClient();
  const availability = await getOrderWarehouseStockAvailability(client, 50);

  assert.equal(availability.warehouses[0].canFulfill, true);
  assert.equal(availability.warehouses[1].canFulfill, false);
  assert.equal(await canWarehouseFulfillOrder(client, 50, 1), true);
  assert.equal(await canWarehouseFulfillOrder(client, 50, 2), false);
  assert.equal(await canWarehouseFulfillOrder(client, 50, 999), false);
});
