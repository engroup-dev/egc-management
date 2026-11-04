import { z } from "zod";
import { optionalNumber } from "../../utils/zodHelpers";
import { emptyToUndefined } from "./helper.schema";

export const ENGINEERING_ROLE_ID = "212424d8-219a-4899-a24b-5d5bf05546e8"; // Engineer

export const userSchema = z
  .object({
    // Authentication Details
    employeeId: z.string().min(1, "رقم الموظف مطلوب"),
    password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),

    // Personal Information
    firstName: z
      .string()
      .trim()
      .min(2, "الاسم الأول يجب أن يكون على الأقل حرفين"),
    lastName: z
      .string()
      .trim()
      .min(2, "اسم العائلة يجب أن يكون على الأقل حرفين"),
    dob: z.string().min(1, "تاريخ الميلاد مطلوب"),
    placeOfBirth: z.string().optional(),
    bloodType: z.preprocess(
      emptyToUndefined,
      z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).optional(),
    ),
    nationality: z.string().optional(),
    gender: z.preprocess(
      emptyToUndefined,
      z.enum(["Male", "Female"]).optional(),
    ),

    // Contact Information
    email: z.string().email("البريد الإلكتروني غير صالح"),
    personalEmail: z.string().optional(),
    phone: z.string().min(10, "رقم الهاتف يجب أن يكون على الأقل 10 أرقام"),
    alternatePhone: z.string().optional(),
    address: z.string().optional(),
    emergencyContact: z.string().optional(),
    emergencyContactPhone: z.string().optional(),
    emergencyContactRelation: z.string().optional(),

    // Job Details
    employeeType: z.enum(["full-time", "part-time", "contractor", "intern"]),
    dateOfJoining: z.string().optional(),
    managerId: z.string().optional(),
    status: z.enum(["active", "inactive", "on leave"]),
    roleId: z.preprocess(emptyToUndefined, z.string().optional()),

    // Phase 1's departments table. ONE department per person — the
    // decision is recorded in phase1-schema.sql and the guide's section
    // 4.1, and it is why this is a single id and not an array.
    //
    // Optional here (we will enforce conditionally). An employee with no
    // department is still a valid employee in general; the column stays
    // nullable for the 22 existing staff with none. But issue #17: an
    // Engineer with no department silently loses layer 4 of the ladder, so
    // it's required for that role specifically.
    departmentId: z.preprocess(emptyToUndefined, z.string().optional()),

    // Compensation & Payroll
    salaryType: z.enum(["fixed", "percentage"]),
    baseSalary: optionalNumber(),

    // Banking
    bankName: z.string().optional(),
    bankAccountNumber: z.string().optional(),

    // Education & Qualifications
    highestQualification: z.string().optional(),
    university: z.string().optional(),
    graduationYear: optionalNumber({
      min: 1900,
      max: new Date().getFullYear(),
    }),
    gpa: optionalNumber({ min: 0, max: 4 }),

    // Work Experience
    previousCompanyName: z.string().optional(),
    previousJobTitle: z.string().optional(),
    yearsOfExperience: optionalNumber({ min: 0 }),

    // Documents
    resumeUrl: z.string().optional(),
    personalPhotoUrl: z.string().optional(),
    idProofUrl: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const isEngineering = data.roleId === ENGINEERING_ROLE_ID;

    // Issue #17: department stays optional in general, but an Engineer
    // with none silently drops layer 4 of the permission ladder — so it's
    // required for that role.
    if (isEngineering && !data.departmentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["departmentId"],
        message: "يجب اختيار القسم للمهندس",
      });
    }
  });

export type UserFormValues = z.infer<typeof userSchema>;
