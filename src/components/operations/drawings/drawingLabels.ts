import type { DrawingNotice } from "../../../types/global.type";
import type { DrawingStatus } from "../../../hooks/operations/drawings/useProjectDrawings";

export const STATUS_LABELS: Record<DrawingStatus, string> = {
  ok: "محدّثة",
  design: "قيد التصميم",
  modification: "قيد التعديل",
};

export const STATUS_HINTS: Record<DrawingStatus, string> = {
  ok: "آمنة للتنزيل والبناء عليها.",
  design: "يجري العمل على تصميم جديد.",
  modification: "يجري تعديل الخرائط الحالية.",
};

export const MAX_FILE_MB = 100;

/** "معمارية v3" for one pending notice, "3 تحديثات" for several. */
export function complianceText(
  pending: DrawingNotice[],
  nameOf: (folderId: string) => string,
): string {
  if (pending.length === 1) {
    const n = pending[0];
    return `يجب الالتزام: ${nameOf(n.from_folder_id)} v${n.version_number}`;
  }
  return `يجب الالتزام: ${pending.length} تحديثات`;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
