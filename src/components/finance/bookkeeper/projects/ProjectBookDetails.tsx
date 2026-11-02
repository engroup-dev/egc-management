import { useBookProject } from "../../../../hooks/projects/useBookProjects";
import ProjectBookDetailsSkeleton from "../../../ui/loading/ProjectBookDetailsSkeleton";
import Tabs from "../../../ui/Tabs";
import RefreshingBadge from "../../../ui/RefreshingBadge";
import BookProjectExpenseNotPaidTab from "../tabs/BookProjectExpenseNotPaidTab";
import BookProjectExpensePercentageTab from "../tabs/BookProjectExpensePercentageTab";
import BookProjectExpenseTab from "../tabs/BookProjectExpenseTab";
import BookProjectMapsTab from "../tabs/BookProjectMapsTab";
import BookRefundTab from "../tabs/BookRefundTab";
import BookProjectUndistributedExpenseTab from "../tabs/BookProjectUndistributedExpenseTab";

const ProjectBookDetails = ({ id }: { id: string }) => {
  const {
    project,
    loading,
    refreshing,
    error,
    addExpense,
    addExpensePercentage,
  } = useBookProject(id);

  const tabs = [
    {
      id: "materials",
      label: "مواد و الخدمات",
      content: (
        <BookProjectExpenseTab project={project} addExpense={addExpense} />
      ),
    },
    {
      id: "not-paid",
      label: "غير مدفوع",
      content: <BookProjectExpenseNotPaidTab project={project} />,
    },
    {
      id: "refund",
      label: "الراجع",
      content: (
        <BookRefundTab refunds={project?.project_refund ?? []} projectId={id} />
      ),
    },
    {
      id: "maps",
      label: "الخرائط",
      content: (
        <BookProjectMapsTab
          projectId={id}
          projectMaps={project?.project_maps ?? []}
        />
      ),
    },
    {
      id: "percentage",
      label: "النسبة المئوية",
      content: (
        <BookProjectExpensePercentageTab
          project={project}
          addExpensePercentage={addExpensePercentage}
        />
      ),
    },
    {
      id: "undistributed",
      label: "غير موزع",
      content: <BookProjectUndistributedExpenseTab projectId={id} />,
    },
  ];

  if (loading) {
    return <ProjectBookDetailsSkeleton />;
  }
  if (error) {
    return <div>خطأ في تحميل المشروع: {error.message}</div>;
  }
  return (
    <div>
      <RefreshingBadge show={refreshing} />
      <div>
        <Tabs tabs={tabs} defaultTab="materials" />
      </div>
    </div>
  );
};

export default ProjectBookDetails;
