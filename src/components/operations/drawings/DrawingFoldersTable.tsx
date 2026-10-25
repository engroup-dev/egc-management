import { Folder, Trash2, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDate } from "../../../utils/helpper";
import {
  capsFor,
  type DrawingCaps,
  type DrawingFolderRow,
} from "../../../hooks/operations/drawings/useProjectDrawings";
import type { DrawingNotice } from "../../../types/global.type";
import DrawingStatusChip from "./DrawingStatusChip";
import DownloadDrawingButton from "./DownloadDrawingButton";
import { complianceText } from "./drawingLabels";

interface Props {
  folders: DrawingFolderRow[];
  caps: DrawingCaps | undefined;
  pendingNotices: DrawingNotice[];
  nameOf: (folderId: string) => string;
  folderPath: (folderId: string) => string;
  onAccess: (folder: DrawingFolderRow) => void;
  onDelete: (folder: DrawingFolderRow) => void;
}

const DrawingFoldersTable = ({ folders, caps, pendingNotices, nameOf, folderPath, onAccess, onDelete }: Props) => {
  const isManager = !!caps?.is_manager;

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr>
            <th className="px-4 py-3 text-right font-semibold">نوع الخريطة</th>
            <th className="px-4 py-3 text-right font-semibold">تاريخ الرفع</th>
            <th className="px-4 py-3 text-right font-semibold">الإصدار</th>
            <th className="px-4 py-3 text-right font-semibold">التوافق مع باقي الإصدارات</th>
            <th className="px-4 py-3 text-center font-semibold">تنزيل</th>
            {isManager && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {folders.map((f) => {
            const c = capsFor(caps, f.id);
            const pending = pendingNotices.filter((n) => n.to_folder_id === f.id);
            return (
              <tr key={f.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={folderPath(f.id)}
                      className="inline-flex items-center gap-2 font-semibold text-gray-900 hover:text-primary"
                    >
                      <Folder size={18} className="fill-primary text-primary" />
                      {f.name}
                    </Link>
                    <DrawingStatusChip status={f.status} />
                  </div>
                </td>
                <td className={`px-4 py-3 ${f.latest ? "" : "text-gray-400"}`}>
                  {f.latest ? formatDate(f.latest.created_at) : "لا توجد ملفات"}
                </td>
                <td className="px-4 py-3 font-semibold" dir="ltr">
                  <span className="block text-right">{f.latest ? `v${f.latest.version}` : "–"}</span>
                </td>
                <td className="px-4 py-3">
                  {pending.length ? (
                    <span className="font-semibold text-amber-700">{complianceText(pending, nameOf)}</span>
                  ) : (
                    <span className="font-semibold text-green-700">✓ متوافق</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <DownloadDrawingButton
                    versionId={f.latest?.id ?? null}
                    fileName={f.latest?.file_name ?? f.name}
                    status={f.status}
                    statusNote={f.status_note}
                    allowed={c.download}
                    label={`تنزيل آخر إصدار من ${f.name}`}
                  />
                </td>
                {isManager && (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onAccess(f)}
                        title="صلاحيات الوصول"
                        aria-label={`صلاحيات الوصول إلى ${f.name}`}
                        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-primary"
                      >
                        <Users size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(f)}
                        title="حذف"
                        aria-label={`حذف ${f.name}`}
                        className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
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

export default DrawingFoldersTable;
