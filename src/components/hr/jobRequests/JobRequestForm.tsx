import { useState } from "react";
import { useForm } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import Button from "../../ui/Button";
import { TextField } from "../../ui/inputs/TextField";
import { SelectField } from "../../ui/inputs/SelectField";
import { NumberField } from "../../ui/inputs/NumberField";
import { TextAreaField } from "../../ui/inputs/TextAreaField";
import {
  jobRequestSchema,
  JobRequestFormValues,
} from "../../../types/schema/jobRequest.schema";
import { createJobRequest } from "../../../services/hr/jobRequestsService";
import { hrJobRequestsKey } from "../../../hooks/hr/useJobRequests";
import { useDepartments } from "../../../hooks/permissions/useDepartments";
import { useAuth } from "../../../hooks/useAuth";

const JobRequestForm: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: departments = [] } = useDepartments();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<JobRequestFormValues>({
    resolver: zodResolver(
      jobRequestSchema,
    ) as unknown as Resolver<JobRequestFormValues>,
    defaultValues: { positionsCount: 1 },
  });

  const onSubmit = async (data: JobRequestFormValues) => {
    setLoading(true);
    try {
      const response = await createJobRequest(data, user?.id ?? null);
      if (!response.success || !("data" in response) || !response.data) {
        alert("خطأ في إنشاء طلب التوظيف: " + response.message);
        return;
      }
      queryClient.invalidateQueries({ queryKey: hrJobRequestsKey });
      navigate(`/hr/job-requests/${response.data.id}`);
    } catch (error) {
      console.error("Unexpected error creating job request:", error);
      alert("حدث خطأ غير متوقع أثناء إنشاء طلب التوظيف.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-sm">
      <h1 className="text-2xl font-semibold mb-1">طلب توظيف جديد</h1>
      <p className="text-sm text-gray-500 mb-4">
        بعد الحفظ يمكنك بناء استبيان المتقدمين الخاص بهذه الوظيفة
      </p>

      <form
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <TextField
          id="positionTitle"
          label="مسمى الوظيفة"
          register={register("positionTitle")}
          error={errors.positionTitle}
        />

        <SelectField
          id="department"
          label="القسم (اختياري)"
          options={departments.map((d) => ({
            value: d.name_ar || d.name,
            label: d.name_ar || d.name,
          }))}
          register={register("department")}
          error={errors.department}
        />

        <NumberField
          id="positionsCount"
          label="عدد الشواغر"
          step={1}
          min={1}
          register={register("positionsCount", { valueAsNumber: true })}
          error={errors.positionsCount}
        />

        <div className="md:col-span-2">
          <TextAreaField
            id="justification"
            label="سبب الطلب / وصف الحاجة (اختياري)"
            register={register("justification")}
            error={errors.justification}
          />
        </div>

        <div className="md:col-span-2 flex justify-end mt-3">
          <Button loading={loading} type="submit">
            حفظ الطلب
          </Button>
        </div>
      </form>
    </div>
  );
};

export default JobRequestForm;
