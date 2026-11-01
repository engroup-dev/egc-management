import { Routes, Route } from "react-router-dom";
import RequirePermission from "../auth/RequirePermission";
import SettingsLayout from "../sidebar/SettingsLayout";
import SettingsPage from "../../pages/settings/SettingsPage";
import SettingsRolesPage from "../../pages/settings/roles/SettingsRolesPage";
import NewRolePage from "../../pages/settings/roles/NewRolePage";
import RolesDetailsPage from "../../pages/settings/roles/RolesDetailsPage";
import SettingsExpensesPage from "../../pages/settings/expenses/SettingsExpensesPage";
import SettingsSpecializationsPage from "../../pages/settings/specializations/SettingsSpecializationsPage";
import SpecializationDetailPage from "../../pages/settings/specializations/SpecializationDetailPage";
import MapsPage from "../../pages/settings/maps/MapsPage";
import ExpenseDetailsPage from "../../pages/settings/expenses/ExpenseDetailsPage";
import BanksPage from "../../pages/settings/banks/BanksPage";
import UnitsPage from "../../pages/settings/units/UnitsPage";
import UserSessionsPage from "../../pages/settings/sessions/UserSessionsPage";
import LogsPage from "../../pages/settings/logs/LogsPage";
import ActivityLogPage from "../../pages/settings/activityLog/ActivityLogPage";
import NotificationAdminPage from "../../pages/settings/notifications/NotificationAdminPage";
import NotificationLogPage from "../../pages/settings/notifications/NotificationLogPage";
import { LOG_PERMISSIONS } from "../../config/logs";
import UserPasswordResetPage from "../../pages/settings/passwordReset/UserPasswordResetPage";
import WebsitePage from "../../pages/settings/website/WebsitePage";
import WebsiteCategoriesPage from "../../pages/settings/website/WebsiteCategoriesPage";
import WebsiteHeroSlidesPage from "../../pages/settings/website/WebsiteHeroSlidesPage";
import WebsiteProjectsPage from "../../pages/settings/website/WebsiteProjectsPage";
import WebsiteNewProjectPage from "../../pages/settings/website/WebsiteNewProjectPage";
import WebsiteProjectDetailsPage from "../../pages/settings/website/WebsiteProjectDetailsPage";
import WebsiteEditProjectPage from "../../pages/settings/website/WebsiteEditProjectPage";
import WebsiteTeamPage from "../../pages/settings/website/WebsiteTeamPage";
// Phase 3 — new permission administration screens. Additive only: the
// existing /settings/roles pages above are untouched and still behave
// exactly as they did before.
import SettingsDepartmentsPage from "../../pages/settings/departments/SettingsDepartmentsPage";
import DepartmentDetailPage from "../../pages/settings/departments/DepartmentDetailPage";
import RolePermissionsListPage from "../../pages/settings/permissions/RolePermissionsListPage";
import RolePermissionsDetailPage from "../../pages/settings/permissions/RolePermissionsDetailPage";
import UserPermissionsPage from "../../pages/settings/permissions/UserPermissionsPage";
import EvaluationSettingsPage from "../../pages/settings/evaluation/EvaluationSettingsPage";
import QuestionBankPage from "../../pages/settings/questionBank/QuestionBankPage";
import ScoringSettingsPage from "../../pages/settings/scoring/ScoringSettingsPage";
import ProjectRolesPage from "../../pages/settings/projectRoles/ProjectRolesPage";
import ProjectRoleDetailPage from "../../pages/settings/projectRoles/ProjectRoleDetailPage";

