import { useState } from "react";
import Button from "../../ui/Button";
import {
  ENGINEERING_ROLE_ID,
  userSchema,
  UserFormValues,
} from "../../../types/schema/users.schema";
import { useForm, useWatch } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TextField } from "../../ui/inputs/TextField";
import { PasswordField } from "../../ui/inputs/PasswordField";
import { SelectField } from "../../ui/inputs/SelectField";
import { DateField } from "../../ui/inputs/DateField";
import { NumberField } from "../../ui/inputs/NumberField";
import { createEmployee } from "../../../services/employees/setEmployeeService";
import { useUtils } from "../../../hooks/useUtils";
import { useDepartments } from "../../../hooks/permissions/useDepartments";
import { ImageUploadField } from "../../ui/inputs/ImageUploadField";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { EMPLOYEE_TYPE } from "../../../enum/employee";
import { linkHiredEmployee } from "../../../services/hr/applicantsService";

interface NewEmployeeFormProps {
  /** Prefills the form, e.g. when hiring a job applicant. */
  initialValues?: Partial<UserFormValues>;
  /** When set, the newly created employee is linked back to this applicant record. */
  applicantId?: string;
}

const NewEmployeeForm: React.FC<NewEmployeeFormProps> = ({
  initialValues,
  applicantId,
}) => {
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { roles, managers } = useUtils();
  // Phase 1's departments table. A department decides what you may do
  // (permission ladder layer 4). Employees no longer pick a speciality.
  const { data: departments = [], isPending: departmentsLoading } =
    useDepartments();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors },
    trigger,
    setFocus,
    reset,
    setValue,
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema) as unknown as Resolver<UserFormValues>,
    defaultValues: {
      employeeId: "EMP-001",
      employeeType: "full-time",
      roleId: "212424d8-219a-4899-a24b-5d5bf05546e8",
      salaryType: "fixed",
      status: "active",
      ...initialValues,
    },
  });

  const onSubmit = async (data: UserFormValues) => {
    setLoading(true);
    console.log("Submitting new employee:", data);
    try {
      const response = await createEmployee(data);
      if (!response.success) {
        alert("خطأ في إنشاء الموظف: " + response.message);
        throw new Error(response.message);
      }

      const newEmployeeId = "data" in response ? response.data.user?.id : undefined;
      if (applicantId && newEmployeeId) {
        const { error: linkError } = await linkHiredEmployee(
          applicantId,
          newEmployeeId,
        );
        if (linkError) {
          console.error("Error linking hired employee to applicant:", linkError);
        }
      }

      // Employee lists, managers and the hired applicant are all cached.
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["hr"] });
      setSuccess("تم اضافة الموظف بنجاح");
      reset();
      navigate(applicantId ? `/hr/applicants/${applicantId}` : "/hr/employees");
    } catch (error) {
      console.error("Unexpected error creating employee:", error);
      alert("حدث خطأ غير متوقع أثناء إنشاء الموظف.");
    } finally {
      setLoading(false);
    }
  };

  const salaryTypeOptions = [
    { value: "fixed", label: "ثابت" },
    { value: "percentage", label: "نسبة مئوية" },
  ];

  const bloodTypeOptions = [
    { value: "A+", label: "A+" },
    { value: "A-", label: "A-" },
    { value: "B+", label: "B+" },
    { value: "B-", label: "B-" },
    { value: "AB+", label: "AB+" },
    { value: "AB-", label: "AB-" },
    { value: "O+", label: "O+" },
    { value: "O-", label: "O-" },
  ];

  const genderOptions = [
    { value: "Male", label: "ذكر" },
    { value: "Female", label: "انثي" },
  ];

  const [currentStep, setCurrentStep] = useState(0);

  const selectedRoleId = watch("roleId");
  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  // Use useWatch for real-time reactivity on firstName and lastName
  const personalPhotoUrl = useWatch({ control, name: "personalPhotoUrl" });
  const resumeUrl = useWatch({ control, name: "resumeUrl" });
  const idProofUrl = useWatch({ control, name: "idProofUrl" });

  // Compute the full name in real-time
  const fileName = `${selectedRole?.code}-${selectedRole?.number}`;

  const stepFields: string[][] = [
    // Step 0 - Account
    ["email", "password", "roleId", "status", "employeeType"],
    // Step 1 - Personal
    [
      "firstName",
      "lastName",
      "dob",
      "placeOfBirth",
      "gender",
      "bloodType",
      "nationality",
      "personalPhotoUrl",
    ],
    // Step 2 - Contact
    [
      "personalEmail",
      "phone",
      "alternatePhone",
      "address",
      "emergencyContact",
      "emergencyContactPhone",
      "emergencyContactRelation",
    ],
    // Step 3 - Job
    [
      "dateOfJoining",
      "managerId",
      "departmentId",
      "salaryType",
      "baseSalary",
      "bankName",
      "bankAccountNumber",
    ],
    // Step 4 - Compensation & Documents
    [
      "highestQualification",
      "university",
      "graduationYear",
      "gpa",
      "certifications",
      "resumeUrl",
      "idProofUrl",
    ],
    // Step 5 - Experience & Review
    ["previousCompanyName", "previousJobTitle", "yearsOfExperience"],
  ];

  const totalSteps = stepFields.length;

  const handleNext = async () => {
    try {
      const fields = stepFields[currentStep] || [];
      const valid = await trigger(fields as (keyof UserFormValues)[]);
      if (valid) {
        setCurrentStep((s) => Math.min(s + 1, totalSteps - 1));
        return;
      }

      // If not valid, log errors and focus the first invalid field in this step.
      // eslint-disable-next-line no-console
      console.warn("Step validation failed", { step: currentStep, errors });

      for (const f of fields) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (errors && (errors as any)[f]) {
          try {
            // Try to focus the field using RHF's setFocus
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setFocus(f as any);
          } catch (e) {
            // Fallback: try to scroll to DOM element
            const el = document.getElementById(f);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (el && typeof (el as any).scrollIntoView === "function") {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }
          break;
        }
      }
    } catch (err) {
      // Prevent unexpected errors from bubbling to a debugger; log and stay on the same step.
      // eslint-disable-next-line no-console
      console.error("Error validating step fields:", err);
    }
  };

  // When form submit fails validation, jump to the step that contains the first invalid field
  const handleSubmitErrors = (errs: Record<string, unknown>) => {
    // Log the full error object for debugging
    // eslint-disable-next-line no-console
    console.warn("Form submit errors:", errs);

    const errorKeys = Object.keys(errs || {});
    if (errorKeys.length === 0) return;

    const firstKey = errorKeys[0];
    // find the step index that contains this field
    const stepIndex = stepFields.findIndex((step) => step.includes(firstKey));
    if (stepIndex >= 0) {
      setCurrentStep(stepIndex);
      try {
        // focus the field so the user sees the error
        setFocus(firstKey as keyof UserFormValues);
      } catch (e) {
        // ignore focus errors
      }
    }
  };

  const handleBack = () => {
    try {
      setCurrentStep((s) => Math.max(s - 1, 0));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Error navigating back:", err);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-sm">
      <h1 className="text-2xl font-semibold mb-4">اضافة موظف جديد</h1>

      {success && (
        <div className="mb-4 p-3 rounded text-sm bg-success/10 text-success">
          {success}
        </div>
      )}

      <form
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
        onSubmit={handleSubmit(onSubmit, handleSubmitErrors)}
        onKeyDown={(e) => {
          // Prevent Enter from submitting the whole form while navigating steps.
          if (e.key === "Enter" && currentStep < totalSteps - 1) {
            e.preventDefault();
            try {
              // attempt to advance to next step on Enter
              void handleNext();
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error("Error handling Enter key navigation:", err);
            }
          }
        }}
        noValidate
      >
        {currentStep === 0 && (
          <>
            <TextField
              id="email"
              label="البريد الالكتروني"
              type="email"
              register={register("email")}
              error={errors.email}
            />

            <PasswordField
              id="password"
              label="كلمة المرور"
              register={register("password")}
              error={errors.password}
            />

            <SelectField
              id="roleId"
              label="الدور"
              options={roles
                .filter(
                  (role) =>
                    !["client", "contractor", "supplier"].includes(
                      (role.name || "").toLowerCase(),
                    ),
                )
                .map((role) => ({
                  value: role.id,
                  label: role.name,
                }))}
              register={register("roleId")}
              error={errors.roleId}
            />

            <SelectField
              id="employeeType"
              label="نوع الموظف"
              options={EMPLOYEE_TYPE.map((type) => ({
                value: type.value,
                label: type.label,
              }))}
              register={register("employeeType")}
              error={errors.employeeType}
            />
          </>
        )}

        {currentStep === 1 && (
          <>
            <TextField
              id="firstName"
              label="الاسم الاول"
              register={register("firstName")}
              error={errors.firstName}
            />

            <TextField
              id="lastName"
              label="اسم العائلة"
              register={register("lastName")}
              error={errors.lastName}
            />

            <DateField
              id="dateOfBirth"
              label="تاريخ الميلاد"
              register={register("dob")}
              error={errors.dob}
            />

            <TextField
              id="placeOfBirth"
              label="مكان الميلاد (اختياري)"
              register={register("placeOfBirth")}
              error={errors.placeOfBirth}
            />

            <SelectField
              id="gender"
              label="الجنس"
              options={genderOptions}
              register={register("gender")}
              error={errors.gender}
            />

            <SelectField
              id="bloodType"
              label="فصيلة الدم (اختياري)"
              options={bloodTypeOptions}
              register={register("bloodType")}
              error={errors.bloodType}
            />

            <TextField
              id="nationality"
              label="الجنسية (اختياري)"
              register={register("nationality")}
              error={errors.nationality}
            />

            <ImageUploadField
              id="personalPhotoUrl"
              label="صورة شخصية"
              value={personalPhotoUrl}
              onChange={(url) => setValue("personalPhotoUrl", url)}
              bucket="employees"
              folder={fileName}
              maxSizeMB={5}
              disabled={!fileName}
            />
          </>
        )}

        {currentStep === 2 && (
          <>
            <TextField
              id="personalEmail"
              label="البريد الإلكتروني الشخصي (اختياري)"
              type="email"
              register={register("personalEmail")}
              error={errors.personalEmail}
            />

            <TextField
              id="phone"
              label="الهاتف"
              register={register("phone")}
              error={errors.phone}
            />

            <TextField
              id="alternatePhone"
              label="هاتف بديل (اختياري)"
              register={register("alternatePhone")}
              error={errors.alternatePhone}
            />

            <TextField
              id="address"
              label="العنوان (اختياري)"
              register={register("address")}
              error={errors.address}
            />

            <TextField
              id="emergencyContact"
              label="اسم جهة الطوارئ (اختياري)"
              register={register("emergencyContact")}
              error={errors.emergencyContact}
            />

            <TextField
              id="emergencyContactPhone"
              label="هاتف جهة الطوارئ (اختياري)"
              register={register("emergencyContactPhone")}
              error={errors.emergencyContactPhone}
            />

            <TextField
              id="emergencyContactRelation"
              label="صلة جهة الطوارئ (اختياري)"
              register={register("emergencyContactRelation")}
              error={errors.emergencyContactRelation}
            />
          </>
        )}

        {currentStep === 3 && (
          <>
            <DateField
              id="dateOfJoining"
              label="تاريخ الانضمام (اختياري)"
              register={register("dateOfJoining")}
              error={errors.dateOfJoining}
            />

            {/*
              Always include a "لايوجد" placeholder option even if managers exist.
              Use an empty string as the value for the placeholder so it doesn't match any real id.
            */}
            <SelectField
              id="managerId"
              label="معرف المدير (اختياري)"
              options={[
                { value: "", label: "لايوجد" },
                ...managers.map((manager) => ({
                  value: manager.id,
                  label: `${manager.first_name} ${manager.last_name}`,
                })),
              ]}
              register={register("managerId")}
              error={errors.managerId}
            />

            {/* Department — permission ladder layer 4. Single-select by
                design: one department per person (phase1-schema.sql).
                Shown for every role; required for engineers (see userSchema). */}
            <SelectField
              id="departmentId"
              label={
                selectedRoleId === ENGINEERING_ROLE_ID
                  ? "القسم"
                  : "القسم (اختياري)"
              }
              options={[
                { value: "", label: departmentsLoading ? "..." : "بدون قسم" },
                ...departments.map((department) => ({
                  value: department.id,
                  label: department.name_ar || department.name,
                })),
              ]}
              register={register("departmentId")}
              error={errors.departmentId}
            />

            <SelectField
              id="salaryType"
              label="نوع الراتب"
              options={salaryTypeOptions}
              register={register("salaryType")}
              error={errors.salaryType}
            />

            <NumberField
              id="baseSalary"
              label="الراتب الاساسي (اختياري)"
              step={100}
              register={register("baseSalary", { valueAsNumber: true })}
              error={errors.baseSalary}
            />

            <TextField
              id="bankName"
              label="اسم البنك (اختياري)"
              register={register("bankName")}
              error={errors.bankName}
            />

            <TextField
              id="bankAccountNumber"
              label="رقم الحساب البنكي (اختياري)"
              register={register("bankAccountNumber")}
              error={errors.bankAccountNumber}
            />
          </>
        )}

        {currentStep === 4 && (
          <>
            <TextField
              id="highestQualification"
              label="أعلى مؤهل (اختياري)"
              register={register("highestQualification")}
              error={errors.highestQualification}
            />

            <TextField
              id="university"
              label="الجامعة (اختياري)"
              register={register("university")}
              error={errors.university}
            />

            <NumberField
              id="graduationYear"
              label="سنة التخرج (اختياري)"
              step={1}
              register={register("graduationYear", { valueAsNumber: true })}
              error={errors.graduationYear}
            />

            <NumberField
              id="gpa"
              label="المعدل (اختياري)"
              step={0.1}
              register={register("gpa", { valueAsNumber: true })}
              error={errors.gpa}
            />

            <ImageUploadField
              id="resumeUrl"
              label="رفع السيرة الذاتية"
              value={resumeUrl}
              onChange={(url) => setValue("resumeUrl", url)}
              bucket="employees"
              folder={fileName}
              maxSizeMB={10}
              accept=".pdf,.doc,.docx"
              disabled={!fileName}
            />

            <ImageUploadField
              id="idProofUrl"
              label="رفع إثبات الهوية"
              value={idProofUrl}
              onChange={(url) => setValue("idProofUrl", url)}
              bucket="employees"
              folder={fileName}
              maxSizeMB={5}
              accept=".pdf,.jpg,.jpeg,.png"
              disabled={!fileName}
            />
          </>
        )}

        {currentStep === 5 && (
          <>
            <TextField
              id="previousCompanyName"
              label="اسم الشركة السابقة (اختياري)"
              register={register("previousCompanyName")}
              error={errors.previousCompanyName}
            />

            <TextField
              id="previousJobTitle"
              label="المسمى الوظيفي السابق (اختياري)"
              register={register("previousJobTitle")}
              error={errors.previousJobTitle}
            />

            <NumberField
              id="yearsOfExperience"
              label="سنوات الخبرة (اختياري)"
              step={1}
              register={register("yearsOfExperience", { valueAsNumber: true })}
              error={errors.yearsOfExperience}
            />
          </>
        )}

        {!fileName && (currentStep === 1 || currentStep === 4) && (
          <div className="md:col-span-2 p-3 rounded text-sm bg-yellow-50 text-yellow-800 border border-yellow-200">
            يرجى إدخال الاسم الأول واسم العائلة لتفعيل رفع الملفات
          </div>
        )}

        <div className="md:col-span-2 flex justify-between gap-2 mt-3">
          <div>
            {currentStep > 0 && (
              <Button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  handleBack();
                }}
              >
                العودة
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            {currentStep < totalSteps - 1 && (
              <Button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  handleNext();
                }}
              >
                التالي
              </Button>
            )}

            {currentStep === totalSteps - 1 && (
              <Button loading={loading} type="submit">
                اضافة موظف
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

export default NewEmployeeForm;
