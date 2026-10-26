import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { Users, UserCog, Shapes, Building2, FolderKanban, Building, User, Search, X, Layers, Plus, Settings, LayoutGrid, List } from "lucide-react";
import { useTasksSidebar, type BoardWithCount, type SpaceNode, type SpaceType } from "../../hooks/tasks/useTasksSidebar";
import { matchSpaceNode } from "../../hooks/tasks/tasksSidebarSearch";
import { useMyTaskAccess, useSpaceCaps } from "../../hooks/tasks/useTaskAccess";
import NewBoardModal from "../../components/sidebar/NewBoardModal";
import { SpaceCardsPageSkeleton } from "../../components/tasks/TasksSkeletons";

// The /tasks index route — what shows before a space/board is picked.
// D1's actual spec is just "the sidebar" (already built, TasksLayout.tsx),
// so this landing page isn't a numbered D-screen; it's a quick-access hub
// reusing the same sidebar data (spaces/my-work counts)
// instead of a placeholder now that every real screen exists to link to.
//
// The search box filters the space cards by project name, space name or
// board name (matching logic shared with the sidebar search:
// hooks/tasks/tasksSidebarSearch.ts). While a term is typed the view
// shortcuts step aside so the page shows only results.
//
// At the top, the slim delivery timeline (ProjectsDueDateTimeline, compact)
// of the projects whose task space I can open: each sits at the end of its
// last task (useProjectTaskEnds — the plan end its space's Gantt shows), or
// at its estimated due date while it has no dated tasks. Its card shows both
// dates, flagged when the tasks run past the estimate; a project opens its
// space.
//
// The spaces (and search results) show as cards or as a compact list; the
// toggle beside the search box switches between them and the choice is
// remembered per viewer in localStorage.

type SpacesLayout = "cards" | "list";
const LAYOUT_STORAGE_KEY = "tasks.spacesLayout";

// Every access wrapped, since storage can be unreadable (private window,
// blocked site data) — same posture as TaskGantt's readStored/writeStored.
function loadLayout(): SpacesLayout {
  try {
    return localStorage.getItem(LAYOUT_STORAGE_KEY) === "list" ? "list" : "cards";
  } catch {
    return "cards";
  }
}

function saveLayout(layout: SpacesLayout) {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
  } catch {
    // storage unavailable — the choice just won't be remembered
  }
}

const SPACE_TYPE_LABELS: Record<SpaceType, string> = {
  project: "مساحات المشاريع",
  department: "مساحات الأقسام",
  company: "مساحات الشركة",
  personal: "مساحتي الخاصة",
};
const SPACE_TYPE_ORDER: SpaceType[] = ["project", "department", "company", "personal"];
const SPACE_TYPE_ICONS: Record<SpaceType, typeof FolderKanban> = {
  project: FolderKanban,
  department: Building2,
  company: Building,
  personal: User,
};

function ViewCard({
  to,
  icon: Icon,
  label,
  subtitle,
  badge,
}: {
  to: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  subtitle: string;
  badge?: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white p-3 shadow-sm transition-colors hover:border-primary/30 hover:bg-primary-superLight/40"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-superLight text-primary">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-gray-800">{label}</div>
        <div className="truncate text-xs text-gray-400">{subtitle}</div>
      </div>
      {badge}
    </Link>
  );
}

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      {count} مفتوحة
    </span>
  );
}

