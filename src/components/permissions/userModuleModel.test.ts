import { test } from "node:test";
import assert from "node:assert/strict";
import type { PermissionCatalogRow } from "../../types/permissions.types";
import {
  MODULE_DEFINITIONS,
  classifyPermissionAction,
  getPermissionShortLabel,
  resolveModuleForPermission,
} from "./userModuleModel";

// Shaped like the prod catalog rows (2026-11-15).
const row = (name: string, description: string): PermissionCatalogRow => ({
  id: name,
  name,
  area: "Project",
  description,
  is_project_scoped: true,
  parent_permission_id: null,
  is_active: true,
});
const view = row("view_inventory", "View project inventory and consumption ledger");
const manage = row("manage_inventory", "Inventory and material management");

test("inventory permissions are filed under operations", () => {
  assert.equal(resolveModuleForPermission(view), "operations");
  assert.equal(resolveModuleForPermission(manage), "operations");
});

test("inventory permissions have Arabic short labels", () => {
  assert.equal(getPermissionShortLabel(view), "مخزون المشروع (عرض)");
  assert.equal(getPermissionShortLabel(manage), "إدارة المخزون (استلام وصرف)");
});

test("inventory permissions classify as view and edit", () => {
  const ops = MODULE_DEFINITIONS.find((m) => m.id === "operations");
  assert.ok(ops);
  assert.equal(classifyPermissionAction(view, ops), "view");
  assert.equal(classifyPermissionAction(manage, ops), "edit");
});
