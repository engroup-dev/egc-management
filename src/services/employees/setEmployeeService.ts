import { adminCreateUser } from "../../lib/adminApi";
import { supabase } from "../../lib/supabaseClient";
import { Employees } from "../../types/global.type";
import { UserFormValues } from "../../types/schema/users.schema";

// =====================================================================
// Creating a company employee under the Phases 1-7 model
// =====================================================================
// Three things this flow now guarantees, and one it depends on the
// database for.
//
// 1. DEPARTMENT. employees.department_id is set from the form. One
//    department per person (phase1-schema.sql, guide 4.1). It is
//    optional: an employee with no department is valid and simply gets
//    nothing from layer 4.
//
// 2. ROLE VIA user_roles. This is the single source of truth
//    (phase2-resolver.sql DECISION 7). The flow already wrote it; what
//    is new is that the write is idempotent and that users.role_id is
//    reconciled against it afterwards rather than assumed to agree.
//
//    The divergence this prevents is not hypothetical. handle_new_user()
//    writes users.role_id ONLY — it has never inserted user_roles — so
//    every account whose creation path forgot the explicit insert ended
//    up with a role_id and no user_roles row. That is the whole of Phase
//    0's 38-account gap. This path always writes both.
//
// 3. party_type = 'company'. Passed explicitly in user_metadata rather
//    than left to a default. This flow creates staff and only staff;
//    contractors, vendors and clients have their own services.
//
// WHAT THIS FILE CANNOT DO ALONE. public.users is written by the
// handle_new_user() trigger on auth.users, not from here — this code
// never sees that row until after it exists. So the metadata below is a
// request, and the trigger has to honour it. See
// phase8-create-employee.sql: as the trigger stands today it does not
// read partyType at all, and since Phase 1 made users.party_type NOT
// NULL with no default, the insert cannot succeed. That SQL is the other
// half of this change.
//
// NO PERMISSIONS ARE GRANTED HERE. Deliberately. A new employee gets a
// role and a department and nothing else; whatever those two already
// grant is exactly what they can do. Individual overrides are a separate
// act, through the Phase 3 screens. Guide 4.1: "creation and capability
// are two separate acts".
// =====================================================================

const ENGINEER_ROLE_ID = "212424d8-219a-4899-a24b-5d5bf05546e8";

// DEFAULT_ROLE_ID used to be 803c44ac-0af1-4586-81a2-67e1bc7eb7ef, which
// is the CLIENT role — its own comment said "choose your real default
// role" and nobody ever did. It was passed to auth metadata, so the
// trigger wrote users.role_id = Client, while the user_roles insert
// below fell back to Engineer. Two fallbacks in one function, disagreeing
// with each other: precisely the divergence pattern this phase exists to
// remove. And once handle_new_user() derives party_type from the role
// (phase8-create-employee.sql), a Client role would have made a new
// employee an external party.
//
// It never fired because the form always sends a roleId. One constant
// now, so it cannot.
const DEFAULT_ROLE_ID = ENGINEER_ROLE_ID;

