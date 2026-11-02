import { EmployeesColumns } from "../../tables/columns/EmployeesColumns";
import GenericTable from "../../tables/table";
import { Employees, Roles } from "../../../types/global.type";
import { useEmployeesList } from "../../../hooks/hr/useEmployeesList";

export interface employeesWithRole extends Employees {
  users: {
    roles: Roles;
  };
}

const EmployeesList = () => {
  const { employees } = useEmployeesList();

  return (
    <div>
      <GenericTable
        data={employees}
        columns={EmployeesColumns}
        enableSorting
        enablePagination
        enableFiltering
        enableRowSelection
        showGlobalFilter
      />
    </div>
  );
};

export default EmployeesList;
