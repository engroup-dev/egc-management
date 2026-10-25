import { Trash2 } from "lucide-react";
import { formatDate } from "../../../utils/helpper";
import type { DrawingVersionRow } from "../../../hooks/operations/drawings/useProjectDrawings";
import type { DrawingNotice } from "../../../types/global.type";
import DownloadDrawingButton from "./DownloadDrawingButton";
import { formatFileSize } from "./drawingLabels";

interface Props {
  versions: DrawingVersionRow[];
  /** Notices sent by this folder's versions, for the "notified" line. */
  sentNotices: DrawingNotice[];
  nameOf: (folderId: string) => string;
  status: string;
  statusNote: string | null;
  canDownload: boolean;
  canEdit: boolean;
  onDelete: (version: DrawingVersionRow) => void;
}

const DrawingVersionsTable = ({
  versions,
  sentNotices,
  nameOf,
  status,
  statusNote,
  canDownload,
  canEdit,
  onDelete,
}: Props) => {
  if (!versions.length) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        لم يُرفع أي ملف بعد.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr>
            <th className="px-4 py-3 text-right font-semibold">الملف</th>
            <th className="px-4 py-3 text-right font-semibold">تاريخ الرفع</th>
            <th className="px-4 py-3 text-right font-semibold">الإصدار</th>
            <th className="px-4 py-3 text-center font-semibold">تنزيل</th>
            {canEdit && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {versions.map((v, i) => {
            const notified = sentNotices.filter((n) => n.version_id === v.id).map((n) => nameOf(n.to_folder_id));
            return (
              <tr key={v.id}>
                <td className="px-4 py-3">
                  <span className="block text-right font-medium text-gray-900" dir="ltr">
                    {v.file_name}
                  </span>
                  {v.original_file_name && v.original_file_name !== v.file_name && (
                    <span className="block text-xs text-gray-400">الاسم الأصلي: {v.original_file_name}</span>
                  )}
                  <span className="block text-xs text-gray-400">
                    <span dir="ltr">{formatFileSize(v.file_size)}</span>
                    {v.uploaderName ? ` · ${v.uploaderName}` : ""}
                  </span>
                  {notified.length > 0 && (
                    <span className="block text-xs text-gray-500">تم إشعار: {notified.join("، ")}</span>
                  )}
                </td>
                <td className="px-4 py-3">{formatDate(v.created_at)}</td>
                <td className="px-4 py-3">
                  <span className="font-semibold" dir="ltr">
                    v{v.version}
                  </span>
                  {i === 0 && (
                    <span className="ms-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-white">
                      الأحدث
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <DownloadDrawingButton
                    versionId={v.id}
                    fileName={v.file_name}
                    status={status}
                    statusNote={statusNote}
                    allowed={canDownload}
                    label={`تنزيل الإصدار ${v.version}`}
                  />
                </td>
                {canEdit && (
                  <td className="px-4 py-3 text-left">
                    <button
                      type="button"
                      onClick={() => onDelete(v)}
                      title="حذف الإصدار"
                      aria-label={`حذف الإصدار ${v.version}`}
                      className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default DrawingVersionsTable;
