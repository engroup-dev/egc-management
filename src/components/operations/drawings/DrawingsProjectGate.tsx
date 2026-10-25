import { Outlet, useParams } from "react-router-dom";
import { useCan } from "../../../hooks/permissions/useCan";
import { useMyDrawingCaps } from "../../../hooks/operations/drawings/useProjectDrawings";

// Route guard for /operations/maps/project/:projectId (and its folders).
// Lets in anyone who holds view_operations_maps on the project, OR may
// manage its drawings, OR was given access to at least one of its
// folders. The last one is why this isn't a plain RequirePermission: a
// manager granting a team member folder access is the whole point of the
// feature, and that member should not also need a separate permission
// grant to open the page. What they then see is still decided folder by
// folder (drawings.my_caps / RLS).
//
// Must sit on a route whose own path declares :projectId (same reason as
// RequirePermission).
const DrawingsProjectGate = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const view = useCan("view_operations_maps", projectId);
  const caps = useMyDrawingCaps(projectId);

  const viaCaps =
    !!caps.data && (caps.data.is_manager || Object.values(caps.data.folders).some((f) => f.view));

  if (view.can || viaCaps) return <Outlet />;

  if (view.loading || caps.isPending) {
    return (
      <div className="p-8 text-center text-sm text-gray-400" dir="rtl">
        جاري التحقق من الصلاحية...
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-8 text-center" dir="rtl">
      <p className="text-sm text-gray-500">ليست لديك صلاحية الوصول إلى هذه الصفحة.</p>
    </div>
  );
};

export default DrawingsProjectGate;
