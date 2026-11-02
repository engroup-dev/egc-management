import { useMemo } from "react";
import { AlertTriangle, CalendarClock, FolderKanban, Info } from "lucide-react";
import { useProjects } from "../../hooks/useProjects";
import {
  useAccountNegativePeriodCountsByProject,
  useOpenAccountNegativePeriods,
  useOpenProjectNegativePeriods,
  useProjectNegativePeriodCountsByProject,
} from "../../hooks/projects/useProjectCounters";
import {
  projectsCountersColumns,
  ProjectCounterSummaryRow,
} from "../../components/tables/columns/ProjectsCountersColumns";
import GenericTable from "../../components/tables/table";
import KpiCard from "../../components/ui/KpiCard";
import LoadingPage from "../../components/ui/LoadingPage";
import RefreshingBadge from "../../components/ui/RefreshingBadge";

const ProjectsCountersPage = () => {
  const { projects, loading: projectsLoading } = useProjects();
  const {
    rows,
    loading: rowsLoading,
    refreshing: rowsRefreshing,
    error,
    refetch,
  } = useOpenProjectNegativePeriods();
  const {
    rows: accountRows,
    loading: accountRowsLoading,
    refreshing: accountRowsRefreshing,
    error: accountRowsError,
    refetch: refetchAccountRows,
  } = useOpenAccountNegativePeriods();
  const { countsByProject: financeCountersCountByProject } =
    useProjectNegativePeriodCountsByProject();
  const { countsByProject: accountCountersCountByProject } =
    useAccountNegativePeriodCountsByProject();

  const minusByProjectId = useMemo(() => {
    const map = new Map<string, (typeof rows)[number]>();
    rows.forEach((row) => {
      if (row.project_id) map.set(row.project_id, row);
    });
    return map;
  }, [rows]);

  const accountMinusByProjectId = useMemo(() => {
    const map = new Map<string, typeof accountRows>();
    accountRows.forEach((row) => {
      if (!row.project_id) return;
      const existing = map.get(row.project_id) ?? [];
      existing.push(row);
      map.set(row.project_id, existing);
    });
    return map;
  }, [accountRows]);

  const summaryRows: ProjectCounterSummaryRow[] = useMemo(
    () =>
      (projects ?? []).map((project) => ({
        id: project.id,
        name: project.name,
        serialNumber: project.serial_number,
        minusRow: minusByProjectId.get(project.id),
        accountMinusRows: accountMinusByProjectId.get(project.id) ?? [],
        financeCountersCount: financeCountersCountByProject[project.id] ?? 0,
        accountCountersCount: accountCountersCountByProject[project.id] ?? 0,
      })),
    [
      projects,
      minusByProjectId,
      accountMinusByProjectId,
      financeCountersCountByProject,
      accountCountersCountByProject,
    ],
  );

  if (projectsLoading || rowsLoading || accountRowsLoading)
    return <LoadingPage label="جارٍ تحميل عدادات المشاريع..." />;

  const projectsInMinusCount = minusByProjectId.size;
  const totalDaysInMinus = rows.reduce(
    (sum, row) => sum + (row.days_count ?? 0),
    0,
  );
  const averageDaysInMinus =
    projectsInMinusCount > 0 ? totalDaysInMinus / projectsInMinusCount : 0;
  const accountsInMinusCount = accountMinusByProjectId.size;

  return (
    <div className="p-6 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-900">عدادات المشاريع</h1>
          <RefreshingBadge show={rowsRefreshing || accountRowsRefreshing} />
        </div>
        <p className="text-sm text-gray-500 mt-0.5">
          متابعة فترات الرصيد السالب لكل مشروع
        </p>
      </div>

      <div className="rounded-lg shadow-sm p-4 flex gap-3 items-start bg-blue-50 border border-blue-100">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
        <p className="text-sm text-blue-700">
          العداد تلقائي بالكامل، ويتم تحديثه وتشغيله يومياً الساعة 5:00 مساءً
          بتوقيت ليبيا.
        </p>
      </div>

      {error || accountRowsError ? (
        <div className="flex flex-col items-center justify-center gap-3 h-40 text-sm bg-white rounded-xl border border-gray-100">
          <p className="text-red-500">
            {error?.message ?? accountRowsError?.message}
          </p>
          <button
            onClick={() => {
              refetch();
              refetchAccountRows();
            }}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            حاول ثانية
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="إجمالي المشاريع"
              value={String(projects?.length ?? 0)}
              icon={FolderKanban}
              tone="indigo"
            />
            <KpiCard
              label="مشاريع برصيد سالب حالياً"
              value={String(projectsInMinusCount)}
              icon={AlertTriangle}
              tone="amber"
            />
            <KpiCard
              label="حسابات برصيد سالب حالياً"
              value={String(accountsInMinusCount)}
              icon={AlertTriangle}
              tone="amber"
            />
            <KpiCard
              label="متوسط أيام السالب الحالية"
              value={averageDaysInMinus.toFixed(1)}
              icon={CalendarClock}
              tone="blue"
            />
          </div>

          <GenericTable
            data={summaryRows}
            columns={projectsCountersColumns}
            enableSorting
            enableFiltering
            showGlobalFilter
            initialSorting={[{ id: "serialNumber", desc: true }]}
          />
        </>
      )}
    </div>
  );
};

export default ProjectsCountersPage;
