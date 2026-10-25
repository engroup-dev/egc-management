import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Dialog from "../../ui/Dialog";
import Button from "../../ui/Button";
import { useProjectTeam } from "../../../hooks/team/useTeamAssignments";
import {
  useFolderAccess,
  useSetFolderAccess,
  type AccessEntry,
  type DrawingFolderRow,
} from "../../../hooks/operations/drawings/useProjectDrawings";

interface Props {
  projectId: string;
  folder: DrawingFolderRow;
  isOpen: boolean;
  onClose: () => void;
}

type Cap = "view" | "download" | "upload" | "edit";
type Row = Record<Cap, boolean>;

const CAPS: { key: Cap; label: string }[] = [
  { key: "view", label: "عرض" },
  { key: "download", label: "تنزيل" },
  { key: "upload", label: "رفع" },
  { key: "edit", label: "تعديل" },
];

const EMPTY: Row = { view: false, download: false, upload: false, edit: false };

// Who on the project team may do what in one folder. Managers
// (manage_project_maps) aren't listed: they always have full access.
// Ticking anything also ticks "view"; unticking "view" clears the row,
// because without view nothing else is reachable.
const FolderAccessDialog = ({ projectId, folder, isOpen, onClose }: Props) => {
  const team = useProjectTeam(isOpen ? projectId : undefined);
  const access = useFolderAccess(projectId, folder.id, isOpen);
  const save = useSetFolderAccess(projectId);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [error, setError] = useState<string | null>(null);

  // One row per employee: a person can hold several project roles.
  const members = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; roles: string[] }>();
    for (const m of team.data ?? []) {
      if (m.personType !== "employee") continue;
      const existing = seen.get(m.personId);
      if (existing) existing.roles.push(m.projectRoleName);
      else seen.set(m.personId, { id: m.personId, name: m.fullName, roles: [m.projectRoleName] });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [team.data]);

  useEffect(() => {
    if (!isOpen || !access.data) return;
    const next: Record<string, Row> = {};
    for (const a of access.data) {
      next[a.user_id] = { view: true, download: a.can_download, upload: a.can_upload, edit: a.can_edit };
    }
    setRows(next);
    setError(null);
  }, [isOpen, access.data]);

  const toggle = (userId: string, cap: Cap, checked: boolean) =>
    setRows((prev) => {
      const row = { ...(prev[userId] ?? EMPTY), [cap]: checked };
      if (cap === "view" && !checked) return { ...prev, [userId]: { ...EMPTY } };
      if (checked) row.view = true;
      return { ...prev, [userId]: row };
    });

  const submit = async () => {
    setError(null);
    const memberIds = new Set(members.map((m) => m.id));
    const entries: AccessEntry[] = Object.entries(rows)
      .filter(([userId, r]) => r.view && memberIds.has(userId))
      .map(([userId, r]) => ({ user_id: userId, download: r.download, upload: r.upload, edit: r.edit }));
    try {
      await save.mutateAsync({ folderId: folder.id, entries });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ صلاحيات الوصول");
    }
  };

  const loading = team.isLoading || access.isLoading;
  const loadError = team.error ?? access.error;

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-bold">صلاحيات الوصول – {folder.name}</h2>
          <p className="text-sm text-gray-500">
            حدد ما يمكن لكل عضو في فريق المشروع فعله في هذا النوع من الخرائط.
            مديرو مخططات المشروع لديهم صلاحية كاملة دائماً.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">جاري التحميل...</p>
        ) : loadError ? (
          <p className="text-sm text-red-600">{(loadError as Error).message}</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-gray-600">
            لا يوجد أعضاء في فريق هذا المشروع بعد. أضف الأعضاء من{" "}
            <Link to={`/execution-management/projects/${projectId}`} className="text-primary hover:underline">
              إدارة التنفيذ › فريق المشروع
            </Link>
            .
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500">
                  <th className="py-2 text-right font-medium">العضو</th>
                  {CAPS.map((c) => (
                    <th key={c.key} className="w-16 py-2 text-center font-medium">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {members.map((m) => {
                  const row = rows[m.id] ?? EMPTY;
                  return (
                    <tr key={m.id}>
                      <td className="py-2">
                        <span className="block font-medium text-gray-900">{m.name}</span>
                        <span className="block text-xs text-gray-400">{m.roles.join("، ")}</span>
                      </td>
                      {CAPS.map((c) => (
                        <td key={c.key} className="text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary"
                            aria-label={`${m.name} ${c.label}`}
                            checked={row[c.key]}
                            onChange={(e) => toggle(m.id, c.key, e.target.checked)}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="button" onClick={submit} loading={save.isPending} disabled={loading || members.length === 0}>
            حفظ الصلاحيات
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

export default FolderAccessDialog;
