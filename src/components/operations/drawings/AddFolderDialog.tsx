import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Dialog from "../../ui/Dialog";
import Button from "../../ui/Button";
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
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddDrawingFolderFormValues>({
    resolver: zodResolver(AddDrawingFolderSchema),
    defaultValues: { mapTypeId: "" },
  });

  useEffect(() => {
    if (isOpen) {
      reset({ mapTypeId: "" });
      setError(null);
    }
  }, [isOpen, reset]);

  const onSubmit = async (values: AddDrawingFolderFormValues) => {
    setError(null);
    try {
      await add.mutateAsync(values.mapTypeId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إضافة نوع الخريطة");
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
          <div className="flex flex-col">
            <label htmlFor="drawing-map-type" className="mb-1 text-sm text-foreground">
              نوع الخريطة
            </label>
            <select
              id="drawing-map-type"
              {...register("mapTypeId")}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">اختر...</option>
              {available.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            {errors.mapTypeId && (
              <span className="mt-1 text-xs text-red-500">{errors.mapTypeId.message}</span>
            )}
          </div>
        )}

        {(error || mapTypes.error) && (
          <p className="text-sm text-red-600">{error ?? (mapTypes.error as Error).message}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" loading={add.isPending} disabled={available.length === 0}>
            إضافة
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

export default AddFolderDialog;
