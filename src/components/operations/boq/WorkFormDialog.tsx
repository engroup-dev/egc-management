import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Dialog from "../../ui/Dialog";
import Button from "../../ui/Button";
import { TextField } from "../../ui/inputs/TextField";
import { WorkFormValues, WorkSchema } from "../../../types/schema/boq/work.schema";
import { TemplateWorkFull } from "../../../hooks/operations/boq/types";
import { useTemplateTypeWorks } from "../../../hooks/operations/boq/useTemplateWorks";
import { Zone } from "../../../hooks/operations/boq/useZones";

const DEFAULT_VALUES: WorkFormValues = { name: "" };

type WorkFormDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: WorkFormValues, zoneId: string) => void | Promise<void>;
  onSubmitFromTemplate?: (
    templateWork: TemplateWorkFull,
    zoneId: string,
  ) => void | Promise<void>;
  defaultValues?: WorkFormValues;
  loading?: boolean;
  templateTypeId?: string | null;
  /** Full, unfiltered project zone list — lets a work be added to a zone the type doesn't use yet. */
  zones: Zone[];
  /** Preset zone (e.g. clicked from a zone's own "add work" button). When set, the zone picker is skipped. */
  zone?: Zone | null;
};

const WorkFormDialog: React.FC<WorkFormDialogProps> = ({
  isOpen,
  onClose,
  onSubmit,
  onSubmitFromTemplate,
  defaultValues,
  loading = false,
  templateTypeId,
  zones,
  zone,
}) => {
  if (!isOpen) return null;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WorkFormValues>({
    resolver: zodResolver(WorkSchema),
    defaultValues: defaultValues ?? DEFAULT_VALUES,
  });

  const offerTemplate = !defaultValues && !!templateTypeId;
  const needsZonePicker = !defaultValues && !zone;

  const [source, setSource] = useState<"manual" | "template">("manual");
  const [selectedTemplateWorkId, setSelectedTemplateWorkId] = useState("");
  const [selectedZoneId, setSelectedZoneId] = useState(zone?.id ?? "");

  const { works: templateWorks } = useTemplateTypeWorks(
    offerTemplate && source === "template" ? (templateTypeId as string) : "",
  );

  useEffect(() => {
    if (isOpen) {
      reset(defaultValues ?? DEFAULT_VALUES);
      setSource("manual");
      setSelectedTemplateWorkId("");
      setSelectedZoneId(zone?.id ?? "");
    }
  }, [isOpen, defaultValues, zone, reset]);

  const zoneId = zone?.id ?? selectedZoneId;

  const handleManualSubmit = async (values: WorkFormValues) => {
    if (!zoneId) return;
    await onSubmit(values, zoneId);
  };

  const handleTemplateSubmit = async () => {
    if (!zoneId) return;
    const templateWork = templateWorks.find(
      (w) => w.id === selectedTemplateWorkId,
    );
    if (!templateWork) return;
    await onSubmitFromTemplate?.(templateWork, zoneId);
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">
          {defaultValues ? "تعديل عمل" : "عمل جديد"}
        </h2>

        {needsZonePicker && (
          <div className="flex flex-col">
            <label
              htmlFor="work-zone-select"
              className="mb-1 text-sm text-foreground"
            >
              المنطقة
            </label>
            <select
              id="work-zone-select"
              value={selectedZoneId}
              onChange={(e) => setSelectedZoneId(e.target.value)}
              className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">-- اختر --</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {offerTemplate && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSource("template")}
              className={`flex-1 rounded border px-3 py-2 text-sm ${
                source === "template"
                  ? "border-primary bg-primary-superLight text-primary"
                  : "border-border text-foreground"
              }`}
            >
              من القالب
            </button>
            <button
              type="button"
              onClick={() => setSource("manual")}
              className={`flex-1 rounded border px-3 py-2 text-sm ${
                source === "manual"
                  ? "border-primary bg-primary-superLight text-primary"
                  : "border-border text-foreground"
              }`}
            >
              يدوي
            </button>
          </div>
        )}

        {source === "manual" ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={handleSubmit(handleManualSubmit)}
            noValidate
          >
            <TextField
              id="work-name"
              label="اسم العمل"
              register={register("name")}
              error={errors.name}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                إلغاء
              </Button>
              <Button type="submit" loading={loading} disabled={!zoneId}>
                {defaultValues ? "حفظ" : "إنشاء"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col">
              <label
                htmlFor="work-template-select"
                className="mb-1 text-sm text-foreground"
              >
                عمل القالب
              </label>
              <select
                id="work-template-select"
                value={selectedTemplateWorkId}
                onChange={(e) => setSelectedTemplateWorkId(e.target.value)}
                className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">-- اختر --</option>
                {templateWorks.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                إلغاء
              </Button>
              <Button
                type="button"
                loading={loading}
                disabled={!selectedTemplateWorkId || !zoneId}
                onClick={handleTemplateSubmit}
              >
                إنشاء
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};

export default WorkFormDialog;
