# Inventory access per engineer, per project — design

Date: 2026-11-15. Status: approved approach (A), design awaiting approval.

## Intent

Admins need to set inventory access for each engineer on each project
from the user permissions page, independently per project. Example: on
one project with three engineers, one manages stock, one only views it,
one has no access; on the next project the same people can differ.

Access has three levels:

| Level | `view_inventory` | `manage_inventory` | What it allows |
|---|---|---|---|
| بدون وصول | deny | deny | Inventory tile/page hidden |
| عرض فقط | allow | deny | See stock and history |
| إدارة | allow | allow | Also add items, receive and issue stock |

`manage_inventory` implies view everywhere it is checked (RLS
`inventory_can_view`, the mobile layout guard, the desktop page), so
"no access" must deny **both**. Every level writes both rows.

## Goals

- A three-level control for inventory in the **صلاحيات تطبيق الهاتف**
  tab (`MobileBuilderPermissionsTab.tsx`), for the selected user and
  project.
- Until an admin picks a level, the control shows what the person
  currently gets (role, department or company-wide user grant), marked
  **حسب الدور**. A **رجوع للدور** action removes the per-project setting.
- In the **تخصيص مستخدم** tab (`userModuleModel.ts`), inventory gets
  Arabic labels and moves from المشاريع to التشغيل.

## Non-goals

- No database schema, RLS, function or resolver changes. No changes to
  the mobile app or the desktop inventory page; both already check the
  two permissions per project.
- مهندس محدد and مصفوفة المشاريع tabs stay as they are.
- No change to how the tab treats its existing nine rights (including
  its auto-save of defaults).

## Anti-goals (would make this a failure even if it works)

- Opening an engineer's project in the tab changes their inventory
  access. Today the tab auto-saves a per-project row for every right
  that has none; per-project rows beat role grants
  (`resolve_permission_ladder` layer 1), so auto-saving inventory would
  silently freeze or revoke role access. **Inventory is never
  auto-saved**, and is not seeded when a project is assigned.
- A "no access" setting that still lets a manager in (only view denied).

## How it works

- Data: per-project overrides live in `team_member_permission_grants`
  (`project_id, user_id, permission_id, allowed`), the same table the
  tab already writes. Choosing a level upserts both rows in one call
  (`onConflict: project_id,user_id,permission_id`). رجوع للدور deletes
  both rows for that user and project.
- Displayed level is always derived from the resolver, not from the
  rows alone: call `effective_permissions(p_user_id, p_project_id)` for
  the selected user and project and map `(view, manage)` to a level
  (manage → إدارة, else view → عرض فقط, else بدون وصول). Show حسب الدور
  when neither inventory row exists for that user and project, otherwise
  مخصص. This also renders legacy one-row overrides correctly.
- After a change: refetch the tab's grants and invalidate
  `effective-permissions` and `matrix-tm-grants`, as the other toggles
  do. Toast like the other rights: `المخزون والمواد: إدارة` etc.
- Layout: inventory gets its own small section in the project card
  (not inside the existing site/procurement/finance categories), so the
  category "enable all/disable all" buttons and the per-category counts
  are unaffected.
- Bulk actions in the tab:
  - **Copy from another project**: copies inventory too, exactly — the
    source's override rows, or deletes the target's rows if the source
    has none (so "حسب الدور" copies as "حسب الدور").
  - **Assign project**: does not seed inventory rows.
  - **Remove project**: already deletes all of the user's rows for that
    project; nothing to add.
- Per-person tab: add `view_inventory`, `manage_inventory` to
  `EXPLICIT_MODULE_BY_PERMISSION` as `operations`, and short labels
  `مخزون المشروع (عرض)` / `إدارة المخزون (استلام وصرف)` to
  `SHORT_PERMISSION_LABELS`. Classification already gives view / edit.

## Constraints

- Per-project overrides only take effect for people on that project's
  team (resolver layer 1). The tab only lists assigned projects, so
  this holds; an override left after someone leaves the team is inert.
- Saving requires the admin's existing rights on
  `team_member_permission_grants` (same as the other toggles), and
  reading another user's effective permissions requires
  `manage_permissions_company` or `manage_permissions_project`.
- Lint and `tsc` must stay at 0 errors in `src/`.

## Approaches considered

- **A. One three-level control per project (chosen).** Writes both
  permissions together, so combinations can't contradict; shows the
  role's answer until changed; avoids the auto-save trap.
- B. Two switches (view, manage), as maps does today. Least code, but
  allows "manage on, view off", which actually grants full access, and
  inherits the auto-save trap.
- C. Add to مهندس محدد / مصفوفة المشاريع. Those are fixed audit lists of
  core rights, a worse fit for quick per-project edits.

## Left to the builder

- Exact visual of the segmented control, matching the tab's existing
  styles (RTL).
- Whether to extract the effective-permissions call into a small hook.
