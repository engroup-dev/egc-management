import { useParams } from "react-router-dom";
import Tabs from "../../../../components/ui/Tabs";
import ProjectAgreementsTab from "../../../../components/agreements/ProjectAgreementsTab";
import PenaltiesTable from "../../../../components/agreements/PenaltiesTable";
import { useCan } from "../../../../hooks/permissions/useCan";

// One project's agreements with contractors (create, edit, pay) and its
// penalties. The route already requires view_project_agreements; the
// penalties tab needs create_contractor_penalty on top.
const OperationsAgreementsProjectPage = () => {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const { can: canCreatePenalty } = useCan("create_contractor_penalty", projectId);

  return (
    <Tabs
      defaultTab="agreements"
      tabs={[
        {
          id: "agreements",
          label: "الاتفاقيات",
          content: <ProjectAgreementsTab projectId={projectId} />,
        },
        ...(canCreatePenalty
          ? [
              {
                id: "penalties",
                label: "الغرامات",
                content: <PenaltiesTable projectId={projectId} canCreate canCancelAny />,
              },
            ]
          : []),
      ]}
    />
  );
};

export default OperationsAgreementsProjectPage;
