import { Check, Minus, X, Info } from "lucide-react";
import type {
  GrantScope,
  PermissionCatalogRow,
} from "../../types/permissions.types";
import {
  GrantDraft,
  PermissionState,
  SCOPE_HELP,
  SCOPE_LABELS,
  SUGGESTED_SCOPE,
} from "./permissionModel";

// =====================================================================
// One permission = one row of the control.
// =====================================================================
// Three parts, left to right (RTL: right to left):
//   1. name + description
//   2. optional "where it came from" context (read-only, informational)
//   3. the three-state selector, and — only for project-scoped
//      permissions that are set to allow/deny — the scope selector
//
// The scope selector is intentionally UNSET until clicked. An unchosen
// scope blocks the save with a visible error rather than silently
// defaulting, per guide section 2.4.
// =====================================================================

export interface InheritedContext {
  /** What the person has today, before this screen's override. */
  label: string;
  /** Where it came from: "من دور مهندس", "من قسم الكهرباء", "غير ممنوحة". */
  sourceLabel: string;
  tone: "granted" | "denied" | "none";
}

interface PermissionRowProps {
  permission: PermissionCatalogRow;
  draft: GrantDraft;
  onChange: (next: GrantDraft) => void;
  /** Read-only context shown next to the control. Screen 3 only. */
  inherited?: InheritedContext;
  /** Screen 3 shows a per-permission reason field. */
  showNote?: boolean;
  /** Set when validation failed for this row. */
  errorMessage?: string;
  disabled?: boolean;
  /**
   * False on the two project layers (Phase 6): the grant is already
   * attached to one project, so there is no scope to choose and no
   * column to store it in.
   */
  showScope?: boolean;
}

const STATE_BUTTONS: {
  value: PermissionState;
  label: string;
  hint: string;
  icon: typeof Check;
  activeClass: string;
}[] = [
  {
    value: "allow",
    label: "مسموح",
    hint: "منح استثناء مسموح لهذا الشخص تحديداً (حتى لو لم يكن مسموحاً في دوره)",
    icon: Check,
    activeClass: "bg-green-600 text-white border-green-600",
  },
  {
    value: "deny",
    label: "ممنوع",
    hint: "حجب هذه الصلاحية عن هذا الشخص تحديداً (حتى لو كان دوره يسمح بها)",
    icon: X,
    activeClass: "bg-red-600 text-white border-red-600",
  },
  {
    value: "unset",
    label: "افتراضي الدور",
    hint: "لا يوجد استثناء فردي — يتبع تلقائياً ما هو محدد في دوره وقسمه",
    icon: Minus,
    activeClass: "bg-gray-700 text-white border-gray-700",
  },
];

const TONE_CLASSES: Record<InheritedContext["tone"], string> = {
  granted: "text-green-700 bg-green-50 border-green-200",
  denied: "text-red-700 bg-red-50 border-red-200",
  none: "text-gray-500 bg-gray-50 border-gray-200",
};

export default function PermissionRow({
  permission,
  draft,
  onChange,
  inherited,
  showNote = false,
  errorMessage,
  disabled = false,
  showScope = true,
}: PermissionRowProps) {
  const needsScope =
    showScope && permission.is_project_scoped && draft.state !== "unset";
  const scopeMissing = needsScope && draft.scope === null;

  const setState = (state: PermissionState) => {
    if (state === "unset") {
      // Moving back to "not set" clears the scope too. Keeping a stale
      // scope around would let a later re-enable silently reuse a choice
      // the admin never made this time.
      onChange({ ...draft, state, scope: null });
      return;
    }
    onChange({ ...draft, state });
  };

  const setScope = (scope: GrantScope) => onChange({ ...draft, scope });

  return (
    <div
      className={`border rounded-lg p-3 transition-colors ${
        scopeMissing || errorMessage
          ? "border-amber-400 bg-amber-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Identity */}
        <div className="min-w-[220px] flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">
              {permission.description || permission.name}
            </span>
            {permission.is_project_scoped && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                مرتبطة بمشروع
              </span>
            )}
          </div>
          <code className="text-[11px] text-gray-400" dir="ltr">
            {permission.name}
          </code>

          {inherited && (
            <div
              className={`mt-2 inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border ${
                TONE_CLASSES[inherited.tone]
              }`}
            >
              <Info size={12} />
              <span>
                حالياً: {inherited.label} · {inherited.sourceLabel}
              </span>
            </div>
          )}
        </div>

        {/* Three-state selector */}
        <div className="flex items-center gap-1">
          {STATE_BUTTONS.map((btn) => {
            const Icon = btn.icon;
            const active = draft.state === btn.value;
            return (
              <button
                key={btn.value}
                type="button"
                title={btn.hint}
                disabled={disabled}
                onClick={() => setState(btn.value)}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border transition-colors disabled:opacity-50 ${
                  active
                    ? btn.activeClass
                    : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                }`}
              >
                <Icon size={13} />
                {btn.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scope — project-scoped permissions only, and only once set */}
      {needsScope && (
        <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-600">نطاق التطبيق:</span>
            {(["all_projects", "team_projects_only"] as GrantScope[]).map(
              (scope) => {
                const active = draft.scope === scope;
                return (
                  <button
                    key={scope}
                    type="button"
                    disabled={disabled}
                    onClick={() => setScope(scope)}
                    title={SCOPE_HELP[scope]}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors disabled:opacity-50 ${
                      active
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {SCOPE_LABELS[scope]}
                    {scope === SUGGESTED_SCOPE && !active && (
                      <span className="text-[10px] text-gray-400 mr-1">
                        (مقترح)
                      </span>
                    )}
                  </button>
                );
              },
            )}
          </div>

          {scopeMissing && (
            <p className="mt-2 text-[11px] text-amber-700">
              يجب اختيار نطاق التطبيق قبل الحفظ. لا يوجد اختيار افتراضي —
              الاختيار المقترح هو «{SCOPE_LABELS[SUGGESTED_SCOPE]}» لكنه يحتاج
              تأكيداً صريحاً.
            </p>
          )}
          {draft.scope && (
            <p className="mt-2 text-[11px] text-gray-500">
              {SCOPE_HELP[draft.scope]}
            </p>
          )}
        </div>
      )}

      {/* Reason — screen 3 */}
      {showNote && draft.state !== "unset" && (
        <div className="mt-3">
          <input
            type="text"
            dir="rtl"
            disabled={disabled}
            value={draft.note}
            onChange={(e) => onChange({ ...draft, note: e.target.value })}
            placeholder="سبب الاستثناء (اختياري) — مثال: رئيس قسم الكهرباء، بموافقة المدير العام"
            className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}

      {errorMessage && (
        <p className="mt-2 text-[11px] text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}
