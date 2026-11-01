// =====================================================================
// Shared model for the three-state permission control
// =====================================================================
//
// Everything about how a permission grant is edited, validated and
// diffed lives here so the three Phase 3 screens — and the two Phase 6
// screens later — cannot drift apart.
//
// THE THREE STATES, AND WHY "unset" IS NOT "deny"
//   allow  -> a row exists with allowed = true
//   deny   -> a row exists with allowed = false
//   unset  -> NO ROW AT ALL
//
//   The resolver reads an absent row as "this layer has no opinion, ask
//   the next one down" (phase2-resolver.sql, the COALESCE at the bottom
//   of resolve_permission_ladder). If "unset" were stored as
//   allowed = false, every untouched permission on every department
//   would become an explicit deny and nothing below that layer could
//   ever grant anything. That is why saving an "unset" is a DELETE and
//   never an UPDATE — see buildGrantDiff below.
// =====================================================================

import type {
  GrantScope,
  PermissionArea,
  PermissionCatalogRow,
} from "../../types/permissions.types";

export type PermissionState = "allow" | "deny" | "unset";

/** What the editor holds for one permission while the admin works. */
export interface GrantDraft {
  state: PermissionState;
  /**
   * Required when state !== "unset" AND the permission is project-scoped.
   * Deliberately nullable and deliberately NOT defaulted: the admin has
   * to choose (guide section 2.4 — "Make the UI force the decision
   * rather than defaulting silently"). validateDrafts() blocks the save
   * until they do.
   */
  scope: GrantScope | null;
  /** Free text, stored in the grant row's note column. */
  note: string;
}

export type DraftMap = Record<string, GrantDraft>;

export const EMPTY_DRAFT: GrantDraft = {
  state: "unset",
  scope: null,
  note: "",
};

/**
 * The suggested (not applied) scope. guide section 2.4: "If you want a
 * default, make it team projects only, the safer of the two." It is
 * shown as a hint in the UI; it is never written unless clicked.
 */
export const SUGGESTED_SCOPE: GrantScope = "team_projects_only";

export const AREA_ORDER: PermissionArea[] = [
  "Admin",
  "Project",
  "Finance",
  "HR",
  "Operations",
];

export const AREA_LABELS: Record<PermissionArea, string> = {
  Admin: "الإدارة",
  Project: "المشاريع",
  Finance: "المالية",
  HR: "الموارد البشرية",
  Operations: "العمليات",
};

export const SCOPE_LABELS: Record<GrantScope, string> = {
  all_projects: "كل المشاريع",
  team_projects_only: "مشاريع الفريق فقط",
};

export const SCOPE_HELP: Record<GrantScope, string> = {
  all_projects:
    "يسري على كل مشاريع الشركة، سواء كان الشخص ضمن فريق المشروع أو لا. مناسب للوظائف المكتبية مثل المالية وإدخال البيانات.",
  team_projects_only:
    "يسري فقط على المشاريع التي يكون الشخص عضواً في فريقها. مناسب للعمل الميداني مثل المهندسين.",
};

export const STATE_LABELS: Record<PermissionState, string> = {
  allow: "مسموح",
  deny: "ممنوع",
  unset: "افتراضي الدور",
};

// ---------------------------------------------------------------------
// Building the initial draft from what is already saved
// ---------------------------------------------------------------------

export interface ExistingGrant {
  permission_id: string;
  allowed: boolean;
  /**
   * NULL for the two project layers (Phase 6). project_permission_defaults
   * and team_member_permission_grants have no scope column at all — the
   * row is already attached to one project, so the all-projects /
   * team-projects-only question cannot arise. See SCOPELESS below.
   */
  scope: GrantScope | null;
  note: string | null;
}

// ---------------------------------------------------------------------
// Scoped vs scopeless layers
// ---------------------------------------------------------------------
//
// Three of the five layers (role, department, user) are company-wide, so
// a project-scoped permission granted there has to say WHICH projects it
// covers. The other two (project default, team-member override) are
// already pinned to one project, so asking again would be nonsense.
//
// Passing scoped=false does three things: the scope selector is not
// rendered, validateDrafts stops demanding a choice, and buildGrantDiff
// emits scope: null so the write matches a table that has no such column.
export type LayerShape = "scoped" | "scopeless";

export function draftsFromGrants(
  catalog: PermissionCatalogRow[],
  grants: ExistingGrant[],
): DraftMap {
  const byPermission = new Map(grants.map((g) => [g.permission_id, g]));
  const drafts: DraftMap = {};

  for (const permission of catalog) {
    const existing = byPermission.get(permission.id);
    drafts[permission.id] = existing
      ? {
          state: existing.allowed ? "allow" : "deny",
          // A stored row always has a scope (the column is NOT NULL).
          // It is only surfaced for project-scoped permissions; for
          // company-wide ones the stored value is meaningless and the
          // control hides it.
          scope: existing.scope,
          note: existing.note ?? "",
        }
      : { ...EMPTY_DRAFT };
  }

  return drafts;
}

// ---------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------

export interface ValidationProblem {
  permissionId: string;
  permissionName: string;
  message: string;
}

/**
 * The one hard rule this phase enforces: a project-scoped permission
 * set to allow or deny must carry an explicit scope. No silent default.
 */
