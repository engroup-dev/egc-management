import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useProjects } from "../../../hooks/useProjects";
import { createProjectsColumns } from "../../tables/columns/ProjectsColumns";
import GenericTable from "../../tables/table";
import OverviewStatus from "../../ui/OverviewStatus";
import { formatCurrency } from "../../../utils/helpper";
import {
  ProjectCountSource,
  useProjectCounts,
} from "../../../hooks/projects/useProjectCounts";

interface ProjectsListProps {
  basePath?: string;
  version?: string;
  /**
   * Extra "N per project" columns — contracts, orders, BOQ zones,
   * whatever's next. The caller declares what it wants counted; this
   * component doesn't know or care which page is asking.
   */
  counters?: ProjectCountSource[];
}

const ProjectsList = ({
  basePath = "/projects",
  version = "default",
  counters = [],
}: ProjectsListProps) => {
  const navigate = useNavigate();
  const { projects } = useProjects();
  const counts = useProjectCounts(counters);

  const columns = useMemo(
    () =>
      createProjectsColumns(
        (id) => `${basePath}/${id}`,
        version,
        counts.map((c) => ({
          id: c.id,
          header: c.header,
          countMap: c.countMap,
        })),
      ),
    [basePath, version, counts],
  );

  // -----------------------------
  // ❌ EXCLUDED TEST PROJECT IDS
  // -----------------------------
  const excludedProjectIds = [
    "eed51009-4cfa-497c-87a1-cbf5a756f3da",
    "e0a50575-bcc1-474a-98b8-8f57770a14fa",
    "5451aaae-c632-46f4-9913-8670cffcc8e7",
    "f2d38514-32e0-4eeb-b6cd-fcdbed6a93ab",
  ];

  // -----------------------------
  // FILTER PROJECTS
  // -----------------------------
  const filteredProjects =
    projects?.filter((p) => !excludedProjectIds.includes(p.id)) || [];

  // -----------------------------
  // FLATTEN ACCOUNTS
  // -----------------------------
  const allAccounts = filteredProjects
    .flatMap((p) => p.accounts || [])
    .filter(Boolean);

  // -----------------------------
  // STATS
  // -----------------------------
  const totalActiveProjects = filteredProjects.reduce(
    (acc, project) => acc + (project.status === "active" ? 1 : 0),
    0,
  );

  const totalBalance = allAccounts.reduce(
    (acc, a) => acc + (a.balance || 0),
    0,
  );

  const totalCashBalance = allAccounts
    .filter((a) => a.type === "cash")
    .reduce((acc, a) => acc + (a.balance || 0), 0);

  const totalBankBalance = allAccounts
    .filter((a) => a.type === "bank")
    .reduce((acc, a) => acc + (a.balance || 0), 0);

  const totalIncome = allAccounts.reduce(
    (acc, a) => acc + (a.total_transactions || 0),
    0,
  );

  const totalExpense = allAccounts.reduce(
    (acc, a) => acc + (a.total_expense || 0),
    0,
  );

  const totalPercentages = allAccounts.reduce(
    (acc, a) => acc + (a.total_percentage || 0),
    0,
  );

  return (
    <div>
      {version === "finance" && (
        <OverviewStatus
          stats={[
            {
              label: "عدد المشاريع النشطة",
              value: totalActiveProjects,
            },
            {
              label: "اجمالي المصاريف",
              value: formatCurrency(totalExpense),
              secondaryLabel: "النسبة",
              secondaryValue: formatCurrency(totalPercentages),
            },
            {
              label: "اجمالي المدفوع",
              value: formatCurrency(totalIncome),
            },
            {
              label: "الرصيد المتاح",
              value: formatCurrency(totalBalance),
              secondaryLabel: "كاش",
              secondaryValue: formatCurrency(totalCashBalance),
              tertiaryLabel: "بنك",
              tertiaryValue: formatCurrency(totalBankBalance),
            },
          ]}
        />
      )}

      <GenericTable
        data={projects ?? []}
        columns={columns}
        enableSorting
        enableFiltering
        showGlobalFilter
        onRowClick={(row) => navigate(`${basePath}/${row.id}`)}
        initialSorting={[{ id: "serial_number", desc: true }]}
      />
    </div>
  );
};

export default ProjectsList;