export const createEmployee = async (data: UserFormValues) => {
  const normalizeEmptyToNull = (v?: string | null) => {
    if (v === undefined || v === null) return null;
    const t = String(v).trim();
    return t === "" ? null : t;
  };

  const uploaded_by = await supabase.auth
    .getUser()
    .then(({ data }) => data.user?.id ?? null);

  // Created by the admin-users Edge Function, which checks the
  // create_employee permission and rejects a contractor/vendor/client role.
  const { data: userData, error: userError } = await adminCreateUser(
    "employee",
    {
      email: data.email,
      password: data.password,
      userMetadata: {
        employeeId: data.employeeId,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        nationality: data.nationality,
        dob: data.dob,
        employeeType: data.employeeType,
        roleId: data.roleId ?? DEFAULT_ROLE_ID,
        // Read by handle_new_user() to set users.party_type. Hardcoded,
        // not taken from the form: this service creates staff and only
        // staff. A contractor or vendor must go through its own service.
        partyType: "company",
      },
    },
  );

  if (userError) {
    console.error("Error creating auth user:", userError);
    return {
      success: false,
      error: userError,
      message: "فشل في إنشاء المستخدم",
    };
  }

  const userId = userData.user?.id ?? null;
  if (!userId) {
    console.error("No user id returned from auth.createUser", userData);
    return {
      success: false,
      error: new Error("No user id created"),
      message: "فشل في إنشاء المستخدم - معرف المستخدم غير متاح",
    };
  }

  // certification will be inserted after the employee profile is created

  const { data: roleData, error: userRoleError } = await supabase
    .from("roles")
    .select("*")
    .eq("id", data.roleId ?? ENGINEER_ROLE_ID)
    .single();

  if (userRoleError) {
    console.error("Error fetching role data:", userRoleError);
    return {
      success: false,
      error: userRoleError,
      message: "فشل في جلب بيانات الدور",
    };
  }

  const normalizeUuidOrDefault = (
    v: string | undefined | null,
    def: string,
  ) => {
    if (v === undefined || v === null) return def;
    const t = String(v).trim();
    return t === "" ? def : t;
  };

  const employeePayload: Employees = {
    id: userId,
    employee_id: `${roleData.code}-${roleData.number}`,
    first_name: data.firstName ?? "",
    last_name: data.lastName ?? null,
    email: data.email ?? "",
    phone_number: data.phone ?? "",
    base_salary: data.baseSalary ?? 0,
    // Layer 4 of the ladder. Null is a real answer, not a missing one.
    department_id: normalizeEmptyToNull(data.departmentId),
    dob: normalizeEmptyToNull(data.dob),
    place_of_birth: data.placeOfBirth ?? null,
    blood_type: data.bloodType ?? null,
    nationality: data.nationality ?? null,
    gender: data.gender ?? null,
    personal_email: data.personalEmail ?? null,
    alternate_phone: data.alternatePhone ?? null,
    address: data.address ?? null,
    emergency_contact: data.emergencyContact ?? null,
    emergency_contact_phone: data.emergencyContactPhone ?? null,
    emergency_contact_relation: data.emergencyContactRelation ?? null,
    employee_type: data.employeeType ?? null,
    date_of_joining: normalizeEmptyToNull(data.dateOfJoining),
    manager_id: normalizeEmptyToNull(data.managerId),
    status: data.status ?? null,
    salary_type: data.salaryType ?? null,
    bank_name: data.bankName ?? null,
    bank_account_number: data.bankAccountNumber ?? null,
    highest_qualification: data.highestQualification ?? null,
    university: data.university ?? null,
    graduation_year: data.graduationYear ?? null,
    gpa: data.gpa ?? null,
    resume_url: data.resumeUrl ?? null,
    id_proof_url: data.idProofUrl ?? null,
    personal_photo_url: data.personalPhotoUrl ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error: profileError } = await supabase
    .from("employees")
    .insert(employeePayload);

  if (profileError) {
    console.error("Error creating employee profile:", profileError);
    return {
      success: false,
      error: profileError,
      message: "فشل في إنشاء ملف الموظف",
    };
  }

  // certfication (moved after creating employee to satisfy FK constraint)
  const { error: certError } = await supabase
    .from("employee_certifications")
    .insert({
      employee_id: userId,
      certification: [
        data.university,
        data.highestQualification,
        data.graduationYear,
      ]
        .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
        .join(" - "),
    });

  if (certError) {
    console.error("Error creating employee certification:", certError);
    return {
      success: false,
      error: certError,
      message: "فشل في إنشاء شهادة الموظف",
    };
  }

  // ── role: user_roles is the source of truth ────────────────────────
  const roleToAssign = normalizeUuidOrDefault(data.roleId, ENGINEER_ROLE_ID);

  // upsert, not insert: if handle_new_user() is ever taught to write
  // user_roles itself (phase8-create-employee.sql proposes exactly that),
  // this must not start failing on a duplicate. Ignoring the conflict
  // keeps both halves correct whichever one runs first.
  const { error: roleError } = await supabase.from("user_roles").upsert(
    { role_id: roleToAssign, user_id: userId },
    {
      onConflict: "user_id,role_id",
      ignoreDuplicates: true,
    },
  );

  if (roleError) {
    console.error(roleError);
    return {
      success: false,
      error: roleError,
      message: "فشل في إنشاء منصب المستخدم",
    };
  }

  // ── keep users.role_id in step ─────────────────────────────────────
  // The trigger already set it from user_metadata.roleId, so this is
  // normally a no-op. It is here because "normally" is what produced the
  // 38-account divergence: the two are written by different code at
  // different times, and only one of them was ever checked. Phase 8
  // retires this column; until then the two must agree, and user_roles
  // above is the one that wins.
  const { error: legacyRoleError } = await supabase
    .from("users")
    .update({ role_id: roleToAssign })
    .eq("id", userId);

  if (legacyRoleError) {
    console.error("Error reconciling users.role_id:", legacyRoleError);
    return {
      success: false,
      error: legacyRoleError,
      message: "فشل في مزامنة دور المستخدم",
    };
  }

  //update role number
  const { error: updateRoleError } = await supabase
    .from("roles")
    .update({ number: roleData.number + 1 })
    .eq("id", roleToAssign);

  if (updateRoleError) {
    console.error("Error updating role number:", updateRoleError);
    return {
      success: false,
      error: updateRoleError,
      message: "فشل في تحديث رقم الدور",
    };
  }

  // insert employee files
  const { error: filesError } = await supabase
    .from("employee_documents")
    .insert([
      {
        employee_id: userId,
        doc_type: "CV",
        url: data.resumeUrl ?? "",
        uploaded_by: uploaded_by,
      },
      {
        employee_id: userId,
        doc_type: "id_proof",
        url: data.idProofUrl ?? "",
        uploaded_by: uploaded_by,
      },
    ]);
  if (filesError) {
    console.error("Error inserting employee documents:", filesError);
    return {
      success: false,
      error: filesError,
      message: "فشل في إضافة مستندات الموظف",
    };
  }

  return { success: true, data: userData, message: "تم إنشاء المستخدم بنجاح" };
};
