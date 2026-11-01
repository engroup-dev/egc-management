import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Briefcase, Building2, ExternalLink, Info } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { usePermissionCatalog } from "../../hooks/permissions/usePermissionCatalog";
import { useGrants, useSaveGrants } from "../../hooks/permissions/useGrants";
import { useEmployeeDepartment } from "../../hooks/permissions/useDepartments";
import {
  useEffectivePermissions,
  useInheritedGrants,
} from "../../hooks/permissions/useEffectivePermissions";
import PermissionEditor from "./PermissionEditor";
import { InheritedContext } from "./PermissionRow";
import LoadingPage from "../ui/LoadingPage";

// =====================================================================
// Screen 3 — implementation guide section 4.3.
// =====================================================================
// The employee profile's "الصلاحيات" tab. The old tab of the same name
// (EmployeesPermissions.tsx, reading the dead `permissions` /
// `role_permissions` / `user_permissions` tables) was removed — issue 03.
// This is now the only permissions tab on this page.
// =====================================================================

interface Props {
  /** users.id — same value as employees.id (1:1 FK). */
  employeeId: string;
  employeeName: string;
  roleName: string | null;
}

export default function EmployeeOverridesTab({
  employeeId,
  employeeName,
  roleName,
}: Props) {
  const { user } = useAuth();

  const { data: catalog, isLoading: catalogLoading } = usePermissionCatalog();
  const { data: grants, isLoading: grantsLoading } = useGrants(
    "user",
    employeeId,
  );
  const { data: effective } = useEffectivePermissions(employeeId);
  const { data: inherited } = useInheritedGrants(employeeId);
  // Read here rather than from the page's employee object: department_id
  // was added by Phase 1 and is not in the generated types yet.
  const { data: department } = useEmployeeDepartment(employeeId);
  const saveGrants = useSaveGrants();

  // -------------------------------------------------------------------
  // "What they have today, and where it came from"
  // -------------------------------------------------------------------
  // Two sources, because neither alone covers every permission:
  //
  //   effective_permissions() is authoritative, but returns
  //   'no_project_context' for project-scoped permissions when no
  //   project is supplied (phase2-resolver.sql, DECISION 3). It cannot
  //   answer those here, because this screen is company-wide.
  //
  //   The role/department grant tables can answer project-scoped
  //   permissions, and they are what "before your override" actually
  //   means for this screen.
  //
  // So: use the resolver where it can answer, fall back to the baseline
  // layers where it cannot, and say plainly which is which.
  // -------------------------------------------------------------------
  const inheritedById = useMemo<Record<string, InheritedContext>>(() => {
    if (!catalog) return {};

    const effectiveByName = new Map(
      (effective ?? []).map((row) => [row.permission_name, row]),
    );
    const result: Record<string, InheritedContext> = {};

    for (const permission of catalog) {
      const baseline = inherited?.[permission.id];
      const resolved = effectiveByName.get(permission.name);

      if (!permission.is_project_scoped && resolved) {
        // Resolver can answer definitively.
        if (resolved.source_layer === "user_override") {
          result[permission.id] = {
            label: resolved.allowed ? "مسموح" : "ممنوع",
            sourceLabel: "من استثناء فردي (أدناه)",
            tone: resolved.allowed ? "granted" : "denied",
          };
          continue;
        }
        if (resolved.allowed || resolved.source_layer !== "default_deny") {
          result[permission.id] = {
            label: resolved.allowed ? "مسموح" : "ممنوع",
            sourceLabel: baseline
              ? sourceLabelFor(baseline.layer, baseline.ownerName)
              : layerLabel(resolved.source_layer),
            tone: resolved.allowed ? "granted" : "denied",
          };
          continue;
        }
        result[permission.id] = {
          label: "غير ممنوحة",
          sourceLabel: "لا توجد قاعدة",
          tone: "none",
        };
        continue;
      }

      // Project-scoped: fall back to the baseline layers.
      if (baseline) {
        result[permission.id] = {
          label: baseline.allowed ? "مسموح" : "ممنوع",
          sourceLabel: `${sourceLabelFor(baseline.layer, baseline.ownerName)} · ${
            baseline.scope === "all_projects"
              ? "كل المشاريع"
              : "مشاريع الفريق فقط"
          }`,
          tone: baseline.allowed ? "granted" : "denied",
        };
      } else {
        result[permission.id] = {
          label: "غير ممنوحة",
          sourceLabel: "لا توجد قاعدة من الدور أو القسم",
          tone: "none",
        };
      }
    }

    return result;
  }, [catalog, effective, inherited]);

  if (catalogLoading || grantsLoading) {
    return <LoadingPage label="جاري تحميل الصلاحيات..." />;
  }

  return (
    <div className="space-y-4">
      {/* Read-only summary line — guide section 4.3 step 2 */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-4 text-sm">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5 text-gray-700">
            <Briefcase size={15} className="text-gray-400" />
            الدور: <strong>{roleName || "غير محدد"}</strong>
          </span>
          <span className="flex items-center gap-1.5 text-gray-700">
            <Building2 size={15} className="text-gray-400" />
            القسم: <strong>{department?.name || "غير محدد"}</strong>
          </span>
        </div>
        <Link
          to={`/settings/permissions/users/${employeeId}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <ExternalLink size={13} />
          فتح في شاشة صلاحيات المستخدمين (حسب الموديولات)
        </Link>
      </div>

      <div className="flex items-start gap-2 text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        <Info size={13} className="mt-0.5 shrink-0 text-gray-400" />
        <span>
          الاستثناء الفردي يسري في كل المشاريع، ويتفوق على قاعدتي الدور والقسم،
          لكن يمكن تجاوزه على مستوى مشروع بعينه لاحقاً. ما يظهر بجانب كل صلاحية
          هو وضعها الحالي قبل الاستثناء — للعلم فقط، ولا يؤثر على أي شاشة أخرى
          في النظام حالياً.
        </span>
      </div>

      <PermissionEditor
        catalog={catalog ?? []}
        savedGrants={grants ?? []}
        subjectPhrase={employeeName}
        saving={saveGrants.isPending}
        inheritedById={inheritedById}
        showNotes
        onSave={async (diff) => {
          await saveGrants.mutateAsync({
            layer: "user",
            ownerId: employeeId,
            diff,
            grantedBy: user?.id ?? null,
          });
        }}
      />
    </div>
  );
}

function sourceLabelFor(
  layer: "role_baseline" | "department_baseline",
  ownerName: string,
): string {
  return layer === "role_baseline"
    ? `من دور ${ownerName}`
    : `من قسم ${ownerName}`;
}

function layerLabel(layer: string): string {
  switch (layer) {
    case "role_baseline":
      return "من الدور";
    case "department_baseline":
      return "من القسم";
    case "user_override":
      return "من استثناء فردي";
    case "ineligible":
      return "الحساب غير مؤهل";
    default:
      return "لا توجد قاعدة";
  }
}
