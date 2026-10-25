import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import Button from "../../../../components/ui/Button";
import ConfirmDialog from "../../../../components/ui/ConfirmDialog";
import LoadingPage from "../../../../components/ui/LoadingPage";
import ErrorPage from "../../../../components/ui/errorPage";
import DrawingFoldersTable from "../../../../components/operations/drawings/DrawingFoldersTable";
import AddFolderDialog from "../../../../components/operations/drawings/AddFolderDialog";
import FolderAccessDialog from "../../../../components/operations/drawings/FolderAccessDialog";
import { useProject } from "../../../../hooks/useProjects";
import {
  capsFor,
  useDeleteDrawingFolder,
  useDrawingFolders,
  useDrawingNotices,
  useMyDrawingCaps,
  type DrawingFolderRow,
} from "../../../../hooks/operations/drawings/useProjectDrawings";

// =====================================================================
// Project drawings — one row per map type (folder) of the project.
// =====================================================================
// Managers (manage_project_maps) see every folder and can add,
// delete and assign access. Everyone else sees the folders they were
// given access to. Clicking a folder opens ProjectDrawingFolderPage.
// See hooks/operations/drawings/useProjectDrawings.ts for the data model.
// =====================================================================

const OperationsMapsProjectPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { project } = useProject(projectId ?? "");
  const caps = useMyDrawingCaps(projectId);
  const folders = useDrawingFolders(projectId);
  const notices = useDrawingNotices(projectId);
  const deleteFolder = useDeleteDrawingFolder(projectId);

  const [adding, setAdding] = useState(false);
  const [accessFor, setAccessFor] = useState<DrawingFolderRow | null>(null);
  const [deleting, setDeleting] = useState<DrawingFolderRow | null>(null);

  const isManager = !!caps.data?.is_manager;
  const allFolders = useMemo(() => folders.data ?? [], [folders.data]);
  const visible = allFolders.filter((f) => isManager || capsFor(caps.data, f.id).view);
  const pending = (notices.data ?? []).filter((n) => n.state === "pending");
  const nameOf = (id: string) => allFolders.find((f) => f.id === id)?.name ?? "—";

  if (!projectId) {
    return <ErrorPage error="رقم المشروع غير موجود في الرابط" label="خطأ في المعلومات" />;
  }
  if (caps.isLoading || folders.isLoading) return <LoadingPage label="تحميل الخرائط..." />;

  const loadError = caps.error ?? folders.error ?? notices.error;
  if (loadError) {
    return (
      <ErrorPage
        error={loadError instanceof Error ? loadError.message : "خطأ غير معروف"}
        label="خطأ في تحميل الخرائط"
      />
    );
  }

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteFolder.mutateAsync(deleting.id);
      setDeleting(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "تعذر حذف نوع الخريطة");
    }
  };

  return (
    <div className="space-y-5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{project?.name ?? "خرائط المشروع"}</h1>
            {project && project.serial_number !== null && (
              <span className="text-sm text-gray-400" dir="ltr">
                #{project.serial_number}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            خرائط المشروع حسب النوع: آخر إصدار لكل نوع، وما يجب أن يلتزم به من تحديثات الأنواع الأخرى.
          </p>
        </div>
        {isManager && (
          <Button onClick={() => setAdding(true)}>
            <Plus size={16} />
            إضافة نوع خريطة
          </Button>
        )}
      </div>

      {visible.length ? (
        <DrawingFoldersTable
          folders={visible}
          caps={caps.data}
          pendingNotices={pending}
          nameOf={nameOf}
          folderPath={(id) => `/operations/maps/project/${projectId}/folder/${id}`}
          onAccess={setAccessFor}
          onDelete={setDeleting}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-gray-700">
            {isManager ? "لا توجد أنواع خرائط في هذا المشروع بعد." : "لم يُسند إليك أي نوع خرائط في هذا المشروع."}
          </p>
          {isManager && (
            <p className="mt-1 text-xs text-gray-500">اضغط «إضافة نوع خريطة» لإنشاء أول مجلد.</p>
          )}
        </div>
      )}

      {isManager && (
        <AddFolderDialog
          projectId={projectId}
          usedMapTypeIds={allFolders.map((f) => f.map_type_id)}
          isOpen={adding}
          onClose={() => setAdding(false)}
        />
      )}

      {accessFor && (
        <FolderAccessDialog
          projectId={projectId}
          folder={accessFor}
          isOpen={!!accessFor}
          onClose={() => setAccessFor(null)}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={deleteFolder.isPending}
        title={`حذف ${deleting?.name ?? ""}؟`}
        message="سيؤدي هذا إلى حذف نوع الخريطة من المشروع مع جميع إصداراته وملفاته وإشعاراته وصلاحيات الوصول إليه. لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
        confirmVariant="error"
      />
    </div>
  );
};

export default OperationsMapsProjectPage;
