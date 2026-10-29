import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Dialog from "../../ui/Dialog";
import Button from "../../ui/Button";
import { SearchableSelectField } from "../../ui/inputs/SearchableSelectField";
import {
  useAddDrawingFolder,
  useAllMapTypes,
} from "../../../hooks/operations/drawings/useProjectDrawings";
import {
  AddDrawingFolderSchema,
  type AddDrawingFolderFormValues,
} from "../../../types/schema/projectDrawings.schema";

interface Props {
  projectId: string;
  /** map_type_id of every folder the project already has. */
  usedMapTypeIds: string[];
  isOpen: boolean;
  onClose: () => void;
}

const AddFolderDialog = ({ projectId, usedMapTypeIds, isOpen, onClose }: Props) => {
  const mapTypes = useAllMapTypes(isOpen);
  const add = useAddDrawingFolder(projectId);
  const [error, setError] = useState<string | null>(null);

  const available = useMemo(
    () => (mapTypes.data ?? []).filter((m) => !usedMapTypeIds.includes(m.id)),
    [mapTypes.data, usedMapTypeIds],
  );

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<AddDrawingFolderFormValues>({
    resolver: zodResolver(AddDrawingFolderSchema),
    defaultValues: { mapTypeIds: [] },
  });

  const selectedCount = watch("mapTypeIds")?.length ?? 0;

  useEffect(() => {
    if (isOpen) {
      reset({ mapTypeIds: [] });
      setError(null);
    }
  }, [isOpen, reset]);

  const onSubmit = async (values: AddDrawingFolderFormValues) => {
    setError(null);
    try {
      await add.mutateAsync(values.mapTypeIds);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إضافة أنواع الخرائط");
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <h2 className="text-lg font-bold">إضافة نوع خريطة</h2>

        {mapTypes.isLoading ? (
          <p className="text-sm text-gray-500">جاري التحميل...</p>
        ) : available.length === 0 ? (
          <p className="text-sm text-gray-600">
            المشروع يحتوي على جميع أنواع الخرائط المعرّفة. لإضافة نوع جديد إلى
            القائمة، انتقل إلى{" "}
            <Link to="/settings/maps" className="text-primary hover:underline">
              الإعدادات › الخرائط
            </Link>
            .
          </p>
        ) : (
          <Controller
            control={control}
            name="mapTypeIds"
            render={({ field }) => (
              <SearchableSelectField
                id="drawing-map-type"
                label="نوع الخريطة"
                placeholder="اختر..."
                multiple
                options={available.map((m) => ({ value: m.id, label: m.name }))}
                values={field.value}
                onChange={field.onChange}
                loading={mapTypes.isLoading}
                error={errors.mapTypeIds as { message?: string } | undefined}
              />
            )}
          />
        )}

        {(error || mapTypes.error) && (
          <p className="text-sm text-red-600">{error ?? (mapTypes.error as Error).message}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" loading={add.isPending} disabled={available.length === 0}>
            {selectedCount > 0 ? `إضافة (${selectedCount})` : "إضافة"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

export default AddFolderDialog;
