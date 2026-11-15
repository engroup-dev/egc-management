# Inventory Access Per Engineer, Per Project — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins set each engineer's inventory access (بدون وصول / عرض فقط / إدارة) per project from the صلاحيات تطبيق الهاتف tab, and label inventory properly in the تخصيص مستخدم tab.

**Architecture:** Pure level logic in one small module with unit tests; one hook that reads the resolver's answer and writes/deletes the two per-project override rows; one new section component mounted in the existing project card of `MobileBuilderPermissionsTab.tsx`. Inventory is deliberately *not* added to `PROJECT_RIGHTS_CATALOG`, which keeps it out of that tab's auto-save, project-assign seeding, category bulk toggles and counts.

**Tech Stack:** Electron + React 19 + TypeScript, TanStack Query, Supabase JS (`permissionsDb`), Tailwind. Unit tests: Node's built-in `node:test`, compiled with the esbuild that Vite already ships (no new dependencies).

**Spec:** `docs/superpowers/specs/2026-11-15-inventory-project-permissions-design.md`

## Global Constraints

- Branch `feature/inventory-permissions`. The uncommitted dropdown changes in `SearchableSelectField.tsx` and `InventoryManagementPage.tsx` are a separate change: never stage them in this plan's commits (`git add` explicit paths only).
- No database schema, RLS, function or resolver changes. No changes to the mobile app or the desktop inventory page.
- Levels and their rows, exactly: بدون وصول = view deny + manage deny; عرض فقط = view allow + manage deny; إدارة = view allow + manage allow. Every level writes **both** rows.
- Per-project rows go in `team_member_permission_grants` (`project_id, user_id, permission_id, allowed, granted_by, granted_at`), upsert `onConflict: "project_id,user_id,permission_id"`.
- Inventory is never auto-saved by opening a project, and never seeded when a project is assigned.
- Displayed level comes from `effective_permissions(p_user_id, p_project_id)`; badge is حسب الدور when neither inventory row exists for that user+project, otherwise مخصص.
- Copy-from-project copies inventory rows exactly; source with no rows → target's rows deleted.
- Per-person tab labels, exactly: `view_inventory` → `مخزون المشروع (عرض)`, `manage_inventory` → `إدارة المخزون (استلام وصرف)`; both filed under module `operations`.
- UI copy, exactly: section title `المخزون والمواد`; badges `حسب الدور` / `مخصص`; reset link `رجوع للدور`; toasts `المخزون والمواد: <level label>` and, after reset, `المخزون والمواد: حسب الدور`.
- Gates: `npm test` passes; `npx eslint` on changed files 0 errors; `node_modules/.bin/tsc --noEmit -p .` 0 errors under `src/`; `npx electron-forge package` succeeds.

## Review Focus