export default function SettingsRoutes() {
  return (
    <Routes>
      <Route element={<SettingsLayout />}>
        <Route
          element={
            <RequirePermission
              permission={[
                "manage_reference_data",
                "manage_specialities",
                "manage_roles",
                "manage_project_roles",
                "manage_departments",
                "manage_permissions_company",
              ]}
            />
          }
        >
          <Route index element={<SettingsPage />} />
        </Route>

        <Route element={<RequirePermission permission="manage_roles" />}>
          <Route path="roles" element={<SettingsRolesPage />} />
          <Route path="roles/new" element={<NewRolePage />} />
          <Route path="roles/:id" element={<RolesDetailsPage />} />
        </Route>

        {/* Project team positions (public.project_roles) — not the
            permission roles above, which is why it has its own permission. */}
        <Route element={<RequirePermission permission="manage_project_roles" />}>
          <Route path="project-roles" element={<ProjectRolesPage />} />
          <Route path="project-roles/:roleId" element={<ProjectRoleDetailPage />} />
        </Route>

        <Route
          element={<RequirePermission permission="manage_reference_data" />}
        >
          <Route path="expenses" element={<SettingsExpensesPage />} />
          <Route path="expenses/:id" element={<ExpenseDetailsPage />} />
          <Route path="maps" element={<MapsPage />} />
          <Route path="banks" element={<BanksPage />} />
          <Route path="units" element={<UnitsPage />} />
        </Route>

        <Route element={<RequirePermission permission="manage_specialities" />}>
          <Route
            path="specializations"
            element={<SettingsSpecializationsPage />}
          />
          <Route
            path="specializations/:id"
            element={<SpecializationDetailPage />}
          />
        </Route>

        <Route element={<RequirePermission permission="view_user_sessions" />}>
          <Route path="sessions" element={<UserSessionsPage />} />
        </Route>
        <Route element={<RequirePermission permission="view_audit_logs" />}>
          <Route path="logs" element={<LogsPage />} />
        </Route>
        <Route element={<RequirePermission permission={[...LOG_PERMISSIONS]} />}>
          <Route path="activity-log" element={<ActivityLogPage />} />
        </Route>
        <Route element={<RequirePermission permission="manage_notifications" />}>
          <Route path="notifications" element={<NotificationAdminPage />} />
        </Route>
        <Route element={<RequirePermission permission="view_notification_log" />}>
          <Route path="notifications/log" element={<NotificationLogPage />} />
        </Route>
        <Route element={<RequirePermission permission="reset_user_password" />}>
          <Route path="password-reset" element={<UserPasswordResetPage />} />
        </Route>
        <Route element={<RequirePermission permission="manage_website" />}>
          <Route path="website" element={<WebsitePage />} />
          <Route
            path="website/categories"
            element={<WebsiteCategoriesPage />}
          />
          <Route
            path="website/hero-slides"
            element={<WebsiteHeroSlidesPage />}
          />
          <Route path="website/projects" element={<WebsiteProjectsPage />} />
          <Route
            path="website/projects/new"
            element={<WebsiteNewProjectPage />}
          />
          <Route
            path="website/projects/:id"
            element={<WebsiteProjectDetailsPage />}
          />
          <Route
            path="website/projects/:id/edit"
            element={<WebsiteEditProjectPage />}
          />
          <Route path="website/team" element={<WebsiteTeamPage />} />
        </Route>

        {/* Phase 3 — permission administration */}
        <Route element={<RequirePermission permission="manage_departments" />}>
          <Route
            path="permissions/departments"
            element={<SettingsDepartmentsPage />}
          />
          <Route
            path="permissions/departments/:id"
            element={<DepartmentDetailPage />}
          />
        </Route>
        <Route
          element={
            <RequirePermission permission="manage_permissions_company" />
          }
        >
          <Route
            path="permissions/roles"
            element={<RolePermissionsListPage />}
          />
          <Route
            path="permissions/roles/:id"
            element={<RolePermissionsDetailPage />}
          />
          <Route
            path="permissions/users"
            element={<UserPermissionsPage />}
          />
          <Route
            path="permissions/users/:id"
            element={<UserPermissionsPage />}
          />
        </Route>

        <Route
          element={<RequirePermission permission="manage_evaluation_settings" />}
        >
          <Route
            path="evaluation-settings"
            element={<EvaluationSettingsPage />}
          />
          <Route path="scoring-settings" element={<ScoringSettingsPage />} />
        </Route>

        <Route
          element={<RequirePermission permission="manage_question_bank" />}
        >
          <Route path="question-bank" element={<QuestionBankPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
