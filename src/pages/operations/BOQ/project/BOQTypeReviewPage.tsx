import React, { useState } from "react";
import { Plus } from "lucide-react";
import { useParams } from "react-router-dom";
import LoadingPage from "../../../../components/ui/LoadingPage";
import ErrorPage from "../../../../components/ui/errorPage";
import ConfirmDialog from "../../../../components/ui/ConfirmDialog";
import Button from "../../../../components/ui/Button";
import BOQPDFDialogButton from "../../../../components/operations/boq/BOQPDFDialogButton";
import { useProject } from "../../../../hooks/useProjects";

import {
  ItemRow,
  TemplateWorkFull,
  WorkFull,
} from "../../../../hooks/operations/boq/types";
import {
  useCreateWork,
  useCreateWorkFromTemplate,
  useDeleteWork,
  useTypeWorks,
  useUpdateWork,
} from "../../../../hooks/operations/boq/useWorks";
import {
  useBulkCreateItems,
  useBulkUpdateQuantities,
  useCreateItem,
  useDeleteItem,
  useUpdateItem,
} from "../../../../hooks/operations/boq/useItems";
import { useZones, Zone } from "../../../../hooks/operations/boq/useZones";
import { useTypes } from "../../../../hooks/operations/boq/useTypes";
import { useReorder } from "../../../../hooks/operations/boq/useReorder";
import { computeNextSortOrder } from "../../../../hooks/operations/boq/sortOrder";

import BOQTree, {
  ItemEditUpdate,
} from "../../../../components/operations/boq/BOQTree";
import WorkFormDialog from "../../../../components/operations/boq/WorkFormDialog";
import ItemFormDialog, {
  TemplateItemSelection,
} from "../../../../components/operations/boq/ItemFormDialog";
import { WorkFormValues } from "../../../../types/schema/boq/work.schema";
import { ItemFormValues } from "../../../../types/schema/boq/item.schema";

type WorkDialogState =
  | { mode: "create"; zone: Zone | null }
  | { mode: "edit"; work: WorkFull }
  | null;

type ItemDialogState =
  | { mode: "create"; work: WorkFull }
  | { mode: "edit"; work: WorkFull; item: ItemRow }
  | null;

type DeleteState =
  | { kind: "work"; work: WorkFull }
  | { kind: "item"; work: WorkFull; item: ItemRow }
  | null;

