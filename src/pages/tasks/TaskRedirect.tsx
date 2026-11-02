import { useQuery } from "@tanstack/react-query";
import { Navigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { TaskListPageSkeleton } from "../../components/tasks/TasksSkeletons";

// Standalone /tasks/task/:taskId (from D1's search, or a future
// notification/My-work deep link) has no board in the URL — the detail
// panel is only ever mounted nested under a board (see TasksRoutes.tsx),
// so this looks up the task's board and hands off to the real route,
// keeping "list stays visible behind the panel" true everywhere it opens
// from, not just the board screen itself.
export default function TaskRedirect() {
  const { taskId } = useParams<{ taskId: string }>();
  const boardQuery = useBoardOfTask(taskId);
  // A failed lookup falls back to /tasks, same as a task that doesn't exist.
  const boardId = boardQuery.isError ? null : boardQuery.data;

  if (boardId === undefined) {
    return <TaskListPageSkeleton />;
  }

  if (boardId === null) {
    return <Navigate to="/tasks" replace />;
  }

  return <Navigate to={`/tasks/board/${boardId}/task/${taskId}`} replace />;
}

// Cached (and persisted) so revisiting a deep link redirects instantly
// instead of flashing the skeleton.
function useBoardOfTask(taskId: string | undefined) {
  return useQuery({
    queryKey: ["tasks", "board-of-task", taskId],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .schema("tasks")
        .from("tasks")
        .select("board_id")
        .eq("id", taskId as string)
        .maybeSingle();
      if (error) throw error;
      return data?.board_id ?? null;
    },
    enabled: !!taskId,
  });
}
