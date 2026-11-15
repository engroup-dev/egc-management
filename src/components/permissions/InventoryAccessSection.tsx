import { Boxes, RefreshCw } from "lucide-react";
import {
  INVENTORY_LEVELS,
  INVENTORY_LEVEL_LABELS,
  type InventoryLevel,
  type InventoryPermIds,
} from "./inventoryAccess";
import {
  useProjectInventoryAccess,
  useSetProjectInventoryAccess,
} from "../../hooks/permissions/useProjectInventoryAccess";

interface Props {
  userId: string;
  projectId: string;
  ids: InventoryPermIds;
  /** The person has a per-project inventory setting here (not "follows the role"). */
  customized: boolean;
  grantedBy: string | null;
  onToast: (message: string) => void;
}

// Inventory access for one engineer on one project, as one three-level
// control. Kept out of PROJECT_RIGHTS_CATALOG on purpose: the tab
// auto-saves a row for every catalog right it finds missing, and a
// per-project row beats the role grant, so merely opening a project
// would freeze or revoke the access the role gives. Here nothing is
// written until an admin picks a level.
export default function InventoryAccessSection({
  userId,
  projectId,
  ids,
  customized,
  grantedBy,
  onToast,
}: Props) {
  const { level, isLoading, isError, refetch } = useProjectInventoryAccess(userId, projectId);
  const setAccess = useSetProjectInventoryAccess();
  const busy = isLoading || setAccess.isPending;

  const apply = async (next: InventoryLevel | "role") => {
    if (busy) return;
    try {
      await setAccess.mutateAsync({ userId, projectId, ids, level: next, grantedBy });
      onToast(
        `المخزون والمواد: ${next === "role" ? "حسب الدور" : INVENTORY_LEVEL_LABELS[next]}`,
      );
    } catch (err) {
      console.error("Error updating inventory access:", err);
      onToast("فشل تحديث صلاحية المخزون");
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Boxes size={16} className="text-blue-600" />
          <span className="font-bold text-xs text-slate-900">المخزون والمواد</span>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border ${
              customized
                ? "bg-amber-50 text-amber-800 border-amber-200"
                : "bg-slate-100 text-slate-600 border-slate-200"
            }`}
          >
            {customized ? "مخصص" : "حسب الدور"}
          </span>
        </div>

        {customized && (
          <button
            type="button"
            disabled={busy}
            onClick={() => apply("role")}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            رجوع للدور
          </button>
        )}
      </div>

      <div className="px-4 py-3 flex items-center justify-between gap-4">
        <div className="text-xs text-slate-500 text-right">
          عرض المخزون، والاستلام والصرف للمقاولين في هذا المشروع
        </div>

        {isError ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-red-600">تعذّر تحميل صلاحية المخزون</span>
            <button
              type="button"
              onClick={refetch}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              <RefreshCw size={12} />
              إعادة المحاولة
            </button>
          </div>
        ) : (
          <div
            role="radiogroup"
            aria-label="صلاحية المخزون"
            className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5"
          >
            {INVENTORY_LEVELS.map((option) => {
              const selected = level === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={busy}
                  onClick={() => !selected && apply(option)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors disabled:cursor-not-allowed ${
                    selected
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-white disabled:opacity-50"
                  }`}
                >
                  {INVENTORY_LEVEL_LABELS[option]}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
