import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Pencil, Trash } from "lucide-react";
import LoadingPage from "../../../../components/ui/LoadingPage";
import ErrorPage from "../../../../components/ui/errorPage";
import Button from "../../../../components/ui/Button";
import ConfirmDialog from "../../../../components/ui/ConfirmDialog";
import SortableList from "../../../../components/operations/boq/SortableList";
import TypeFormDialog from "../../../../components/operations/boq/TypeFormDialog";
import CreateTypeFromTemplateDialog from "../../../../components/operations/boq/CreateTypeFromTemplateDialog";
import {
  BOQType,
  useDeleteType,
  useTypes,
  useUpdateType,
} from "../../../../hooks/operations/boq/useTypes";
import { useReorder } from "../../../../hooks/operations/boq/useReorder";
import { TypeFormValues } from "../../../../types/schema/boq/type.schema";

const BOQTypesPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { types, setTypes, loading, error, refetch } = useTypes(
    projectId ?? "",
  );
  const { updateType, loading: updating } = useUpdateType();
  const { deleteType, loading: deleting } = useDeleteType();
  const { reorder } = useReorder("types");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingType, setEditingType] = useState<BOQType | null>(null);
  const [typeToDelete, setTypeToDelete] = useState<BOQType | null>(null);

  if (!projectId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-gray-600">No project Id found</p>
      </div>
    );
  }

  if (loading && types.length === 0) {
    return <LoadingPage label="جاري تحميل جداول الكميات..." />;
  }
  if (error) {
    return (
      <ErrorPage
        label="حدث خطأ أثناء تحميل جداول الكميات"
        error={error.message}
      />
    );
  }

  const handleEditSubmit = async (values: TypeFormValues) => {
    if (!editingType) return;
    await updateType(editingType.id, values);
    setEditingType(null);
    refetch();
  };

  const handleConfirmDelete = async () => {
    if (!typeToDelete) return;
    await deleteType(typeToDelete.id);
    setTypeToDelete(null);
    refetch();
  };

  const handleCreated = (newTypeId: string) => {
    setIsCreateOpen(false);
    navigate(`/operations/boq/project/${projectId}/types/${newTypeId}`);
  };

  const handleReorder = (reordered: BOQType[]) => {
    reorder(
      reordered,
      (t) => ({
        id: t.id,
        project_id: t.project_id,
        name: t.name,
        version: t.version,
        sort_order: t.sort_order,
        template_type_id: t.template_type_id,
      }),
      setTypes,
      refetch,
    );
  };

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">جداول الكميات</h1>
        <div className="flex items-center gap-2">
          <Link to={`/operations/boq/project/${projectId}/zones`}>
            <Button variant="secondary">إدارة المناطق</Button>
          </Link>
          <Button onClick={() => setIsCreateOpen(true)}>+ نوع جديد</Button>
        </div>
      </div>

      <SortableList
        items={types}
        onReorder={handleReorder}
        emptyMessage="لا توجد أنواع بعد"
        renderItem={(type) => (
          <div
            onClick={() => navigate(`/operations/boq/project/${projectId}/types/${type.id}`)}
            className="flex items-center justify-between gap-3 px-4 py-3 border rounded-lg bg-white hover:bg-blue-50/40 hover:border-blue-200 transition-all cursor-pointer group"
          >
            <div className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors truncate">
              {type.name}
            </div>
            <div
              className="flex items-center gap-3 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-xs text-gray-400 whitespace-nowrap">
                v{type.version}
              </span>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {new Date(type.created_at).toLocaleDateString("ar-LY")}
              </span>
              <button
                type="button"
                className="p-1.5 text-gray-400 hover:text-primary transition-colors"
                aria-label="تعديل النوع"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingType(type);
                }}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                className="p-1.5 text-gray-400 hover:text-error transition-colors"
                aria-label="حذف النوع"
                onClick={(e) => {
                  e.stopPropagation();
                  setTypeToDelete(type);
                }}
              >
                <Trash className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      />

      {isCreateOpen && (
        <CreateTypeFromTemplateDialog
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          projectId={projectId}
          existingTypes={types}
          onCreated={handleCreated}
        />
      )}

      <TypeFormDialog
        isOpen={editingType !== null}
        onClose={() => setEditingType(null)}
        onSubmit={handleEditSubmit}
        loading={updating}
        defaultValues={
          editingType
            ? { name: editingType.name, version: editingType.version }
            : undefined
        }
      />

      <ConfirmDialog
        open={typeToDelete !== null}
        onCancel={() => setTypeToDelete(null)}
        onConfirm={handleConfirmDelete}
        loading={deleting}
        message="سيتم حذف هذا النوع وكل الأعمال والبنود المرتبطة به بشكل نهائي. هل أنت متأكد؟"
        confirmVariant="error"
      />
    </div>
  );
};

export default BOQTypesPage;
