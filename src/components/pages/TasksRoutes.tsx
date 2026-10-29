import { Routes, Route } from "react-router-dom";
import TasksLayout from "../sidebar/TasksLayout";
import TasksPage from "../../pages/tasks/TasksPage";
import TaskBoardPage from "../../pages/tasks/TaskBoardPage";
import DepartmentPage from "../../pages/tasks/DepartmentPage";
import MyWorkPage from "../../pages/tasks/MyWorkPage";
import AssigneeViewPage from "../../pages/tasks/AssigneeViewPage";
import TaskTypeViewPage from "../../pages/tasks/TaskTypeViewPage";
import ProjectViewPage from "../../pages/tasks/ProjectViewPage";
import SpaceTasksPage from "../../pages/tasks/SpaceTasksPage";
import TaskRedirect from "../../pages/tasks/TaskRedirect";
import TaskDetailPanel from "../tasks/detail/TaskDetailPanel";
import TemplatesAdminPage from "../../pages/tasks/admin/TemplatesAdminPage";
import SpaceSettingsPage from "../../pages/tasks/admin/SpaceSettingsPage";
import FieldsAdminPage from "../../pages/tasks/admin/FieldsAdminPage";
import RequireTaskAccess from "../tasks/RequireTaskAccess";
import RequirePermission from "../auth/RequirePermission";
import PerformancePage from "../../pages/tasks/PerformancePage";
import DashboardPage from "../../pages/tasks/DashboardPage";
import TaskLogPage from "../../pages/tasks/TaskLogPage";

// App.tsx gates the whole /tasks/* mount point behind one section-level
// permission (view_tasks_section: the menu entry). Inside it, access to
// tasks follows the model in tasks/migrations/2026-10-08_task_access_*.sql:
// assigned tasks only, widened by space membership, and the two company-wide
// permissions view_all_tasks / edit_all_tasks. The admin pages (templates,
// field catalog) need edit_all_tasks and a space's settings need "manage"
// on that space — see RequireTaskAccess. Per-action gating inside screens
// reads useTaskAccess.
//
// board/:id (D2), department/:id (D6), my-work (D7), by-assignee,
// by-type, by-project, and space/:spaceId each mount D3's slide-over as
// their own nested task/:id route. TaskDetailPanel reads no boardId
// param — it derives its "base path" from the current URL, so closing or
// following a breadcrumb/subtask link returns to whichever list opened
// it (previously every list navigated away to the task's board instead
// of staying put). by-assignee, by-type, and by-project are the
// company-wide "directory" views (useTaskDirectory.ts); space/:spaceId
// is the same machinery narrowed to one space via useTaskDirectory's
// `spaceId` option, reached from the sidebar's space name/icon and from
// TasksPage.tsx's space cards — separate from space/:id/settings (D9,
// which also holds D10's automations tab; react-router matches the more
// specific path so the two bare/`/settings` routes don't collide).
// board/:id/gantt (and space/:id/gantt, space/:id/zones) is the same page in another view — a path
// segment rather than ?view=gantt because TaskDetailPanel's base path is
// built from pathname alone, so a query param would be dropped every
// time the panel opened or closed. board/:id/flow (the link diagram) and
// board/:id/types (the board by task type) are two more views of the same
// page, the same way.
// admin/templates[/:id] (D8) and admin/fields (D11) are also real;
// task/:id without a list context (D1's search, etc.) goes through
// TaskRedirect so the panel is never opened without a list mounted
// behind it.
export default function TasksRoutes() {
  return (
    <Routes>
      <Route element={<TasksLayout />}>
        <Route index element={<TasksPage />} />
        <Route path="board/:boardId" element={<TaskBoardPage view="list" />}>
          <Route path="task/:taskId" element={<TaskDetailPanel />} />
        </Route>
        <Route path="board/:boardId/gantt" element={<TaskBoardPage view="gantt" />}>
          <Route path="task/:taskId" element={<TaskDetailPanel />} />
        </Route>
        <Route path="board/:boardId/flow" element={<TaskBoardPage view="flow" />}>
          <Route path="task/:taskId" element={<TaskDetailPanel />} />
        </Route>
        <Route path="board/:boardId/types" element={<TaskBoardPage view="types" />}>
          <Route path="task/:taskId" element={<TaskDetailPanel />} />
        </Route>
        <Route element={<RequireTaskAccess scope="browse" />}>
          <Route path="department/:departmentId" element={<DepartmentPage />}>
            <Route path="task/:taskId" element={<TaskDetailPanel />} />
          </Route>
        </Route>
        <Route path="my-work" element={<MyWorkPage />}>
          <Route path="task/:taskId" element={<TaskDetailPanel />} />
        </Route>
        <Route element={<RequireTaskAccess scope="browse" />}>
          <Route path="by-assignee" element={<AssigneeViewPage />}>
            <Route path="task/:taskId" element={<TaskDetailPanel />} />
          </Route>
          <Route path="by-type" element={<TaskTypeViewPage />}>
            <Route path="task/:taskId" element={<TaskDetailPanel />} />
          </Route>
          <Route path="by-project" element={<ProjectViewPage />}>
            <Route path="task/:taskId" element={<TaskDetailPanel />} />
          </Route>
        </Route>
        <Route element={<RequireTaskAccess scope="edit-all" />}>
          <Route path="admin/templates" element={<TemplatesAdminPage />} />
          <Route path="admin/fields" element={<FieldsAdminPage />} />
        </Route>
        <Route element={<RequirePermission permission="view_task_performance" />}>
          <Route path="performance" element={<PerformancePage />} />
        </Route>
        <Route element={<RequirePermission permission="view_task_dashboard" />}>
          <Route path="dashboard" element={<DashboardPage />} />
        </Route>
        <Route element={<RequirePermission permission="view_task_logs" />}>
          <Route path="activity" element={<TaskLogPage />} />
        </Route>
        <Route element={<RequireTaskAccess scope="space" />}>
          <Route path="space/:spaceId/settings" element={<SpaceSettingsPage />} />
        </Route>
        <Route element={<RequireTaskAccess scope="space-view" />}>
          <Route path="space/:spaceId" element={<SpaceTasksPage view="list" />}>
            <Route path="task/:taskId" element={<TaskDetailPanel />} />
          </Route>
          <Route path="space/:spaceId/gantt" element={<SpaceTasksPage view="gantt" />}>
            <Route path="task/:taskId" element={<TaskDetailPanel />} />
          </Route>
          <Route path="space/:spaceId/zones" element={<SpaceTasksPage view="zones" />}>
            <Route path="task/:taskId" element={<TaskDetailPanel />} />
          </Route>
        </Route>
        <Route path="task/:taskId" element={<TaskRedirect />} />
      </Route>
    </Routes>
  );
}
