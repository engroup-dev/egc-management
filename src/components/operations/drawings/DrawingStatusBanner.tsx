import { AlertTriangle } from "lucide-react";
import { formatDate } from "../../../utils/helpper";
import type { DrawingFolderRow, DrawingStatus } from "../../../hooks/operations/drawings/useProjectDrawings";
import { STATUS_LABELS } from "./drawingLabels";

/** Warns everyone not to build on the current files while a new version is on its way. */
const DrawingStatusBanner = ({ folder }: { folder: DrawingFolderRow }) => {
  if (folder.status === "ok") return null;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle size={16} />
        {STATUS_LABELS[folder.status as DrawingStatus]} – لم يُرفع إصدار جديد بعد
      </p>
      <p className="mt-1">
        {folder.statusByName ?? "أحد أعضاء الفريق"} عيّن هذه الحالة بتاريخ{" "}
        {formatDate(folder.status_at)}.
        {folder.status_note ? ` ${folder.status_note}` : ""} لا تقم بتنزيل الخرائط
        الحالية أو البناء عليها حتى يُرفع إصدار جديد.
      </p>
    </div>
  );
};

export default DrawingStatusBanner;
