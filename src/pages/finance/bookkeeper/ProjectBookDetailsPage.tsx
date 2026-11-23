import { useParams } from "react-router-dom";
import ProjectBookDetails from "../../../components/finance/bookkeeper/projects/ProjectBookDetails";

const ProjectBookDetailsPage = () => {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return <div>Project ID is missing</div>;
  }

  return (
    <div>
      {/* key: switching projects from the sidebar keeps this route mounted,
          and the expense forms set their project once, on mount. Without a
          fresh mount per project they kept the previous project and saved
          expenses into it. */}
      <ProjectBookDetails key={id} id={id} />
    </div>
  );
};

export default ProjectBookDetailsPage;
