import { useMemo, useRef, useState } from "react";
import {
  useProjectsDistribute,
  DistributionProject,
  DistributionProgress,
} from "../../hooks/projects/useProjectsDistribute";
import { supabase } from "../../lib/supabaseClient";
import LoadingPage from "../../components/ui/LoadingPage";
import ErrorPage from "../../components/ui/errorPage";
import StepsHeader from "../../components/ui/StepsHeader";
import StepTwoProjectDistribute from "../../components/company/StepTwoProjectDistribute";
import StepThreeProjectDistribute from "../../components/company/StepThreeProjectDistribute";
import StepOneProjectDistribute from "../../components/company/SetpOneProjectDistibute";
import SharesPdfButton from "../../components/pdf-buttons/SharesPdfButton";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import RefreshingBadge from "../../components/ui/RefreshingBadge";

// ─── Progress Checklist Overlay ───────────────────────────────────────────────

function DistributionProgressOverlay({
  items,
}: {
  items: DistributionProgress[];
}) {
  const done = items.filter((i) => i.status === "done").length;
  const total = items.length;
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="p-4 flex flex-col items-center justify-center min-h-[60vh]">
      <div className="bg-white rounded-xl border shadow-sm p-8 max-w-md w-full space-y-5">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="text-3xl animate-pulse">⚙️</div>
          <h2 className="text-lg font-bold text-gray-800">جاري التوزيع...</h2>
          <p className="text-xs text-gray-400">
            يرجى الانتظار وعدم إغلاق الصفحة
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-center text-gray-500">
          {done} / {total} مكتمل
        </p>

        {/* Checklist */}
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {items.map((item) => (
            <div
              key={item.projectId}
              className={[
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                item.status === "processing"
                  ? "bg-blue-50 border border-blue-200"
                  : item.status === "done"
                    ? "bg-gray-50"
                    : item.status === "error"
                      ? "bg-red-50 border border-red-200"
                      : "bg-white",
              ].join(" ")}
            >
              {/* Icon */}
              <span className="w-5 text-center shrink-0">
                {item.status === "done" && (
                  <span className="text-green-500">✓</span>
                )}
                {item.status === "processing" && (
                  <span className="inline-block animate-spin text-blue-500">
                    ◌
                  </span>
                )}
                {item.status === "pending" && (
                  <span className="text-gray-300">○</span>
                )}
                {item.status === "error" && (
                  <span className="text-red-500">✕</span>
                )}
              </span>

              {/* Name */}
              <span
                className={[
                  "flex-1 truncate",
                  item.status === "done"
                    ? "text-gray-400 line-through"
                    : item.status === "processing"
                      ? "text-blue-700 font-semibold"
                      : item.status === "error"
                        ? "text-red-600"
                        : "text-gray-500",
                ].join(" ")}
              >
                {item.projectName}
              </span>

              {/* Badge */}
              {item.status === "processing" && (
                <span className="text-xs text-blue-400 shrink-0">
                  معالجة...
                </span>
              )}
              {item.status === "error" && (
                <span className="text-xs text-red-400 shrink-0">خطأ</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const ProjectsDistributePage = () => {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<DistributionProgress[]>([]);
  const [distributedProjects, setDistributedProjects] = useState<
    DistributionProject[] | null
  >(null);
  const [invalidProjectIds, setInvalidProjectIds] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { projects, loading, refreshing, error, submitDistribution, refetch } =
    useProjectsDistribute();
  const steps = useMemo(
    () => [
      { title: "عرض المشاريع" },
      { title: "مراجعة التوزيع" },
      { title: "ملخص الشركاء" },
    ],
    [],
  );

  const maxStep = steps.length;

  const isSubmittingRef = useRef(false); // ← add this

  const handleSubmit = async () => {
    // ✅ Synchronous guard — blocks double-calls immediately
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    if (!projects || projects.length === 0) {
      window.alert("لا توجد مشاريع للتوزيع");
      isSubmittingRef.current = false;
      return;
    }

    try {
      setIsSubmitting(true);
      setProgress([]);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        window.alert("لم يتم التعرف على المستخدم. الرجاء تسجيل الدخول.");
        return;
      }

      const result = await submitDistribution(projects, user.id, setProgress);

      if (!result.success) {
        window.alert(`حدث خطأ: ${result.error}`);
        return;
      }

      setDistributedProjects([...projects]);
    } catch (e) {
      console.error(e);
      window.alert("حدث خطأ أثناء إرسال البيانات. الرجاء المحاولة مرة أخرى.");
    } finally {
      isSubmittingRef.current = false; // ← always release
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    // refetch the projects to get fresh data from the server
    refetch();
    setDistributedProjects(null);
    setProgress([]);
    setStep(1);
  };

  if (loading) return <LoadingPage label="جاري تحميل معلومات المشاريع" />;
  if (error)
    return (
      <ErrorPage
        error={error.message || "حدث خطأ أثناء تحميل معلومات المشاريع"}
        label="صفحة توزيع المشاريع"
      />
    );

  const safeProjects = projects ?? [];

  // ── Progress overlay (while submitting) ───────────────────────────────────
  if (isSubmitting) {
    // remove the progress.length check
    return <DistributionProgressOverlay items={progress} />;
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (distributedProjects) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="bg-white rounded-xl border shadow-sm p-8 max-w-md w-full text-center space-y-4">
          <div className="text-5xl">✅</div>
          <h2 className="text-xl font-bold text-gray-800">
            تم تأكيد التوزيع بنجاح
          </h2>
          <p className="text-sm text-gray-500">
            تم إنشاء كشوف الرواتب وتحديث أرصدة الموظفين والحسابات.
          </p>

          {/* Employee summary */}
          <div className="rounded-lg border bg-gray-50 p-3 text-sm text-right space-y-1">
            <p className="font-semibold text-gray-700 mb-2 text-center">
              ملخص الحصص
            </p>
            {distributedProjects.flatMap((project) =>
              (project.project_distributions ?? []).map((a) => {
                const name =
                  `${a.employee.first_name} ${a.employee.last_name ?? ""}`.trim();
                return (
                  <div
                    key={`${project.id}-${a.employee.id}`}
                    className="flex justify-between text-gray-600"
                  >
                    <span>👤 {name}</span>
                    <span className="text-xs text-gray-400">
                      {a.percentage}% — {project.name}
                    </span>
                  </div>
                );
              }),
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2">
            <SharesPdfButton projects={distributedProjects} />
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-md text-sm bg-gray-100 hover:bg-gray-200 text-gray-600"
            >
              توزيع جديد
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Normal wizard ─────────────────────────────────────────────────────────
  return (
    <div className="p-4">
      <h1 className="text-center text-2xl font-bold mb-2">
        توزيع المشاريع <RefreshingBadge show={refreshing} />
      </h1>

      <StepsHeader setStep={setStep} steps={steps} current={step} />

      {step === 1 && <StepOneProjectDistribute projects={safeProjects} />}
      {step === 2 && (
        <StepTwoProjectDistribute
          projects={safeProjects}
          onRefetch={refetch}
          onValidationChange={setInvalidProjectIds}
        />
      )}
      {step === 3 && (
        <StepThreeProjectDistribute
          projects={safeProjects}
          onRefetch={refetch}
        />
      )}

      <div className="max-w-4xl mx-auto flex justify-between gap-2 mt-6">
        <button
          onClick={() => setStep((p) => Math.max(p - 1, 1))}
          disabled={step === 1 || isSubmitting}
          className={[
            "px-4 py-2 rounded-md",
            step === 1 || isSubmitting
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-gray-200 hover:bg-gray-300",
          ].join(" ")}
        >
          السابق
        </button>

        {step < maxStep ? (
          <button
            onClick={() => {
              if (step === 2 && invalidProjectIds.length > 0) return;
              setStep((p) => Math.min(p + 1, maxStep));
            }}
            disabled={
              isSubmitting || (step === 2 && invalidProjectIds.length > 0)
            }
            className={[
              "px-4 py-2 rounded-md text-white",
              step === 2 && invalidProjectIds.length > 0
                ? "bg-blue-200 cursor-not-allowed"
                : "bg-blue-500 hover:bg-blue-600",
            ].join(" ")}
            title={
              step === 2 && invalidProjectIds.length > 0
                ? "يرجى تصحيح نسب التوزيع أولاً"
                : undefined
            }
          >
            التالي
          </button>
        ) : (
          <>
            <Button
              variant="success"
              size="md"
              // Never submit shares from the cached list while it is
              // still being re-checked against the server.
              disabled={isSubmitting || refreshing}
              loading={isSubmitting}
              onClick={() => setConfirmOpen(true)} // ← open dialog instead of submitting directly
            >
              تأكيد التوزيع
            </Button>

            <ConfirmDialog
              open={confirmOpen}
              onCancel={() => setConfirmOpen(false)}
              onConfirm={() => {
                setConfirmOpen(false);
                handleSubmit();
              }}
              title="تأكيد توزيع المشاريع"
              message="هل أنت متأكد من تأكيد توزيع المشاريع؟ لا يمكن التراجع عن هذا الإجراء بعد الإرسال."
              confirmLabel="نعم، تأكيد التوزيع"
              confirmVariant="success"
            />
          </>
        )}
      </div>
    </div>
  );
};

export default ProjectsDistributePage;
