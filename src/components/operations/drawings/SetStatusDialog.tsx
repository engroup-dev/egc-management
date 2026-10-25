import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Dialog from "../../ui/Dialog";
import Button from "../../ui/Button";
import { TextAreaField } from "../../ui/inputs/TextAreaField";
import {
  useSetDrawingStatus,
  type DrawingFolderRow,
  type DrawingStatus,
} from "../../../hooks/operations/drawings/useProjectDrawings";
import {
  DrawingStatusSchema,
  type DrawingStatusFormValues,
} from "../../../types/schema/projectDrawings.schema";
import { STATUS_HINTS, STATUS_LABELS } from "./drawingLabels";

interface Props {
  projectId: string;
  folder: DrawingFolderRow;
  isOpen: boolean;
  onClose: () => void;
}

const OPTIONS: DrawingStatus[] = ["ok", "design", "modification"];

const SetStatusDialog = ({ projectId, folder, isOpen, onClose }: Props) => {
  const setStatus = useSetDrawingStatus(projectId);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, reset, watch, formState: { errors } } =
    useForm<DrawingStatusFormValues>({
      resolver: zodResolver(DrawingStatusSchema),
    });

  useEffect(() => {
    if (isOpen) {
      reset({ status: folder.status as DrawingStatus, note: folder.status_note ?? "" });
      setError(null);
    }
  }, [isOpen, folder, reset]);

  const onSubmit = async (values: DrawingStatusFormValues) => {
    setError(null);
    try {
      await setStatus.mutateAsync({ folderId: folder.id, status: values.status, note: values.note });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحديث الحالة");
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div>
          <h2 className="text-lg font-bold">الحالة – {folder.name}</h2>
          <p className="text-sm text-gray-500">
            أبلغ فريق المشروع إن كانت هذه الخرائط آمنة للاستخدام.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          {OPTIONS.map((value) => (
            <label key={value} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-gray-50">
              <input type="radio" value={value} {...register("status")} className="mt-1 h-4 w-4 accent-primary" />
              <span>
                <span className="block text-sm font-semibold">{STATUS_LABELS[value]}</span>
                <span className="block text-xs text-gray-500">{STATUS_HINTS[value]}</span>
              </span>
            </label>
          ))}
        </div>

        {watch("status") !== "ok" && (
          <TextAreaField
            id="drawing-status-note"
            label="ملاحظة (اختياري)"
            placeholder="ما الذي يتغير، ومتى يُتوقع الإصدار الجديد"
            rows={2}
            register={register("note")}
            error={errors.note}
          />
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" loading={setStatus.isPending}>
            حفظ الحالة
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

export default SetStatusDialog;
