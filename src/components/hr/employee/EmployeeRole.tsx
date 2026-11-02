import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabaseClient";
import { FullEmployee } from "../../../types/extended.type";
import { useCan } from "../../../hooks/permissions/useCan";
import { settingsRolesQueryOptions } from "../../../hooks/settings/useRoles";

interface EmployeeRoleProps {
  employee: FullEmployee;
  onUpdated?: () => void | Promise<void>;
}

const EmployeeRole = ({ employee, onUpdated }: EmployeeRoleProps) => {
  const [selectedRole, setSelectedRole] = useState(employee.user_role?.role_id);
  const [loading, setLoading] = useState(false);

  // PHASE 7B BATCH 2. Was: user?.role === "Admin" || user?.role === "Manager",
  // read off the role string the session happens to be carrying. Now the
  // resolver decides, so the answer survives someone holding two roles, a
  // department baseline, or a per-user override.
  //
  // Like-for-like: manage_users is granted to Admin and Manager, which is
  // exactly who could edit this before.
  const { can: canEdit, loading: checkingPermission } = useCan("manage_users");

  // Roles catalog, shared with the settings roles list.
  const { data: roles = [] } = useQuery(settingsRolesQueryOptions());
  const queryClient = useQueryClient();

  // -----------------------------
  // Update role
  // -----------------------------
  const handleChangeRole = async (roleId: string) => {
    if (!canEdit) return;

    setLoading(true);

    const { error } = await supabase
      .from("users")
      .update({ role_id: roleId })
      .eq("id", employee.id);

    const { error: roleError } = await supabase
      .from("user_roles")
      .update({ role_id: roleId })
      .eq("user_id", employee.id);

    setLoading(false);

    if (error) {
      console.error(error);
      return;
    }
    if (roleError) {
      console.error(roleError);
      return;
    }

    setSelectedRole(roleId);
    // Role detail pages list the users holding each role.
    queryClient.invalidateQueries({ queryKey: ["settings", "role"] });
    await onUpdated?.();
  };

  const currentRole = roles.find((r) => r.id === selectedRole);

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">إدارة دور الموظف</h2>

      {/* Current role display */}
      <div className="text-sm text-gray-600">
        الدور الحالي:{" "}
        <span className="font-semibold text-primary">
          {currentRole?.name || "غير محدد"}
        </span>
      </div>

      {/* Gated on manage_users. While the check is in flight, say nothing
          rather than flashing the refusal and then replacing it. */}
      {checkingPermission ? (
        <p className="text-sm text-gray-400">جاري التحقق من الصلاحية...</p>
      ) : canEdit ? (
        <div className="space-y-2">
          <label className="text-sm text-gray-600">تغيير الدور</label>

          <select
            className="w-full border rounded p-2"
            value={selectedRole}
            disabled={loading}
            onChange={(e) => handleChangeRole(e.target.value)}
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>

          {loading && (
            <p className="text-xs text-gray-500">جاري تحديث الدور...</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-400">لا يمكنك تعديل هذا الحقل</p>
      )}
    </div>
  );
};

export default EmployeeRole;