1. **Opening a project must not change access.** Selecting a project in the tab writes no inventory rows (the tab's auto-sync must not pick them up). Pinned in Task 4 Step 5.
2. **Resolver read fails** (admin lacks `manage_permissions_company`/`manage_permissions_project`, network error): show an error with retry, never "بدون وصول". Pinned in Task 3 (hook returns `level: null` + `isError`) and Task 4 Step 5.
3. **Inventory permissions missing from the catalog** (an older database): the section is hidden, nothing crashes. Pinned in Task 1 test `inventoryPermIds returns null when either is missing`.
4. **Double-clicks / fast switching:** the control is disabled while a save is in flight, and query keys include both user and project so one engineer's level never shows on another. Pinned in Task 4 Step 5.
5. **Legacy one-row overrides** (only `manage_inventory` row present): level shown from the resolver, badge مخصص, copy reproduces exactly that one row. Pinned in Task 1 tests for `planInventoryCopy` and `isInventoryCustomized`.

---

### Task 1: Inventory level logic + unit-test runner

**Files:**
- Create: `scripts/run-unit-tests.mjs`
- Modify: `package.json` (`scripts.test`)
- Create: `src/components/permissions/inventoryAccess.ts`
- Test: `src/components/permissions/inventoryAccess.test.ts`

**Interfaces:**
- Produces (all exported from `inventoryAccess.ts`):
  - `type InventoryLevel = "none" | "view" | "manage"`
  - `const INVENTORY_PERMISSION_NAMES: { view: "view_inventory"; manage: "manage_inventory" }`
  - `const INVENTORY_LEVELS: InventoryLevel[]` — display order `["none", "view", "manage"]`
  - `const INVENTORY_LEVEL_LABELS: Record<InventoryLevel, string>` — `بدون وصول`, `عرض فقط`, `إدارة`
  - `interface InventoryPermIds { view: string; manage: string }`
  - `inventoryPermIds(permMap: Map<string, string>): InventoryPermIds | null`
  - `levelFromEffective(view: boolean, manage: boolean): InventoryLevel`
  - `grantsForLevel(level: InventoryLevel): { view: boolean; manage: boolean }`
  - `isInventoryCustomized(grantMap: Map<string, boolean>, projectId: string, ids: InventoryPermIds): boolean` — `grantMap` keys are `${projectId}:${permissionId}`, as the tab's `teamGrantMap`
  - `planInventoryCopy(source: { view?: boolean; manage?: boolean }): { upsert: { key: "view" | "manage"; allowed: boolean }[]; remove: ("view" | "manage")[] }`

- [ ] **Step 1: Add the runner.** `scripts/run-unit-tests.mjs`: find every `src/**/*.test.ts` (`fs.readdirSync(..., { recursive: true })`), build each with esbuild's JS API (`bundle: true, platform: "node", format: "esm", packages: "external"`) into `node_modules/.cache/unit-tests/`, then run `node --test` on the outputs and exit with its code. Add `"test": "node scripts/run-unit-tests.mjs"` to `package.json` scripts.

- [ ] **Step 2: Write the failing tests** in `inventoryAccess.test.ts` (`node:test`, `node:assert/strict`, import from `./inventoryAccess`):

```ts
test("levelFromEffective", () => {
  assert.equal(levelFromEffective(false, false), "none");
  assert.equal(levelFromEffective(true, false), "view");
  assert.equal(levelFromEffective(true, true), "manage");
  assert.equal(levelFromEffective(false, true), "manage"); // manage implies view
});
test("grantsForLevel writes both rows for every level", () => {
  assert.deepEqual(grantsForLevel("none"), { view: false, manage: false });
  assert.deepEqual(grantsForLevel("view"), { view: true, manage: false });
  assert.deepEqual(grantsForLevel("manage"), { view: true, manage: true });
});
test("round trip", () => {
  for (const l of INVENTORY_LEVELS) {
    const g = grantsForLevel(l);
    assert.equal(levelFromEffective(g.view, g.manage), l);
  }
});
test("labels", () => {
  assert.deepEqual(INVENTORY_LEVELS, ["none", "view", "manage"]);
  assert.deepEqual(INVENTORY_LEVEL_LABELS, { none: "بدون وصول", view: "عرض فقط", manage: "إدارة" });
});
test("inventoryPermIds returns null when either is missing", () => {
  assert.deepEqual(inventoryPermIds(new Map([["view_inventory", "v"], ["manage_inventory", "m"]])), { view: "v", manage: "m" });
  assert.equal(inventoryPermIds(new Map([["view_inventory", "v"]])), null);
  assert.equal(inventoryPermIds(new Map()), null);
});
test("isInventoryCustomized", () => {
  const ids = { view: "v", manage: "m" };
  assert.equal(isInventoryCustomized(new Map(), "p1", ids), false);
  assert.equal(isInventoryCustomized(new Map([["p2:v", true]]), "p1", ids), false); // other project
  assert.equal(isInventoryCustomized(new Map([["p1:m", false]]), "p1", ids), true);  // legacy one row
  assert.equal(isInventoryCustomized(new Map([["p1:v", false], ["p1:m", false]]), "p1", ids), true);
});
test("planInventoryCopy copies rows exactly", () => {
  assert.deepEqual(planInventoryCopy({}), { upsert: [], remove: ["view", "manage"] });
  assert.deepEqual(planInventoryCopy({ view: true, manage: false }),
    { upsert: [{ key: "view", allowed: true }, { key: "manage", allowed: false }], remove: [] });
  assert.deepEqual(planInventoryCopy({ manage: false }),
    { upsert: [{ key: "manage", allowed: false }], remove: ["view"] });
});
```

- [ ] **Step 3: Run** `npm test`. Expected: FAIL (module/exports not found).

- [ ] **Step 4: Implement `inventoryAccess.ts`** with the exports above. No React, no Supabase imports.

- [ ] **Step 5: Run** `npm test`. Expected: `# pass 7`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add scripts/run-unit-tests.mjs package.json src/components/permissions/inventoryAccess.ts src/components/permissions/inventoryAccess.test.ts
git commit -m "feat(permissions): inventory access levels and unit-test runner"
```

### Task 2: Per-person tab labels and module

**Files:**
- Modify: `src/components/permissions/userModuleModel.ts` (`EXPLICIT_MODULE_BY_PERMISSION`, `SHORT_PERMISSION_LABELS`, Operations block)
- Test: `src/components/permissions/userModuleModel.test.ts`

**Interfaces:**
- Consumes: existing `resolveModuleForPermission(permission: PermissionCatalogRow): ModuleId`, `getPermissionShortLabel(permission: PermissionCatalogRow): string`, `classifyPermissionAction(permission, moduleDef): ActionCategory`.

- [ ] **Step 1: Write the failing test.** Build two `PermissionCatalogRow` fixtures matching prod (`area: "Project"`, `is_project_scoped: true`, descriptions `"View project inventory and consumption ledger"` / `"Inventory and material management"`), then:

```ts
assert.equal(resolveModuleForPermission(view), "operations");
assert.equal(resolveModuleForPermission(manage), "operations");
assert.equal(getPermissionShortLabel(view), "مخزون المشروع (عرض)");
assert.equal(getPermissionShortLabel(manage), "إدارة المخزون (استلام وصرف)");
const ops = MODULE_DEFINITIONS.find((m) => m.id === "operations")!;
assert.equal(classifyPermissionAction(view, ops), "view");
assert.equal(classifyPermissionAction(manage, ops), "edit");
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL (`"projects" !== "operations"`).
- [ ] **Step 3: Add the two entries** to both maps in the Operations sections.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit**

```bash
git add src/components/permissions/userModuleModel.ts src/components/permissions/userModuleModel.test.ts
git commit -m "feat(permissions): label inventory permissions under operations"
```

### Task 3: Read/write hook

**Files:**
- Create: `src/hooks/permissions/useProjectInventoryAccess.ts`

**Interfaces:**
- Consumes: Task 1's `InventoryLevel`, `InventoryPermIds`, `INVENTORY_PERMISSION_NAMES`, `levelFromEffective`, `grantsForLevel`.
- Produces:
  - `useProjectInventoryAccess(userId: string | undefined, projectId: string | null): { level: InventoryLevel | null; isLoading: boolean; isError: boolean; refetch: () => void }`
    - `permissionsDb.rpc("effective_permissions", { p_user_id, p_project_id })`, keep the two inventory rows, `levelFromEffective`.
    - queryKey `["effective-permissions", userId, projectId, "inventory"]` (so the tab's existing `invalidateQueries({ queryKey: ["effective-permissions"] })` refreshes it); `enabled` only when both ids exist; `level` is `null` while loading or on error.
  - `useSetProjectInventoryAccess(): UseMutationResult<void, Error, { userId: string; projectId: string; ids: InventoryPermIds; level: InventoryLevel | "role"; grantedBy: string | null }>`
    - level `"role"`: delete both rows (`.eq("project_id").eq("user_id").in("permission_id", [ids.view, ids.manage])`).
    - otherwise: one upsert of both rows from `grantsForLevel`, `granted_at: new Date().toISOString()`.
    - `onSuccess`: invalidate `["effective-permissions"]`, `["user-tm-grants", userId]`, `["matrix-tm-grants"]`.

- [ ] **Step 1: Implement** the two hooks, following the query/mutation style of `src/hooks/permissions/useProjectGrants.ts`.
- [ ] **Step 2: Verify** `node_modules/.bin/tsc --noEmit -p . 2>&1 | grep '^src/'` prints nothing, and `npx eslint src/hooks/permissions/useProjectInventoryAccess.ts` has 0 errors.
- [ ] **Step 3: Commit**

```bash
git add src/hooks/permissions/useProjectInventoryAccess.ts
git commit -m "feat(permissions): hook to read and set per-project inventory access"
```

### Task 4: Inventory section in the phone-app tab, and copy

**Files:**
- Create: `src/components/permissions/InventoryAccessSection.tsx`
- Modify: `src/components/permissions/MobileBuilderPermissionsTab.tsx` (mount after the finance category block, ~line 1262; `handleCopyPermissionsFrom`, ~line 667)

**Interfaces:**
- Consumes: Tasks 1 and 3.
- Produces: `InventoryAccessSection(props: { userId: string; projectId: string; ids: InventoryPermIds; customized: boolean; grantedBy: string | null; onToast: (message: string) => void }): JSX.Element`

- [ ] **Step 1: Build `InventoryAccessSection`.** Title `المخزون والمواد`; three-segment control in `INVENTORY_LEVELS` order with `INVENTORY_LEVEL_LABELS`, selected = `level`; badge `حسب الدور` when `!customized`, `مخصص` when `customized`; `رجوع للدور` link only when `customized`. All controls disabled while loading or while the mutation is pending. On `isError`: short error text plus a retry button calling `refetch`, no level selected. After a successful change, toast `المخزون والمواد: <INVENTORY_LEVEL_LABELS[level]>`; after a reset, toast `المخزون والمواد: حسب الدور`. Match the tab's existing card styles (RTL).
- [ ] **Step 2: Mount it** in the active project card when `inventoryPermIds(permMap)` is non-null; `customized = isInventoryCustomized(teamGrantMap, activeProjectId, ids)`; `onToast` = the tab's `showToast(message, projectName)`. Do not add inventory to `PROJECT_RIGHTS_CATALOG`.
- [ ] **Step 3: Extend `handleCopyPermissionsFrom`.** Read the source project's inventory rows from `teamGrantMap`, pass `{ view?, manage? }` to `planInventoryCopy`, include its `upsert` rows in the existing upsert call, and delete its `remove` keys for the target project. Assign-project seeding and the auto-sync effect stay untouched (they iterate `PROJECT_RIGHTS_CATALOG` only).
- [ ] **Step 4: Gates.** `npm test` passes; `node_modules/.bin/tsc --noEmit -p . 2>&1 | grep '^src/'` prints nothing; `npx eslint` on both files 0 errors.
- [ ] **Step 5: Manual check against the clone** (switch `egc-management/.env` to the clone first; never run this against prod). With a test engineer on two clone projects:
  1. Count that user's inventory rows: `select count(*) from team_member_permission_grants g join permission_catalog pc on pc.id=g.permission_id where g.user_id='<id>' and pc.name like '%inventory'` → note N. Open each project in the tab → count still N (Review Focus 1). Badge shows حسب الدور, level matches the role (Engineer on clone = إدارة).
  2. Set project A to عرض فقط → 2 rows (view true, manage false), badge مخصص, toast `المخزون والمواد: عرض فقط`. Then بدون وصول → both false. Then رجوع للدور → 0 rows, badge حسب الدور.
  3. Double-click a segment rapidly → one save; controls disabled in between (Review Focus 4). Switch user/project quickly → each shows its own level.
  4. Copy from A (custom عرض فقط) to B → B has the same 2 rows. Copy from a project with no rows → B's rows deleted.
  5. Sign in to the phone debug build (clone) as that engineer: project A tile hidden at بدون وصول, add/issue/receive hidden at عرض فقط, all visible at إدارة.
  6. Temporarily revoke `manage_permissions_company` from the admin used for testing, or block the network → section shows the error and retry, not بدون وصول (Review Focus 2). Restore it afterwards.
- [ ] **Step 6: Commit**

```bash
git add src/components/permissions/InventoryAccessSection.tsx src/components/permissions/MobileBuilderPermissionsTab.tsx
git commit -m "feat(permissions): per-project inventory access in the phone-app tab"
```

### Task 5: Branch gates and PR

- [ ] **Step 1:** `npm test`, `npx eslint` on all changed files, `node_modules/.bin/tsc --noEmit -p . 2>&1 | grep -c '^src/'` → `0`, `npx electron-forge package` → succeeds.
- [ ] **Step 2:** Confirm `git diff master --stat` contains only this plan's files plus the spec and plan docs (no dropdown changes).
- [ ] **Step 3:** Push `feature/inventory-permissions` and open a PR against `master` describing: the three levels, no-auto-save behaviour, copy behaviour, per-person labels, how it was verified (clone, steps above), and that no DB change is needed.