export function validateDrafts(
  catalog: PermissionCatalogRow[],
  drafts: DraftMap,
  shape: LayerShape = "scoped",
): ValidationProblem[] {
  const problems: ValidationProblem[] = [];

  // A scopeless layer has nothing to validate — there is no choice to
  // force, because there is no column to write it to.
  if (shape === "scopeless") return problems;

  for (const permission of catalog) {
    const draft = drafts[permission.id];
    if (!draft || draft.state === "unset") continue;
    if (!permission.is_project_scoped) continue;
    if (draft.scope === null) {
      problems.push({
        permissionId: permission.id,
        permissionName: permission.name,
        message: "يجب اختيار نطاق التطبيق (كل المشاريع / مشاريع الفريق فقط)",
      });
    }
  }

  return problems;
}

// ---------------------------------------------------------------------
// Diffing — what actually gets written
// ---------------------------------------------------------------------

export interface GrantWrite {
  permission_id: string;
  allowed: boolean;
  /** null on a scopeless layer — the table has no scope column. */
  scope: GrantScope | null;
  note: string | null;
}

export interface GrantDiff {
  /** Rows to insert or update. */
  upserts: GrantWrite[];
  /** Permission ids whose row must be DELETED (state moved to "unset"). */
  deletes: string[];
  /** True when nothing at all changed — the save button stays idle. */
  isEmpty: boolean;
}

export function buildGrantDiff(
  catalog: PermissionCatalogRow[],
  original: DraftMap,
  current: DraftMap,
  shape: LayerShape = "scoped",
): GrantDiff {
  const scoped = shape === "scoped";
  const upserts: GrantWrite[] = [];
  const deletes: string[] = [];

  for (const permission of catalog) {
    const before = original[permission.id] ?? EMPTY_DRAFT;
    const after = current[permission.id] ?? EMPTY_DRAFT;

    const scopeBefore =
      scoped && permission.is_project_scoped ? before.scope : null;
    const scopeAfter =
      scoped && permission.is_project_scoped ? after.scope : null;

    const unchanged =
      before.state === after.state &&
      scopeBefore === scopeAfter &&
      (before.note ?? "") === (after.note ?? "");

    if (unchanged) continue;

    if (after.state === "unset") {
      // Only worth a DELETE if a row was actually there.
      if (before.state !== "unset") deletes.push(permission.id);
      continue;
    }

    upserts.push({
      permission_id: permission.id,
      allowed: after.state === "allow",
      // Scopeless layers write null; the caller drops the field entirely.
      // On a scoped layer, company-wide permissions still need a value
      // because the column is NOT NULL — phase1-schema.sql says to store
      // 'all_projects' and ignore it, and the resolver never reads it.
      scope: !scoped
        ? null
        : permission.is_project_scoped
          ? (after.scope as GrantScope)
          : "all_projects",
      note: after.note.trim() === "" ? null : after.note.trim(),
    });
  }

  return {
    upserts,
    deletes,
    isEmpty: upserts.length === 0 && deletes.length === 0,
  };
}

// ---------------------------------------------------------------------
// Plain-language summary of a pending change
// ---------------------------------------------------------------------

/**
 * Turns a diff into the sentence the guide asks for in section 4.1
 * step 7, e.g.
 *   "أي شخص في قسم المساحة سيتمكن من: عرض خرائط المشروع، عرض بيانات
 *    المساحة — على المشاريع التي يكون عضواً في فريقها — ما لم تنص قاعدة
 *    أكثر تحديداً على خلاف ذلك."
 *
 * Returns one line per distinct (effect, scope) combination rather than
 * one giant sentence, because a real change usually mixes allows,
 * denies and both scopes, and cramming those into one sentence produces
 * something nobody reads.
 */
export function describeChange(
  catalog: PermissionCatalogRow[],
  diff: GrantDiff,
  subjectPhrase: string,
): string[] {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const lines: string[] = [];

  const bucket = (
    predicate: (w: GrantWrite) => boolean,
  ): PermissionCatalogRow[] =>
    diff.upserts
      .filter(predicate)
      .map((w) => byId.get(w.permission_id))
      .filter((p): p is PermissionCatalogRow => Boolean(p));

  const describe = (
    permissions: PermissionCatalogRow[],
    verb: string,
    scopeSuffix: string,
  ) => {
    if (permissions.length === 0) return;
    const names = permissions.map((p) => p.description || p.name).join("، ");
    lines.push(
      `${subjectPhrase} ${verb}: ${names}${scopeSuffix} — ما لم تنص قاعدة أكثر تحديداً على خلاف ذلك.`,
    );
  };

  // On a scopeless layer every write has scope === null, so the two
  // scope-specific buckets below stay empty and everything lands here.
  describe(
    bucket(
      (w) =>
        w.allowed &&
        (w.scope === null ||
          byId.get(w.permission_id)?.is_project_scoped === false),
    ),
    "سيتمكن من",
    "",
  );
  describe(
    bucket(
      (w) =>
        w.allowed &&
        byId.get(w.permission_id)?.is_project_scoped === true &&
        w.scope === "all_projects",
    ),
    "سيتمكن من",
    " — على كل المشاريع",
  );
  describe(
    bucket(
      (w) =>
        w.allowed &&
        byId.get(w.permission_id)?.is_project_scoped === true &&
        w.scope === "team_projects_only",
    ),
    "سيتمكن من",
    " — على المشاريع التي يكون عضواً في فريقها",
  );
  describe(
    bucket((w) => !w.allowed),
    "سيُمنع صراحةً من",
    "",
  );

  if (diff.deletes.length > 0) {
    const names = diff.deletes
      .map((id) => byId.get(id))
      .filter((p): p is PermissionCatalogRow => Boolean(p))
      .map((p) => p.description || p.name)
      .join("، ");
    lines.push(
      `سيتم إزالة القاعدة (وتصبح "غير محدد") لـ: ${names}. عندها تُحسم الصلاحية من المستوى الأقل تحديداً.`,
    );
  }

  return lines;
}
