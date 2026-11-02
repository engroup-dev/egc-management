import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatCurrency } from "../../../utils/helpper";
import { DistributionPeriod } from "../../../hooks/projects/useDistributionHistory";
import { savePeriodGroupDistribution } from "../../../hooks/projects/periodEdit";
import EmployeePicker from "./EmployeePicker";

const rowSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["bank", "company", "employee"]),
  employeeId: z.string().optional(),
  percentage: z.number().min(0, "لا يمكن أن تكون سالبة").max(100),
  amount: z.number().min(0),
});

const formSchema = z
  .object({ rows: z.array(rowSchema) })
  .superRefine((data, ctx) => {
    const sum = data.rows.reduce((s, r) => s + (Number(r.percentage) || 0), 0);
    const rounded = Math.round(sum * 100) / 100;
    if (rounded !== 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `مجموع النسب يجب أن يساوي 100% (الحالي: ${rounded.toFixed(2)}%)`,
        path: ["rows", Math.max(data.rows.length - 1, 0), "percentage"],
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

interface Props {
  periods: DistributionPeriod[]; // cash + bank periods for one project/currency
  onSave?: () => void;
}

const PeriodDistributionEditForm = ({ periods, onSave }: Props) => {
  const queryClient = useQueryClient();
  const [showPicker, setShowPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currency = (periods[0]?.currency ?? "LYD") as "LYD" | "USD" | "EUR";
  const combinedTotal = periods.reduce((s, p) => s + Number(p.total_amount), 0);
  const typeLabel = periods
    .map((p) => (p.type === "bank" ? "بنك" : "نقد"))
    .join(" + ");

  // Percentages are shared across the group's periods (same split, different
  // totals) — build one row set from whichever period has each item, and sum
  // the displayed amount across periods for that item.
  const defaultRows = useMemo<FormValues["rows"]>(() => {
    const rows: FormValues["rows"] = [];

    const bankItems = periods
      .map((p) => p.items.find((i) => i.item_type === "bank"))
      .filter((i): i is NonNullable<typeof i> => Boolean(i));
    if (bankItems.length > 0) {
      rows.push({
        id: "bank",
        label: "🏦 البنك / الاحتياطي",
        type: "bank",
        percentage: Number(bankItems[0].percentage),
        amount: bankItems.reduce((s, i) => s + Number(i.total), 0),
      });
    }

    const companyItems = periods
      .map((p) => p.items.find((i) => i.item_type === "company"))
      .filter((i): i is NonNullable<typeof i> => Boolean(i));
    if (companyItems.length > 0) {
      rows.push({
        id: "company",
        label: "🏢 الشركة",
        type: "company",
        percentage: Number(companyItems[0].percentage),
        amount: companyItems.reduce((s, i) => s + Number(i.total), 0),
      });
    }

    const employeeIds = new Set<string>();
    periods.forEach((p) =>
      p.items.forEach((i) => {
        if (i.item_type === "employee" && i.user_id) employeeIds.add(i.user_id);
      }),
    );

    employeeIds.forEach((empId) => {
      const matchingItems = periods
        .map((p) =>
          p.items.find(
            (i) => i.item_type === "employee" && i.user_id === empId,
          ),
        )
        .filter((i): i is NonNullable<typeof i> => Boolean(i));
      if (matchingItems.length === 0) return;

      rows.push({
        id: `employee-${empId}`,
        label: `👤 ${matchingItems[0].employee_name ?? empId}`,
        type: "employee",
        employeeId: empId,
        percentage: Number(matchingItems[0].percentage),
        amount: matchingItems.reduce((s, i) => s + Number(i.total), 0),
      });
    });

    return rows;
  }, [periods]);

  const {
    control,
    register,
    watch,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { rows: defaultRows },
    mode: "onChange",
  });

  const { fields, append, remove } = useFieldArray({ control, name: "rows" });
  const watchedRows = watch("rows");

  const percentageSum = watchedRows.reduce(
    (s, r) => s + (Number(r.percentage) || 0),
    0,
  );
  const roundedSum = Math.round(percentageSum * 100) / 100;
  const isValid = roundedSum === 100;
  const currentTotal = watchedRows.reduce(
    (s, r) => s + (Number(r.amount) || 0),
    0,
  );

  const handleAddEmployee = (employeeId: string, name: string, pct: number) => {
    append({
      id: `employee-${employeeId}`,
      label: `👤 ${name}`,
      type: "employee",
      employeeId,
      percentage: pct,
      amount: Number(((pct / 100) * combinedTotal).toFixed(2)),
    });
    setShowPicker(false);
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    const result = await savePeriodGroupDistribution(periods, values.rows);
    setIsSubmitting(false);
    if (!result.success) {
      window.alert(`حدث خطأ: ${result.error}`);
      return;
    }
    // Periods and company_account changed: refresh every money screen
    // that reads them, not just the history list the caller refetches.
    void queryClient.invalidateQueries({ queryKey: ["company"] });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({ queryKey: ["projects-list"] });
    onSave?.();
  };

  return (
    <>
      {showPicker && (
        <EmployeePicker
          currency={currency}
          total={combinedTotal}
          existingIds={watchedRows
            .filter((r) => r.type === "employee")
            .map((r) => r.employeeId)
            .filter((id): id is string => Boolean(id))}
          onAdd={(empId, name, pct) => handleAddEmployee(empId, name, pct)}
          onClose={() => setShowPicker(false)}
        />
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" dir="rtl">
        <div className="flex items-center justify-between mb-1">
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700">
            {currency} · {typeLabel}
          </span>
          <div className="text-xs font-semibold text-gray-700 space-y-0.5 text-left">
            <div>
              الإجمالي الثابت: {formatCurrency(combinedTotal, currency)}
            </div>
            <div
              className={`font-bold ${isValid ? "text-green-600" : "text-red-500"}`}
            >
              مجموع النسب: {roundedSum.toFixed(2)}%{" "}
              {isValid ? "✓" : `(${(100 - roundedSum).toFixed(2)}% متبقي)`}
            </div>
          </div>
        </div>

        <p className="text-[11px] text-gray-400 -mt-1">
          النسبة الواحدة تُطبَّق تلقائيًا على كل من النقد والبنك بنفس الوقت.
        </p>

        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-right text-gray-500">
              <th className="px-2 py-2">الجهة</th>
              <th className="px-2 py-2 w-28">النسبة %</th>
              <th className="px-2 py-2 w-32">المبلغ (نقد+بنك)</th>
              <th className="px-2 py-2 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {fields.map((field, index) => {
              const rowData = watchedRows[index];
              const rowType = rowData?.type;
              const percentageError = errors.rows?.[index]?.percentage?.message;

              return (
                <tr
                  key={field.id}
                  className={
                    rowType === "bank"
                      ? "bg-yellow-50 text-right"
                      : rowType === "company"
                        ? "bg-green-50 text-right"
                        : "text-right"
                  }
                >
                  <td className="px-2 py-2 font-medium">{rowData?.label}</td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      {...register(`rows.${index}.percentage`, {
                        valueAsNumber: true,
                        onChange: (e) => {
                          const pct = parseFloat(e.target.value) || 0;
                          setValue(
                            `rows.${index}.amount`,
                            Number(((pct / 100) * combinedTotal).toFixed(2)),
                            { shouldDirty: true },
                          );
                        },
                      })}
                      className={`w-full rounded border px-2 py-1 text-right tabular-nums outline-none focus:ring-1 ${
                        percentageError
                          ? "border-red-400 focus:ring-red-400"
                          : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                      }`}
                    />
                    {percentageError && (
                      <p className="mt-1 text-[10px] text-red-500 leading-tight">
                        {percentageError}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      step="0.01"
                      readOnly
                      {...register(`rows.${index}.amount`, {
                        valueAsNumber: true,
                      })}
                      className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1 text-right tabular-nums outline-none cursor-default"
                    />
                  </td>
                  <td className="px-1 py-2 text-center">
                    {rowType === "employee" && (
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="text-gray-300 hover:text-red-500 transition-colors text-sm leading-none"
                        title="حذف"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 text-right font-semibold">
              <td className="px-2 py-2">المجموع</td>
              <td className="px-2 py-2 tabular-nums">
                {roundedSum.toFixed(2)}%
              </td>
              <td className="px-2 py-2 tabular-nums">
                {formatCurrency(currentTotal, currency)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>

        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          <span className="text-base leading-none">+</span> إضافة موظف
        </button>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSubmitting || !isValid}
            className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "جاري الحفظ..." : "حفظ التعديلات"}
          </button>
        </div>
      </form>
    </>
  );
};

export default PeriodDistributionEditForm;
