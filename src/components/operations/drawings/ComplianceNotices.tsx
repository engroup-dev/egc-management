import { useState } from "react";
import Button from "../../ui/Button";
import { formatDate } from "../../../utils/helpper";
import { useMarkNoticeComplied } from "../../../hooks/operations/drawings/useProjectDrawings";
import type { DrawingNotice } from "../../../types/global.type";

interface Props {
  projectId: string;
  /** Pending notices addressed to this folder. */
  notices: DrawingNotice[];
  nameOf: (folderId: string) => string;
  canEdit: boolean;
}

/** "Updates this folder must comply with", each with a "mark as complied" action. */
const ComplianceNotices = ({ projectId, notices, nameOf, canEdit }: Props) => {
  const mark = useMarkNoticeComplied(projectId);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!notices.length) return null;

  const complied = async (id: string) => {
    setBusyId(id);
    try {
      await mark.mutateAsync(id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "تعذر تأكيد الالتزام");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-xl border border-amber-300 bg-white px-4 py-3">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">تحديثات يجب أن يلتزم بها هذا النوع</h3>
      <ul className="divide-y divide-gray-100">
        {notices.map((n) => (
          <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
            <span>
              <b>
                {nameOf(n.from_folder_id)} <span dir="ltr">v{n.version_number}</span>
              </b>{" "}
              <span className="text-gray-500">· رُفع بتاريخ {formatDate(n.created_at)}</span>
            </span>
            {canEdit && (
              <Button size="sm" variant="primary-outline" loading={busyId === n.id} onClick={() => complied(n.id)}>
                تم الالتزام
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ComplianceNotices;
