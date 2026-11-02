import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import Button from "../../ui/Button";
import { TextField } from "../../ui/inputs/TextField";
import { SelectField } from "../../ui/inputs/SelectField";
import { DateField } from "../../ui/inputs/DateField";
import { NumberField } from "../../ui/inputs/NumberField";
import { TextAreaField } from "../../ui/inputs/TextAreaField";
import DynamicQuestionField, {
  DynamicAnswerValue,
} from "../shared/DynamicQuestionField";
import {
  applicantSchema,
  ApplicantFormValues,
} from "../../../types/schema/applicant.schema";
import { createApplicant } from "../../../services/hr/applicantsService";
import { submitAnswers } from "../../../services/hr/applicantAnswersService";
import { useJobRequests } from "../../../hooks/hr/useJobRequests";
import { hrApplicantsKey } from "../../../hooks/hr/useApplicants";
import { useJobRequestQuestions } from "../../../hooks/hr/useJobRequestQuestions";
import { useScoringConfig } from "../../../hooks/hr/useScoringConfig";
import {
  APPLICANT_GENDER_OPTIONS,
  APPLICATION_SOURCE_OPTIONS,
  CURRENT_EMPLOYMENT_STATUS_OPTIONS,
  EXPERIENCE_LEVEL_OPTIONS,
  SPECIALIZATION_OPTIONS,
} from "../../../types/hr.type";

