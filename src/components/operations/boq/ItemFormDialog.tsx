import React, { useEffect, useState } from "react";
import { Resolver, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Dialog from "../../ui/Dialog";
import Button from "../../ui/Button";
import { TextField } from "../../ui/inputs/TextField";
import { NumberField } from "../../ui/inputs/NumberField";
import { ItemFormValues, ItemSchema } from "../../../types/schema/boq/item.schema";
import { useTemplateWorkItems } from "../../../hooks/operations/boq/useTemplateItems";

const DEFAULT_VALUES: ItemFormValues = {
  name: "",
  unit: "",
  quantity: 1,
  unit_price: null,
};

export type TemplateItemSelection = {
  name: string;
  unit: string;
  quantity: number;
  unit_price: number | null;
};

type TemplateItemRowState = TemplateItemSelection & {
  templateItemId: string;
  selected: boolean;
};

type ItemFormDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: ItemFormValues) => void | Promise<void>;
  onSubmitFromTemplate?: (
    items: TemplateItemSelection[],
  ) => void | Promise<void>;
  defaultValues?: ItemFormValues;
  loading?: boolean;
  templateWorkId?: string | null;
};

const ItemFormDialog: React.FC<ItemFormDialogProps> = ({
  isOpen,
  onClose,
  onSubmit,
  onSubmitFromTemplate,
  defaultValues,
  loading = false,
  templateWorkId,
}) => {
  if (!isOpen) return null;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ItemFormValues>({
    resolver: zodResolver(ItemSchema) as Resolver<ItemFormValues>,
    defaultValues: defaultValues ?? DEFAULT_VALUES,
  });

  const offerTemplate = !defaultValues && !!templateWorkId;

  const [source, setSource] = useState<"manual" | "template">("manual");
  const [templateRows, setTemplateRows] = useState<TemplateItemRowState[]>([]);

  const { items: templateItems } = useTemplateWorkItems(
    offerTemplate && source === "template" ? (templateWorkId as string) : "",
  );

  useEffect(() => {
    if (isOpen) {
      reset(defaultValues ?? DEFAULT_VALUES);
      setSource("manual");
    }
  }, [isOpen, defaultValues, reset]);

  useEffect(() => {
    if (!isOpen || source !== "template" || templateItems.length === 0) return;
    setTemplateRows(
      templateItems.map((item) => ({
        templateItemId: item.id,
        selected: false,
        name: item.name,
        unit: item.unit,
        quantity: item.default_quantity,
        unit_price: item.default_unit_price,
      })),
    );
  }, [isOpen, source, templateItems]);

  const toggleTemplateRow = (templateItemId: string) => {
    setTemplateRows((rows) =>
      rows.map((r) =>
        r.templateItemId === templateItemId
          ? { ...r, selected: !r.selected }
          : r,
      ),
    );
  };

  const updateTemplateRow = (
    templateItemId: string,
    patch: Partial<Pick<TemplateItemRowState, "quantity" | "unit_price">>,
  ) => {
    setTemplateRows((rows) =>
      rows.map((r) =>
        r.templateItemId === templateItemId ? { ...r, ...patch } : r,
      ),
    );
  };

  const selectedCount = templateRows.filter((r) => r.selected).length;

  const handleTemplateSubmit = async () => {
    const selected = templateRows
      .filter((r) => r.selected)
      .map(({ name, unit, quantity, unit_price }) => ({
        name,
        unit,
        quantity,
        unit_price,
      }));
    if (selected.length === 0) return;
    await onSubmitFromTemplate?.(selected);
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">
          {defaultValues ? "تعديل بند" : "بند جديد"}
        </h2>

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
            onSubmit={handleSubmit(onSubmit)}
            noValidate
          >
            <TextField
              id="item-name"
              label="اسم البند"
              register={register("name")}
              error={errors.name}
            />
            <div className="grid grid-cols-2 gap-4">
              <TextField
                id="item-unit"
                label="الوحدة"
                register={register("unit")}
                error={errors.unit}
              />
              <NumberField
                id="item-quantity"
                label="الكمية"
                step="0.01"
                register={register("quantity", { valueAsNumber: true })}
                error={errors.quantity}
              />
            </div>
            <NumberField
              id="item-unit-price"
              label="سعر الوحدة (اختياري)"
              step="0.01"
              register={register("unit_price")}
              error={errors.unit_price}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                إلغاء
              </Button>
              <Button type="submit" loading={loading}>
                {defaultValues ? "حفظ" : "إنشاء"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            {templateRows.length === 0 ? (
              <p className="text-sm text-gray-400">
                لا توجد بنود في قالب هذا العمل
              </p>
            ) : (
              <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
                {templateRows.map((row) => (
                  <div
                    key={row.templateItemId}
                    className="border rounded-md p-3 flex flex-col gap-2"
                  >
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={() => toggleTemplateRow(row.templateItemId)}
                      />
                      <span>{row.name}</span>
                      <span className="text-xs text-gray-400 font-normal">
                        {row.unit}
                      </span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col">
                        <label className="mb-1 text-xs text-foreground">
                          الكمية
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={row.quantity}
                          onChange={(e) =>
                            updateTemplateRow(row.templateItemId, {
                              quantity: Number(e.target.value),
                            })
                          }
                          className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="mb-1 text-xs text-foreground">
                          سعر الوحدة
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={row.unit_price ?? ""}
                          onChange={(e) =>
                            updateTemplateRow(row.templateItemId, {
                              unit_price:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                          className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                إلغاء
              </Button>
              <Button
                type="button"
                loading={loading}
                disabled={selectedCount === 0}
                onClick={handleTemplateSubmit}
              >
                إضافة ({selectedCount})
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};

export default ItemFormDialog;
