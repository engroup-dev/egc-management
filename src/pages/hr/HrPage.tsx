import MenuGrid from "../../components/ui/MenuGrid";
import { HR_ITEMS } from "../../config/navigation/hr";

const HrPage = () => {
  const menuItems = HR_ITEMS.filter((item) => item.showInMenuGrid !== false);

  return (
    <MenuGrid
      title="الموارد البشرية"
      items={menuItems}
      columns={{ base: 1, sm: 2, md: 3 }}
    />
  );
};

export default HrPage;