function LayoutToggle({ value, onChange }: { value: SpacesLayout; onChange: (layout: SpacesLayout) => void }) {
  const options: { layout: SpacesLayout; icon: typeof LayoutGrid; label: string }[] = [
    { layout: "cards", icon: LayoutGrid, label: "عرض كبطاقات" },
    { layout: "list", icon: List, label: "عرض كقائمة" },
  ];
  return (
    <div className="flex shrink-0 items-center rounded-lg border border-gray-200 bg-white p-0.5" role="group" aria-label="طريقة عرض المساحات">
      {options.map(({ layout, icon: Icon, label }) => (
        <button
          key={layout}
          onClick={() => onChange(layout)}
          aria-pressed={value === layout}
          title={label}
          aria-label={label}
          className={`rounded-md p-1.5 transition-colors ${
            value === layout ? "bg-primary-superLight text-primary" : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          }`}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

// The container a group of spaces sits in: a grid of cards, or one bordered
// list with a divider between rows.
function SpaceGroupItems({ layout, children }: { layout: SpacesLayout; children: ReactNode }) {
  return layout === "list" ? (
    <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-100 bg-white">{children}</div>
  ) : (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">{children}</div>
  );
}

function SpaceCard({
  node,
  matchedBoards,
  layout,
}: {
  node: SpaceNode;
  matchedBoards?: BoardWithCount[];
  layout: SpacesLayout;
}) {
  const Icon = SPACE_TYPE_ICONS[node.space.space_type];
  const boardCount = node.boards.length + node.folders.reduce((n, f) => n + f.boards.length, 0);
  const openCount =
    node.boards.reduce((n, b) => n + b.openCount, 0) +
    node.folders.reduce((n, f) => n + f.boards.reduce((s, b) => s + b.openCount, 0), 0);
  // Only worth a line of its own when it says something the title doesn't.
  const showProject = !!node.projectName && node.projectName !== node.space.name;
  // With the space tree gone from the sidebar, the card is where a space's
  // settings are opened and boards are added.
  const caps = useSpaceCaps(node.space.id);
  const [showNewBoard, setShowNewBoard] = useState(false);
  const hasActions = caps.create || caps.manage;
  const isList = layout === "list";

  const iconBadge = (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg bg-primary-superLight text-primary ${isList ? "h-8 w-8" : "h-9 w-9"}`}
      style={node.space.color ? { backgroundColor: `${node.space.color}1A`, color: node.space.color } : undefined}
    >
      <Icon className={isList ? "h-4 w-4" : "h-4.5 w-4.5"} />
    </span>
  );
  const title = (
    <div className="min-w-0 flex-1">
      <div className="truncate font-medium text-gray-800">{node.space.name}</div>
      {showProject && <div className="truncate text-xs text-gray-400">المشروع: {node.projectName}</div>}
    </div>
  );
  const boardsLabel = boardCount > 0 ? `${boardCount} لوحة` : "لا توجد لوحات بعد";

  return (
    <div>
      <div className="relative">
      {isList ? (
        // Fixed-width count columns so the rows line up down the list.
        <Link
          to={`/tasks/space/${node.space.id}`}
          className={`flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-primary-superLight/40 ${hasActions ? "pl-20" : ""}`}
        >
          {iconBadge}
          {title}
          <span className="w-28 shrink-0 text-xs text-gray-400">{boardsLabel}</span>
          <span className="flex w-20 shrink-0 justify-end">
            <CountBadge count={openCount} />
          </span>
        </Link>
      ) : (
        <Link
          to={`/tasks/space/${node.space.id}`}
          className="block rounded-lg border border-gray-100 p-3 transition-colors hover:border-primary/30 hover:bg-primary-superLight/40"
        >
          <div className={`flex items-center gap-2 ${hasActions ? "pl-16" : ""}`}>
            {iconBadge}
            {title}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-400">{boardsLabel}</span>
            <CountBadge count={openCount} />
          </div>
        </Link>
      )}
      {/* Siblings of the link, not children: a button can't live inside a link. */}
      {hasActions && (
        <div className={`absolute left-2 flex items-center gap-0.5 ${isList ? "top-1/2 -translate-y-1/2" : "top-2"}`}>
          {caps.create && (
            <button
              onClick={() => setShowNewBoard(true)}
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              title="لوحة جديدة"
              aria-label="لوحة جديدة"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
          {caps.manage && (
            <Link
              to={`/tasks/space/${node.space.id}/settings`}
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              title="إعدادات المساحة"
              aria-label="إعدادات المساحة"
            >
              <Settings className="h-4 w-4" />
            </Link>
          )}
        </div>
      )}
      </div>
      {showNewBoard && <NewBoardModal spaceId={node.space.id} onClose={() => setShowNewBoard(false)} />}
      {/* Siblings of the card link, not children: a link can't nest a link. */}
      {!!matchedBoards?.length && (
        <div className={`mr-4 mt-1 space-y-0.5 border-r border-gray-100 pr-2 ${isList ? "mb-2" : ""}`}>
          {matchedBoards.map((b) => (
            <Link
              key={b.board.id}
              to={`/tasks/board/${b.board.id}`}
              className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
            >
              <Layers className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="flex-1 truncate">
                {b.board.name}
                {b.zoneName && <span className="text-xs text-gray-400"> ({b.zoneName})</span>}
              </span>
              <CountBadge count={b.openCount} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TasksPage() {
  const { data, loading } = useTasksSidebar();
  const { access } = useMyTaskAccess();
  const [search, setSearch] = useState("");
  const searching = search.trim().length > 0;
  const [layout, setLayout] = useState<SpacesLayout>(loadLayout);
  const changeLayout = (next: SpacesLayout) => {
    setLayout(next);
    saveLayout(next);
  };

  // Someone who can see no space at all (only tasks assigned to them) lands
  // on their own work instead of an empty hub.
  const onlyOwnTasks = !!access && !access.view_all && Object.keys(access.spaces).length === 0;

  // Per space type: the spaces that match (by project / space / board name),
  // each with the boards that matched, so a board hit is reachable straight
  // from here instead of only through its space.
  const searchGroups = useMemo(() => {
    if (!data || !searching) return [];
    return SPACE_TYPE_ORDER.map((type) => ({
      type,
      results: data.spacesByType[type].flatMap((node) => {
        const match = matchSpaceNode(node, search);
        return match ? [{ node, boards: match.boards }] : [];
      }),
    })).filter((g) => g.results.length > 0);
  }, [data, search, searching]);

  if (onlyOwnTasks) return <Navigate to="/tasks/my-work" replace />;
  if (loading) {
    return <SpaceCardsPageSkeleton />;
  }

  // The cross-space views (by employee / type / project, departments) are for
  // people who can see more than their own tasks. Space cards: only spaces I
  // hold a level on (a space visible just because it holds a task of mine is
  // reached from the sidebar's board link, and its page would refuse me).
  const canBrowse = !!access && (access.view_all || Object.keys(access.spaces).length > 0);
  const spaceGroups = data
    ? SPACE_TYPE_ORDER.map((type) => ({
        type,
        nodes: data.spacesByType[type].filter((n) => !!access?.spaces[n.space.id]),
      })).filter((g) => g.nodes.length > 0)
    : [];

  return (
    <div className="h-full overflow-y-auto p-6" dir="rtl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-gray-900">إدارة المهام</h1>
        <div className="flex w-full max-w-md items-center gap-2">
          <LayoutToggle value={layout} onChange={changeLayout} />
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالمشروع أو المساحة أو اللوحة..."
              className="w-full bg-transparent text-sm outline-none"
              aria-label="بحث بالمشروع أو المساحة أو اللوحة"
            />
            {searching && (
              <button onClick={() => setSearch("")} className="shrink-0 rounded-full p-0.5 text-gray-400 hover:bg-gray-100" title="مسح البحث">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {searching && searchGroups.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
          لا توجد نتائج مطابقة
        </div>
      )}
      {searching &&
        searchGroups.map((group) => (
          <div key={group.type} className="mb-5">
            <div className="mb-2 text-xs font-semibold text-gray-500">{SPACE_TYPE_LABELS[group.type]}</div>
            <SpaceGroupItems layout={layout}>
              {group.results.map(({ node, boards }) => (
                <SpaceCard key={node.space.id} node={node} matchedBoards={boards} layout={layout} />
              ))}
            </SpaceGroupItems>
          </div>
        ))}

      {!searching && (
        <div className="mb-5">
          <div className="mb-2 text-xs font-semibold text-gray-500">طرق العرض</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            <ViewCard
              to="/tasks/my-work"
              icon={Users}
              label="أعمالي"
              subtitle="المهام المسندة إليك عبر كل المشاريع"
              badge={<CountBadge count={data?.myWorkCount ?? 0} />}
            />
            {canBrowse && (
              <>
                <ViewCard
                  to="/tasks/by-assignee"
                  icon={UserCog}
                  label="حسب الموظف"
                  subtitle="كل المهام مجمّعة حسب الموظف المسؤول"
                />
                <ViewCard
                  to="/tasks/by-type"
                  icon={Shapes}
                  label="حسب نوع المهمة"
                  subtitle="كل المهام مجمّعة حسب نوع المهمة"
                />
                <ViewCard
                  to="/tasks/by-project"
                  icon={FolderKanban}
                  label="حسب المشروع"
                  subtitle="كل المهام مجمّعة حسب المشروع والمنطقة"
                />
              </>
            )}
          </div>
        </div>
      )}

      {!searching && spaceGroups.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
          لا توجد مساحات بعد
        </div>
      )}
      {!searching &&
        spaceGroups.map((group) => (
          <div key={group.type} className="mb-5">
            <div className="mb-2 text-xs font-semibold text-gray-500">{SPACE_TYPE_LABELS[group.type]}</div>
            <SpaceGroupItems layout={layout}>
              {group.nodes.map((node) => (
                <SpaceCard key={node.space.id} node={node} layout={layout} />
              ))}
            </SpaceGroupItems>
          </div>
        ))}
    </div>
  );
}
