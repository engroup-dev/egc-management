import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import Button from "../../ui/Button";
import Dialog from "../../ui/Dialog";
import { fetchManagementApi } from "../../../lib/managementApiClient";
import { useCan } from "../../../hooks/permissions/useCan";
import { ProjectWithDetailsForBook } from "../../../types/projects.type";
import {
  buildInvoicePayload,
  buildSummedInvoicePayload,
} from "../../../utils/finance/invoicePayload";

// One print button for a project's expenses. The dialog picks what to print:
// materials, labor or maps only, everything, or the admin print (the summed
// invoice, which needs generate_summed_invoice). Everything but the admin print
// goes to one pdf-service route, /invoice/scoped/pdf, with the scope in the body.

type PrintChoice = "material" | "labor" | "maps" | "all" | "admin";

const CHOICES: { value: PrintChoice; label: string; hint: string }[] = [
  { value: "material", label: "المواد", hint: "المواد والخدمات فقط" },
  { value: "labor", label: "العمالة", hint: "أعمال المقاولين والفنيين فقط" },
  { value: "maps", label: "الخرائط", hint: "الخرائط فقط" },
  {
    value: "all",
    label: "كامل",
    hint: "كل شيء: المصروفات والخرائط والراجع والإيداعات",
  },
  {
    value: "admin",
    label: "طباعة الإدارة",
    hint: "فاتورة مجمعة: البنود التي لها نفس الاسم تُدمج في سطر واحد",
  },
];

const SCOPED_PATH = "/api/v1/egc/management/invoice/scoped/pdf";
const SUMMED_PATH = "/api/v1/egc/management/invoice/summed/pdf";

interface PrintProjectDialogProps {
  project: ProjectWithDetailsForBook | null;
}

export default function PrintProjectDialog({
  project,
}: PrintProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<PrintChoice>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { can: canAdminPrint, loading: permissionLoading } = useCan(
    "generate_summed_invoice",
  );

  // Only used to know which parts have rows; the real payload is built on print.
  const rows = useMemo(() => {
    if (!project) return null;
    const payload = buildInvoicePayload(project);
    return {
      material: payload.metrials.length,
      labor: payload.labors.length,
      maps: payload.maps.length,
    };
  }, [project]);

  const choices = CHOICES.filter(
    (c) => c.value !== "admin" || (!permissionLoading && canAdminPrint),
  );

  const hasData = (value: PrintChoice) =>
    value === "all" || value === "admin" || (rows?.[value] ?? 0) > 0;

  function close() {
    if (loading) return;
    setOpen(false);
    setError(null);
  }

  async function handlePrint() {
    if (!project) return;
    setLoading(true);
    setError(null);
    try {
      const admin = choice === "admin";
      const response = await fetchManagementApi(
        admin ? SUMMED_PATH : SCOPED_PATH,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            admin
              ? buildSummedInvoicePayload(project)
              : { ...buildInvoicePayload(project), scope: choice },
          ),
        },
      );

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      window.open(url, "_blank");

      // Optional cleanup after some time
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setOpen(false);
    } catch (err) {
      setError(
        "فشل إنشاء التقرير: " +
          (err instanceof Error ? err.message : "خطأ غير معروف"),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="primary-light"
        disabled={!project}
        onClick={() => setOpen(true)}
      >
        <Printer className="w-4 h-4 ml-1" /> طباعة
      </Button>

      <Dialog isOpen={open} onClose={close}>
        <div dir="rtl" className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold">طباعة</h2>
            <p className="text-sm text-gray-500">اختر ما تريد طباعته</p>
          </div>

          <div className="flex flex-col gap-1">
            {choices.map((c) => {
              const enabled = hasData(c.value);
              return (
                <label
                  key={c.value}
                  className={`flex items-start gap-3 rounded-lg px-2 py-2 ${
                    enabled
                      ? "cursor-pointer hover:bg-gray-50"
                      : "cursor-not-allowed opacity-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="print-choice"
                    value={c.value}
                    checked={choice === c.value}
                    disabled={!enabled}
                    onChange={() => setChoice(c.value)}
                    className="mt-1 h-4 w-4 accent-primary"
                  />
                  <span>
                    <span className="block text-sm font-semibold">
                      {c.label}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {enabled ? c.hint : "لا توجد بيانات"}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              إلغاء
            </Button>
            <Button type="button" loading={loading} onClick={handlePrint}>
              طباعة
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