const BOQTypeReviewPage = () => {
  const { projectId, typeId } = useParams<{
    projectId: string;
    typeId: string;
  }>();

  const { works, setWorks, loading, error, refetch } = useTypeWorks(
    typeId ?? "",
  );
  const { types } = useTypes(projectId ?? "");
  const { zones } = useZones(projectId ?? "");
  const { project } = useProject(projectId ?? "");

  const { createWork, loading: savingWork } = useCreateWork();
  const { createWorkFromTemplate, loading: savingWorkFromTemplate } =
    useCreateWorkFromTemplate();
  const { updateWork } = useUpdateWork();
  const { deleteWork, loading: deletingWork } = useDeleteWork();
  const { reorder: reorderWorks } = useReorder("works");

  const { createItem, loading: savingItem } = useCreateItem();
  const { bulkCreateItems, loading: savingItemsFromTemplate } =
    useBulkCreateItems();
  const { updateItem } = useUpdateItem();
  const { deleteItem, loading: deletingItem } = useDeleteItem();
  const { reorder: reorderItems } = useReorder("items");
  const { bulkUpdateQuantities, loading: savingQuantities } =
    useBulkUpdateQuantities();

  const [workDialog, setWorkDialog] = useState<WorkDialogState>(null);
  const [itemDialog, setItemDialog] = useState<ItemDialogState>(null);
  const [deleteState, setDeleteState] = useState<DeleteState>(null);

  if (!projectId || !typeId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-gray-600">لا يوجد مشروع أو نوع محدد</p>
      </div>
    );
  }

  if (loading && works.length === 0) {
    return <LoadingPage label="جاري تحميل جدول الكميات..." />;
  }
  if (error) {
    return (
      <ErrorPage
        label="حدث خطأ أثناء تحميل جدول الكميات"
        error={error.message}
      />
    );
  }

  const currentType = types.find((t) => t.id === typeId);
  const typeName = currentType?.name ?? "";

  const zonesInUse = zones.filter((zone) =>
    works.some((w) => w.zone_id === zone.id),
  );

  const handleWorkSubmit = async (values: WorkFormValues, zoneId: string) => {
    if (!workDialog) return;
    if (workDialog.mode === "create") {
      const siblings = works.filter((w) => w.zone_id === zoneId);
      await createWork(typeId, zoneId, values, siblings);
    } else {
      await updateWork(workDialog.work.id, values);
    }
    setWorkDialog(null);
    refetch();
  };

  const handleItemSubmit = async (values: ItemFormValues) => {
    if (!itemDialog) return;
    if (itemDialog.mode === "create") {
      await createItem(itemDialog.work.id, values, itemDialog.work.items);
    } else {
      await updateItem(itemDialog.item.id, values);
    }
    setItemDialog(null);
    refetch();
  };

  const handleWorkSubmitFromTemplate = async (
    templateWork: TemplateWorkFull,
    zoneId: string,
  ) => {
    if (!workDialog || workDialog.mode !== "create") return;
    const siblings = works.filter((w) => w.zone_id === zoneId);
    await createWorkFromTemplate(typeId, zoneId, templateWork, siblings);
    setWorkDialog(null);
    refetch();
  };

  const handleItemSubmitFromTemplate = async (
    items: TemplateItemSelection[],
  ) => {
    if (!itemDialog || itemDialog.mode !== "create") return;
    let nextSortOrder = computeNextSortOrder(itemDialog.work.items);
    await bulkCreateItems(
      itemDialog.work.id,
      items.map((item) => ({ ...item, sort_order: nextSortOrder++ })),
    );
    setItemDialog(null);
    refetch();
  };

  const handleReorderWorks = (zone: Zone, reordered: WorkFull[]) => {
    reorderWorks(
      reordered,
      (w) => ({
        id: w.id,
        type_id: w.type_id,
        zone_id: w.zone_id,
        name: w.name,
        sort_order: w.sort_order,
        template_work_id: w.template_work_id,
      }),
      (withNewOrder) => {
        setWorks((prev) => [
          ...prev.filter((w) => w.zone_id !== zone.id),
          ...withNewOrder,
        ]);
      },
      refetch,
    );
  };

  const handleReorderItems = (work: WorkFull, reordered: ItemRow[]) => {
    reorderItems(
      reordered,
      (i) => ({
        id: i.id,
        work_id: work.id,
        name: i.name,
        unit: i.unit,
        sort_order: i.sort_order,
        created_by: i.created_by,
      }),
      (withNewOrder) => {
        setWorks((prev) =>
          prev.map((w) =>
            w.id === work.id ? { ...w, items: withNewOrder } : w,
          ),
        );
      },
      refetch,
    );
  };

  const handleSaveQuantities = async (
    work: WorkFull,
    updates: ItemEditUpdate[],
  ) => {
    const updateById = new Map(updates.map((u) => [u.id, u]));
    const nextItems = work.items.map((item) => {
      const update = updateById.get(item.id);
      if (!update) return item;
      return {
        ...item,
        ...(update.quantity !== undefined ? { quantity: update.quantity } : {}),
        ...(update.unit_price !== undefined
          ? { unit_price: update.unit_price }
          : {}),
      };
    });
    setWorks((prev) =>
      prev.map((w) => (w.id === work.id ? { ...w, items: nextItems } : w)),
    );

    const changedItems = nextItems.filter((item) => updateById.has(item.id));
    const { error } = await bulkUpdateQuantities(work.id, changedItems);
    if (error) refetch();
  };

  const deleteMessage = (): string | undefined => {
    if (!deleteState) return undefined;
    switch (deleteState.kind) {
      case "work": {
        const itemCount = deleteState.work.items.length;
        return `سيتم حذف ${itemCount} بند ضمن هذا العمل. هل أنت متأكد؟`;
      }
      case "item":
        return "هل تريد حذف هذا البند؟";
      default:
        return undefined;
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteState) return;

    if (deleteState.kind === "work") {
      await deleteWork(deleteState.work);
      setDeleteState(null);
      refetch();
      return;
    }
    if (deleteState.kind === "item") {
      await deleteItem(deleteState.item.id);
      setDeleteState(null);
      refetch();
      return;
    }
  };

  const isDeleting = deletingWork || deletingItem;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold">
            {typeName} — v{currentType?.version ?? 0}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="primary-light"
            className="gap-1"
            onClick={() => setWorkDialog({ mode: "create", zone: null })}
          >
            <Plus className="w-3.5 h-3.5" />
            عمل جديد
          </Button>
          {project && currentType && (
            <BOQPDFDialogButton
              project={project}
              currentType={currentType}
              allTypes={types}
              works={works}
              zones={zones}
            />
          )}
        </div>
      </div>

      <BOQTree
        zones={zonesInUse}
        works={works}
        onAddWork={(zone) => setWorkDialog({ mode: "create", zone })}
        onEditWork={(work) => setWorkDialog({ mode: "edit", work })}
        onDeleteWork={(work) => setDeleteState({ kind: "work", work })}
        onReorderWorks={handleReorderWorks}
        onAddItem={(work) => setItemDialog({ mode: "create", work })}
        onEditItem={(work, item) => setItemDialog({ mode: "edit", work, item })}
        onDeleteItem={(work, item) => setDeleteState({ kind: "item", work, item })}
        onReorderItems={handleReorderItems}
        onSaveQuantities={handleSaveQuantities}
        savingQuantities={savingQuantities}
      />

      {workDialog !== null && (
        <WorkFormDialog
          isOpen={workDialog !== null}
          onClose={() => setWorkDialog(null)}
          onSubmit={handleWorkSubmit}
          onSubmitFromTemplate={handleWorkSubmitFromTemplate}
          loading={savingWork || savingWorkFromTemplate}
          templateTypeId={currentType?.template_type_id}
          zones={zones}
          zone={workDialog?.mode === "create" ? workDialog.zone : null}
          defaultValues={
            workDialog?.mode === "edit"
              ? { name: workDialog.work.name }
              : undefined
          }
        />
      )}

      {itemDialog !== null && (
        <ItemFormDialog
          isOpen={itemDialog !== null}
          onClose={() => setItemDialog(null)}
          onSubmit={handleItemSubmit}
          onSubmitFromTemplate={handleItemSubmitFromTemplate}
          loading={savingItem || savingItemsFromTemplate}
          templateWorkId={
            itemDialog?.mode === "create"
              ? itemDialog.work.template_work_id
              : null
          }
          defaultValues={
            itemDialog?.mode === "edit"
              ? {
                  name: itemDialog.item.name,
                  unit: itemDialog.item.unit,
                  quantity: itemDialog.item.quantity,
                  unit_price: itemDialog.item.unit_price,
                }
              : undefined
          }
        />
      )}

      <ConfirmDialog
        open={deleteState !== null}
        onCancel={() => setDeleteState(null)}
        onConfirm={handleConfirmDelete}
        loading={isDeleting}
        message={deleteMessage()}
        confirmVariant="error"
      />
    </div>
  );
};

export default BOQTypeReviewPage;
