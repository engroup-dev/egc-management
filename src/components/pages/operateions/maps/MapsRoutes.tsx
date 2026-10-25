import { Routes, Route } from "react-router-dom";
import DrawingsProjectGate from "../../../operations/drawings/DrawingsProjectGate";
import OperationsMapsPage from "../../../../pages/operations/mpas/OperationsMapsPage";
import OperationsMapsProjectPage from "../../../../pages/operations/mpas/project/OperationsMapsProjectPage";
import ProjectDrawingFolderPage from "../../../../pages/operations/mpas/project/ProjectDrawingFolderPage";

// The index here is a project picker, not itself project-scoped, so it
// stays outside any guard; OperationsRoutes.tsx doesn't gate "maps/*"
// either.
//
// project/:projectId is gated by DrawingsProjectGate rather than
// RequirePermission: view_operations_maps still opens it, but so does
// managing the project's drawings or having been given access to one of
// its folders (see that component). Like RequirePermission, it reads the
// project from useParams, so the guard route itself must carry :projectId.
export default function MapsRoutes() {
  return (
    <Routes>
      <Route index element={<OperationsMapsPage />} />
      <Route path="project/:projectId" element={<DrawingsProjectGate />}>
        <Route index element={<OperationsMapsProjectPage />} />
        <Route path="folder/:folderId" element={<ProjectDrawingFolderPage />} />
      </Route>
    </Routes>
  );
}
