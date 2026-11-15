import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INVENTORY_LEVELS,
  INVENTORY_LEVEL_LABELS,
  grantsForLevel,
  inventoryPermIds,
  isInventoryCustomized,
  levelFromEffective,
  planInventoryCopy,
} from "./inventoryAccess";

test("levelFromEffective", () => {
  assert.equal(levelFromEffective(false, false), "none");
  assert.equal(levelFromEffective(true, false), "view");
  assert.equal(levelFromEffective(true, true), "manage");
  // manage implies view, wherever it is checked
  assert.equal(levelFromEffective(false, true), "manage");
});

test("grantsForLevel writes both rows for every level", () => {
  assert.deepEqual(grantsForLevel("none"), { view: false, manage: false });
  assert.deepEqual(grantsForLevel("view"), { view: true, manage: false });
  assert.deepEqual(grantsForLevel("manage"), { view: true, manage: true });
});

test("grantsForLevel and levelFromEffective round trip", () => {
  for (const level of INVENTORY_LEVELS) {
    const g = grantsForLevel(level);
    assert.equal(levelFromEffective(g.view, g.manage), level);
  }
});

test("levels and labels", () => {
  assert.deepEqual(INVENTORY_LEVELS, ["none", "view", "manage"]);
  assert.deepEqual(INVENTORY_LEVEL_LABELS, {
    none: "بدون وصول",
    view: "عرض فقط",
    manage: "إدارة",
  });
});

test("inventoryPermIds returns null when either is missing", () => {
  assert.deepEqual(
    inventoryPermIds(
      new Map([
        ["view_inventory", "v"],
        ["manage_inventory", "m"],
      ]),
    ),
    { view: "v", manage: "m" },
  );
  assert.equal(inventoryPermIds(new Map([["view_inventory", "v"]])), null);
  assert.equal(inventoryPermIds(new Map()), null);
});

test("isInventoryCustomized", () => {
  const ids = { view: "v", manage: "m" };
  assert.equal(isInventoryCustomized(new Map(), "p1", ids), false);
  // a row on another project doesn't count
  assert.equal(isInventoryCustomized(new Map([["p2:v", true]]), "p1", ids), false);
  // a legacy one-row override counts
  assert.equal(isInventoryCustomized(new Map([["p1:m", false]]), "p1", ids), true);
  assert.equal(
    isInventoryCustomized(
      new Map([
        ["p1:v", false],
        ["p1:m", false],
      ]),
      "p1",
      ids,
    ),
    true,
  );
});

test("planInventoryCopy copies rows exactly", () => {
  assert.deepEqual(planInventoryCopy({}), { upsert: [], remove: ["view", "manage"] });
  assert.deepEqual(planInventoryCopy({ view: true, manage: false }), {
    upsert: [
      { key: "view", allowed: true },
      { key: "manage", allowed: false },
    ],
    remove: [],
  });
  assert.deepEqual(planInventoryCopy({ manage: false }), {
    upsert: [{ key: "manage", allowed: false }],
    remove: ["view"],
  });
});
