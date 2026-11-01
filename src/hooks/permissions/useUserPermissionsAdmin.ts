import { useQuery } from "@tanstack/react-query";
import { permissionsDb } from "../../lib/permissionsDb";
import { supabase } from "../../lib/supabaseClient";
import type { ExistingGrant } from "../../components/permissions/permissionModel";

export const PERMISSION_USERS_ADMIN_KEY = ["permission-users-admin"];

export interface PermissionUserSummary {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  role_id: string | null;
  role_name: string | null;
  department_id: string | null;
  department_name: string | null;
  has_employee_profile: boolean;
  allow_override_count: number;
  deny_override_count: number;
  total_override_count: number;
  overrides: ExistingGrant[];
}

/**
 * Fetches all internal company users (`party_type = 'company'`) enriched with:
 * - their primary job role (`user_roles -> roles`)
 * - their department (`employees -> departments`)
 * - their explicit per-person permission overrides (`user_permission_grants`)
 */
export function usePermissionUsers() {
  return useQuery<PermissionUserSummary[]>({
    queryKey: PERMISSION_USERS_ADMIN_KEY,
    queryFn: async () => {
      const [
        usersRes,
        userRolesRes,
        rolesRes,
        employeesRes,
        departmentsRes,
        grantsRes,
      ] = await Promise.all([
        supabase
          .from("users")
          .select("id, first_name, last_name, email, phone, status, party_type")
          .eq("party_type", "company"),
        supabase.from("user_roles").select("user_id, role_id"),
        supabase.from("roles").select("id, name"),
        permissionsDb.from("employees").select("id, department_id"),
        permissionsDb.from("departments").select("id, name, name_ar"),
        permissionsDb
          .from("user_permission_grants")
          .select("user_id, permission_id, allowed, scope, note"),
      ]);

      if (usersRes.error) throw usersRes.error;
      if (userRolesRes.error) throw userRolesRes.error;
      if (rolesRes.error) throw rolesRes.error;
      if (employeesRes.error) throw employeesRes.error;
      if (departmentsRes.error) throw departmentsRes.error;
      if (grantsRes.error) throw grantsRes.error;

      const roleNameById = new Map(
        (rolesRes.data ?? []).map((r) => [r.id, r.name]),
      );

      const roleIdByUserId = new Map<string, string>();
      for (const ur of userRolesRes.data ?? []) {
        if (!roleIdByUserId.has(ur.user_id)) {
          roleIdByUserId.set(ur.user_id, ur.role_id);
        }
      }

      const departmentNameById = new Map(
        (departmentsRes.data ?? []).map((d) => [d.id, d.name_ar || d.name]),
      );

      const employeeByUserId = new Map(
        (employeesRes.data ?? []).map((e) => [e.id, e]),
      );

      const grantsByUserId = new Map<string, ExistingGrant[]>();
      for (const g of grantsRes.data ?? []) {
        const list = grantsByUserId.get(g.user_id) ?? [];
        list.push({
          permission_id: g.permission_id,
          allowed: g.allowed,
          scope: g.scope,
          note: g.note,
        });
        grantsByUserId.set(g.user_id, list);
      }

      return (usersRes.data ?? [])
        .map((u) => {
          const roleId = roleIdByUserId.get(u.id) ?? null;
          const emp = employeeByUserId.get(u.id);
          const deptId = emp?.department_id ?? null;
          const overrides = grantsByUserId.get(u.id) ?? [];
          const allowCount = overrides.filter((o) => o.allowed).length;
          const denyCount = overrides.length - allowCount;

          const fullName =
            `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() ||
            (u.email?.split("@")[0] ?? "مستخدم");

          return {
            id: u.id,
            full_name: fullName,
            email: u.email ?? null,
            phone: u.phone ?? null,
            status: u.status ?? "active",
            role_id: roleId,
            role_name: roleId ? (roleNameById.get(roleId) ?? null) : null,
            department_id: deptId,
            department_name: deptId
              ? (departmentNameById.get(deptId) ?? null)
              : null,
            has_employee_profile: Boolean(emp),
            allow_override_count: allowCount,
            deny_override_count: denyCount,
            total_override_count: overrides.length,
            overrides,
          };
        })
        .sort((a, b) => {
          // Active users first, then Arabic alphabetical order
          if (a.status === "active" && b.status !== "active") return -1;
          if (a.status !== "active" && b.status === "active") return 1;
          return a.full_name.localeCompare(b.full_name, "ar");
        });
    },
  });
}
