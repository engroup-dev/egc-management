import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Upload, Users } from "lucide-react";
import Button from "../../../../components/ui/Button";
import ConfirmDialog from "../../../../components/ui/ConfirmDialog";
import LoadingPage from "../../../../components/ui/LoadingPage";
import ErrorPage from "../../../../components/ui/errorPage";
import DrawingStatusChip from "../../../../components/operations/drawings/DrawingStatusChip";
import DrawingStatusBanner from "../../../../components/operations/drawings/DrawingStatusBanner";
import ComplianceNotices from "../../../../components/operations/drawings/ComplianceNotices";
import DrawingVersionsTable from "../../../../components/operations/drawings/DrawingVersionsTable";
import SetStatusDialog from "../../../../components/operations/drawings/SetStatusDialog";
import UploadVersionDialog from "../../../../components/operations/drawings/UploadVersionDialog";
import FolderAccessDialog from "../../../../components/operations/drawings/FolderAccessDialog";
import {
  capsFor,
  useDeleteDrawingVersion,
  useDrawingFolders,
  useDrawingNotices,
  useDrawingVersions,
  useMyDrawingCaps,
  type DrawingVersionRow,
} from "../../../../hooks/operations/drawings/useProjectDrawings";

// One folder (map type) of a project: its versions newest first, its
// status, and the updates from other folders it still has to comply with.
// What the buttons offer comes from drawings.my_caps; the database
// enforces the same rules again on every write.
const ProjectDrawingFolderPage = () => {
  const { projectId, folderId } = useParams<{ projectId: string; folderId: string }>();
  const caps = useMyDrawingCaps(projectId);
  const folders = useDrawingFolders(projectId);
  const notices = useDrawingNotices(projectId);
  const versions = useDrawingVersions(projectId, folderId);
  const deleteVersion = useDeleteDrawingVersion(projectId);

  const [uploading, setUploading] = useState(false);
  const [settingStatus, setSettingStatus] = useState(false);
  const [editingAccess, setEditingAccess] = useState(false);
  const [deleting, setDeleting] = useState<DrawingVersionRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!projectId || !folderId) {
    return <ErrorPage error="الرابط غير مكتمل" label="خطأ في المعلومات" />;
  }
  if (caps.isLoading || folders.isLoading) return <LoadingPage label="تحميل الخرائط..." />;

  const loadError = caps.error ?? folders.error ?? notices.error ?? versions.error;
  if (loadError) {
    return (
      <ErrorPage
        error={loadError instanceof Error ? loadError.message : "خطأ غير معروف"}
        label="خطأ في تحميل الخرائط"
      />
    );
  }

  const allFolders = folders.data ?? [];
  const folder = allFolders.find((f) => f.id === folderId);
  const c = capsFor(caps.data, folderId);
  const isManager = !!caps.data?.is_manager;
  const projectPath = `/operations/maps/project/${projectId}`;

  if (!folder || !c.view) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center" dir="rtl">
        <p className="text-sm text-gray-500">نوع الخريطة غير موجود أو ليست لديك صلاحية عرضه.</p>
        <Link to={projectPath} className="mt-2 inline-block text-sm text-primary hover:underline">
          العودة إلى خرائط المشروع
        </Link>
      </div>
    );
  }

  const nameOf = (id: string) => allFolders.find((f) => f.id === id)?.name ?? "—";
  const all = notices.data ?? [];
  const incoming = all.filter((n) => n.to_folder_id === folderId && n.state === "pending");
  const sent = all.filter((n) => n.from_folder_id === folderId);

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteVersion.mutateAsync(deleting.id);
      setDeleting(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "تعذر حذف الإصدار");
    }
  };

  return (
    <div className="space-y-4 p-4">
      <Link to={projectPath} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary">
        <ArrowRight size={14} />
        خرائط المشروع
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">{folder.name}</h1>
          <DrawingStatusChip status={folder.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          {c.upload && (
            <Button variant="ghost" onClick={() => setSettingStatus(true)}>
              تعيين الحالة
            </Button>
          )}
          {isManager && (
            <Button variant="ghost" onClick={() => setEditingAccess(true)}>
              <Users size={16} />
              صلاحيات الوصول
            </Button>
          )}
          {c.upload && (
            <Button onClick={() => setUploading(true)}>
              <Upload size={16} />
              رفع إصدار جديد
            </Button>
          )}
        </div>
      </div>

      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
          {message}
        </div>
      )}

      <DrawingStatusBanner folder={folder} />

      <ComplianceNotices projectId={projectId} notices={incoming} nameOf={nameOf} canEdit={c.edit} />

      {versions.isLoading ? (
        <p className="text-sm text-gray-500">جاري تحميل الإصدارات...</p>
      ) : (
        <DrawingVersionsTable
          versions={versions.data ?? []}
          sentNotices={sent}
          nameOf={nameOf}
          status={folder.status}
          statusNote={folder.status_note}
          canDownload={c.download}
          canEdit={c.edit}
          onDelete={setDeleting}
        />
      )}

      {c.upload && (
        <>
          <UploadVersionDialog
            projectId={projectId}
            folder={folder}
            otherFolders={allFolders.filter((f) => f.id !== folder.id)}
            isOpen={uploading}
            onClose={() => setUploading(false)}
            onUploaded={(version, notified) =>
              setMessage(
                notified
                  ? `تم رفع الإصدار v${version}، وتم إشعار ${notified} من أنواع الخرائط.`
                  : `تم رفع الإصدار v${version}.`,
              )
            }
          />
          <SetStatusDialog
            projectId={projectId}
            folder={folder}
            isOpen={settingStatus}
            onClose={() => setSettingStatus(false)}
          />
        </>
      )}

      {isManager && (
        <FolderAccessDialog
          projectId={projectId}
          folder={folder}
          isOpen={editingAccess}
          onClose={() => setEditingAccess(false)}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={deleteVersion.isPending}
        title={`حذف الإصدار v${deleting?.version ?? ""}؟`}
        message={`سيؤدي هذا إلى حذف الإصدار ${deleting?.version ?? ""} من ${folder.name} وملفه وإشعاراته. لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="حذف الإصدار"
        confirmVariant="error"
      />
    </div>
  );
};

export default ProjectDrawingFolderPage;
