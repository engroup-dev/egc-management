import { Routes, Route } from "react-router-dom";
import RequirePermission from "../../../auth/RequirePermission";
import OperationsBOQProjectPage from "../../../../pages/operations/BOQ/project/OperationsBOQProjectPage";
import OperationsBIQPage from "../../../../pages/operations/BOQ/OperationsBIQPage";
import BOQZonesPage from "../../../../pages/operations/BOQ/project/BOQZonesPage";
import BOQTypesPage from "../../../../pages/operations/BOQ/project/BOQTypesPage";
import BOQTypeReviewPage from "../../../../pages/operations/BOQ/project/BOQTypeReviewPage";

// view_operations_boq is project-scoped — see MapsRoutes.tsx for why the
// guard sits here, on the route that carries :projectId, rather than
// pathless above it. The index is a project picker and stays ungated.
export default function BOQRoutes() {
  return (
    <Routes>
      <Route index element={<OperationsBIQPage />} />
      <Route
        path="project/:projectId"
        element={<RequirePermission permission="view_operations_boq" />}
      >
        <Route index element={<BOQTypesPage />} />
        <Route path="zones" element={<BOQZonesPage />} />
        <Route path="types" element={<BOQTypesPage />} />
        <Route path="types/:typeId" element={<BOQTypeReviewPage />} />
        <Route path=":typeId" element={<BOQTypeReviewPage />} />
      </Route>
    </Routes>
  );
}