const ApplicantForm: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { jobRequests, loading: jobRequestsLoading } = useJobRequests(true);
  const { universities, gpaTiers } = useScoringConfig();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ApplicantFormValues>({
    resolver: zodResolver(applicantSchema) as unknown as Resolver<ApplicantFormValues>,
  });

  const jobRequestId = useWatch({ control, name: "jobRequestId" });
  const { questions } = useJobRequestQuestions(jobRequestId || undefined);

  const [answers, setAnswers] = useState<Record<string, DynamicAnswerValue>>(
    {},
  );

  const handleAnswerChange = (questionId: string, value: DynamicAnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const onSubmit = async (data: ApplicantFormValues) => {
    const unanswered = questions.filter((q) => {
      if (!q.is_required) return false;
      const a = answers[q.id];
      if (!a) return true;
      return !a.answerText && (!a.selectedOptionIds || a.selectedOptionIds.length === 0);
    });
    if (unanswered.length > 0) {
      alert("يرجى الإجابة على جميع الأسئلة الإجبارية قبل الإرسال");
      return;
    }

    setLoading(true);
    try {
      // Keep the free-text columns populated from the catalog choice so
      // existing screens that show `university` / `gpa_grade` keep working.
      const response = await createApplicant({
        ...data,
        university:
          universities.find((u) => u.id === data.universityId)?.name ??
          data.university,
        gpaGrade:
          gpaTiers.find((g) => g.id === data.gpaTierId)?.label ?? data.gpaGrade,
      });
      if (!response.success || !("data" in response) || !response.data) {
        alert("خطأ في تسجيل بيانات المتقدم: " + response.message);
        return;
      }

      if (questions.length > 0) {
        const { success, message } = await submitAnswers(
          response.data.id,
          questions.map((q) => ({
            jobRequestQuestionId: q.id,
            answerText: answers[q.id]?.answerText,
            selectedOptionIds: answers[q.id]?.selectedOptionIds,
          })),
        );
        if (!success) {
          alert(message ?? "تم تسجيل البيانات لكن فشل حفظ إجابات الاستبيان");
        }
      }

      queryClient.invalidateQueries({ queryKey: hrApplicantsKey });
      navigate("/hr/applicants");
    } catch (error) {
      console.error("Unexpected error creating applicant:", error);
      alert("حدث خطأ غير متوقع أثناء تسجيل بيانات المتقدم.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-sm">
      <h1 className="text-2xl font-semibold mb-1">بيانات المتقدم للوظيفة</h1>
      <p className="text-sm text-gray-500 mb-4">
        يرجى تعبئة البيانات التالية بنفسك
      </p>

      <form
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <SelectField
          id="jobRequestId"
          label="الوظيفة المتقدم عليها"
          options={jobRequests.map((jr) => ({
            value: jr.id,
            label: jr.department
              ? `${jr.position_title} (${jr.department})`
              : jr.position_title,
          }))}
          register={register("jobRequestId")}
          error={errors.jobRequestId}
          placeholder={
            jobRequestsLoading
              ? "جاري التحميل..."
              : jobRequests.length === 0
                ? "لا توجد وظائف شاغرة حالياً"
                : "-- اختر --"
          }
        />

        <TextField
          id="fullName"
          label="الاسم بالكامل"
          register={register("fullName")}
          error={errors.fullName}
        />

        <SelectField
          id="gender"
          label="الجنس"
          options={APPLICANT_GENDER_OPTIONS.map((o) => ({ ...o }))}
          register={register("gender")}
          error={errors.gender}
        />

        <DateField
          id="birthDate"
          label="تاريخ الميلاد"
          register={register("birthDate")}
          error={errors.birthDate}
        />

        <TextField
          id="phoneWhatsapp"
          label="رقم الهاتف (واتساب)"
          register={register("phoneWhatsapp")}
          error={errors.phoneWhatsapp}
        />

        <SelectField
          id="specialization"
          label="التخصص العلمي"
          options={SPECIALIZATION_OPTIONS.map((o) => ({ ...o }))}
          register={register("specialization")}
          error={errors.specialization}
        />

        <SelectField
          id="universityId"
          label="الجامعة / المعهد"
          options={universities.map((u) => ({ value: u.id, label: u.name }))}
          register={register("universityId")}
          error={errors.universityId}
        />

        <SelectField
          id="gpaTierId"
          label="المعدل / التقدير"
          options={gpaTiers.map((g) => ({ value: g.id, label: g.label }))}
          register={register("gpaTierId")}
          error={errors.gpaTierId}
        />

        <NumberField
          id="graduationYear"
          label="سنة التخرج"
          step={1}
          register={register("graduationYear", { valueAsNumber: true })}
          error={errors.graduationYear}
        />

        <SelectField
          id="experienceLevel"
          label="سنوات الخبرة"
          options={EXPERIENCE_LEVEL_OPTIONS.map((o) => ({ ...o }))}
          register={register("experienceLevel")}
          error={errors.experienceLevel}
        />

        <SelectField
          id="currentEmploymentStatus"
          label="حالة العمل الحالية"
          options={CURRENT_EMPLOYMENT_STATUS_OPTIONS.map((o) => ({ ...o }))}
          register={register("currentEmploymentStatus")}
          error={errors.currentEmploymentStatus}
        />

        <SelectField
          id="applicationSource"
          label="كيف تقدمت للوظيفة؟ (اختياري)"
          options={APPLICATION_SOURCE_OPTIONS.map((o) => ({ ...o }))}
          register={register("applicationSource")}
          error={errors.applicationSource}
        />

        <div className="md:col-span-2">
          <TextAreaField
            id="generalNotes"
            label="ملاحظات عامة (اختياري)"
            register={register("generalNotes")}
            error={errors.generalNotes}
          />
        </div>

        <p className="md:col-span-2 text-xs text-gray-500">
          يمكن رفع السيرة الذاتية لاحقاً من صفحة المتقدم بعد التسجيل.
        </p>

        {questions.length > 0 && (
          <div className="md:col-span-2 pt-4 border-t space-y-4">
            <h2 className="text-md font-medium text-gray-800">
              أسئلة إضافية عن هذه الوظيفة
            </h2>
            {questions.map((q) => (
              <DynamicQuestionField
                key={q.id}
                question={q}
                value={answers[q.id] ?? {}}
                onChange={(value) => handleAnswerChange(q.id, value)}
              />
            ))}
          </div>
        )}

        <div className="md:col-span-2 flex justify-end mt-3">
          <Button loading={loading} type="submit">
            إرسال البيانات
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ApplicantForm;
