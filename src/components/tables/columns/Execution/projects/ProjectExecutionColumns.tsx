import { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import Dialog from "../../../../../components/ui/Dialog";
import Button from "../../../../../components/ui/Button";
import { ProjectExecution } from "../../../../../hooks/execution-management/project/useProjects";
import { fetchProjectOverview } from "../../../../../hooks/projects/useProjectOverview";
import { TIERS } from "../../../../../lib/queryClient";
import { formatDate } from "../../../../../utils/helpper";
import { statusColor } from "../../../../../utils/colors/status";
import { supabase } from "../../../../../lib/supabaseClient";

type ProjectDates = Pick<
  ProjectExecution,
  "start_date" | "estimated_due_date" | "end_date"
>;

function ProjectDateEditDialog({ project }: { project: ProjectExecution }) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [dates, setDates] = useState<ProjectDates>({
    start_date: project.start_date,
    estimated_due_date: project.estimated_due_date,
    end_date: project.end_date,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const openDialog = () => {
    setDates({
      start_date: project.start_date,
      estimated_due_date: project.estimated_due_date,
      end_date: project.end_date,
    });
    setError(null);
    setIsOpen(true);
  };

  const updateDate = (field: keyof ProjectDates, value: string) => {
    setDates((current) => ({ ...current, [field]: value || null }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const orderedDates = [
      dates.start_date,
      dates.estimated_due_date,
      dates.end_date,
    ].filter((date): date is string => Boolean(date));

    if (
      orderedDates.some(
        (date, index) => index > 0 && date < orderedDates[index - 1],
      )
    ) {
      setError(
        "يجب أن يكون ترتيب التواريخ: البدء ثم التسليم المتوقع ثم الانتهاء",
      );
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase
      .from("projects")
      .update(dates)
      .eq("id", project.id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["project execution"] });
    setSaving(false);
    setIsOpen(false);
  };

  return (
    <>
      <Button type="button" size="sm" onClick={openDialog}>
        تعديل
      </Button>

      <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">تعديل تواريخ المشروع</h2>
          <p className="text-sm text-muted-foreground">{project.name}</p>

          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-1 text-sm">
              تاريخ البدء
              <input
                type="date"
                value={dates.start_date ?? ""}
                onChange={(event) =>
                  updateDate("start_date", event.target.value)
                }
                className="rounded border px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              تاريخ التسليم المتوقع
              <input
                type="date"
                value={dates.estimated_due_date ?? ""}
                onChange={(event) =>
                  updateDate("estimated_due_date", event.target.value)
                }
                className="rounded border px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              تاريخ الانتهاء
              <input
                type="date"
                value={dates.end_date ?? ""}
                onChange={(event) => updateDate("end_date", event.target.value)}
                className="rounded border px-3 py-2"
              />
            </label>

            {error && <p className="text-sm text-error">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsOpen(false)}
              >
                إلغاء
              </Button>
              <Button type="submit" loading={saving}>
                حفظ
              </Button>
            </div>
          </form>
        </div>
      </Dialog>
    </>
  );
}

function ProjectNameCell({ project }: { project: ProjectExecution }) {
  const queryClient = useQueryClient();
  // Was /projects/:id, which jumped out of Execution Management into
  // the Projects section. Now stays here and opens the project's team
  // screen — this table is the way in to team management.
  const prefetch = () => {
    queryClient.prefetchQuery({
      queryKey: ["project", project.id, "overview"],
      queryFn: () => fetchProjectOverview(project.id),
      staleTime: TIERS.B.staleTime,
    });
  };
  return (
    <div>
      <Link
        to={`/execution-management/projects/${project.id}`}
        onMouseEnter={prefetch}
        onFocus={prefetch}
        className="font-medium hover:underline"
      >
        {project.name}
      </Link>
    </div>
  );
}

export const ProjectExecutionColumns: ColumnDef<ProjectExecution>[] = [
  // Selection column
  {
    id: "select",
    header: ({ table }) => (
      <div className="flex items-center">
        <input
          type="checkbox"
          aria-label="Select all rows"
          onChange={table.getToggleAllPageRowsSelectedHandler()}
          checked={table.getIsAllPageRowsSelected()}
          className="w-4 h-4 rounded border-gray-300"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center">
        <input
          type="checkbox"
          aria-label={`Select row ${row.index + 1}`}
          onChange={row.getToggleSelectedHandler()}
          checked={row.getIsSelected()}
          className="w-4 h-4 rounded border-gray-300"
        />
      </div>
    ),
    size: 32,
  },

  { accessorKey: "serial_number", header: "الرقم" },

  {
    accessorKey: "name",
    header: "اسم المشروع",
    cell: ({ row }) => <ProjectNameCell project={row.original} />,
  },

  {
    accessorKey: "status",
    header: "الحالة",
    accessorFn: (row) => row.status,
    cell: ({ row }) => {
      const statusMap: Record<string, string> = {
        active: "نشط",
        paused: "متوقف",
        completed: "مكتمل",
        cancelled: "ملغي",
      };
      const statusColorClass = statusColor(row.original.status);
      return (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${statusColorClass}`}
        >
          {statusMap[row.original.status]}
        </span>
      );
    },
  },

  {
    accessorKey: "start_date",
    header: "تاريخ البدء",
    cell: ({ row }) => {
      const date = row.original.start_date;
      return date ? formatDate(date) : "-";
    },
  },

  {
    accessorKey: "estimated_due_date",
    header: "تاريخ التسليم المتوقع",
    cell: ({ row }) => {
      const date = row.original.estimated_due_date;
      return date ? formatDate(date) : "-";
    },
  },

  {
    accessorKey: "end_date",
    header: "تاريخ الانتهاء",
    cell: ({ row }) => {
      const date = row.original.end_date;
      return date ? formatDate(date) : "-";
    },
  },

  // Edit button — last column
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <div className="flex items-center justify-end">
        <ProjectDateEditDialog project={row.original} />
      </div>
    ),
    size: 100,
    enableSorting: false,
    enableHiding: false,
  },
];
