import { useParams } from "react-router-dom";
import ProjectExpenseBulkForm from "../../../../components/finance/form/ProjectExpenseSheetForm";

const BulkExpensesPage = () => {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return <div>معرف المشروع غير موجود في المعاملات.</div>;
  }
  return (
    <div>
      {/* key: a fresh form per project, so rows never keep the previous
          project's id (see ProjectBookDetailsPage). */}
      <ProjectExpenseBulkForm key={id} projectId={id} />
    </div>
  );
};

export default BulkExpensesPage;
