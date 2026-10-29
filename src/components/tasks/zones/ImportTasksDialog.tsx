import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { useTaskBoard, type TaskRow } from "../../../hooks/tasks/useTaskBoard";
import { useCopyTasksToBoards, useSpaceZones } from "../../../hooks/tasks/useZones";
import { extractErrorMessage } from "../../../hooks/tasks/extractErrorMessage";
import { emitDoneNotice } from "../../../hooks/tasks/taskUndo";
import TaskFlow from "../flow/TaskFlow";
import { tasksCount } from "../gantt/ganttScale";

// "استيراد مهام" on the zone bar — Construction Flow's "Import tasks": another
// zone's diagram full screen; click the boxes to bring in (a parent brings its
// subtasks), then import. Tasks this zone already has (same task, twin_key)
// are greyed out. Links between the imported tasks, and to the same tasks
// already here, come along; dates are kept and then follow the links.
// Replaces the old "استنساخ منطقة" dialog (which lost every link).

interface ImportTasksDialogProps {
  spaceId: string;
  targetBoardId: string;
  targetZoneName: string;
  targetTasks: TaskRow[];
  onClose: () => void;
}

export default function ImportTasksDialog({ spaceId, targetBoardId, targetZoneName, targetTasks, onClose }: ImportTasksDialogProps) {
  const { zones } = useSpaceZones(spaceId);
  const sources = useMemo(() => zones.filter((z) => z.boardId !== targetBoardId), [zones, targetBoardId]);
  const [sourceId, setSourceId] = useState<string | null>(null);
  useEffect(() => {
    if (!sourceId && sources.length) setSourceId(sources[0].boardId);
  }, [sources, sourceId]);
  const { data, loading } = useTaskBoard(sourceId ?? undefined);
  const { copyTasks, copying } = useCopyTasksToBoards();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const have = useMemo(() => new Set(targetTasks.map((t) => t.twin_key ?? t.id)), [targetTasks]);
  const sourceTasks = data?.tasks ?? [];
  const disabled = useMemo(
    () => new Set(sourceTasks.filter((t) => have.has(t.twin_key ?? t.id)).map((t) => t.id)),
    [sourceTasks, have],
  );
  const childrenOf = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const t of sourceTasks) if (t.parent_task_id) map.set(t.parent_task_id, [...(map.get(t.parent_task_id) ?? []), t.id]);
    return map;
  }, [sourceTasks]);
  useEffect(() => setSelected(new Set()), [sourceId]);

  // picking a parent picks its subtasks (they come along with it)
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const on = !next.has(id);
      const walk = (x: string) => {
        if (!disabled.has(x)) {
          if (on) next.add(x);
          else next.delete(x);
        }
        for (const c of childrenOf.get(x) ?? []) walk(c);
      };
      walk(id);
      return next;
    });

  const run = async () => {
    if (!sourceId || selected.size === 0) return;
    setError(null);
    try {
      const result = await copyTasks({ sourceBoardId: sourceId, taskIds: Array.from(selected), targetBoardIds: [targetBoardId] });
      const copied = result.boards[0]?.copied ?? 0;
      emitDoneNotice(`استُوردت ${tasksCount(copied)} إلى ${targetZoneName}`);
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" dir="rtl">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
          <Download className="h-4.5 w-4.5 text-primary" />
          استيراد مهام إلى {targetZoneName}
        </h2>
        <span className="text-xs text-gray-500">من</span>
        <select
          value={sourceId ?? ""}
          onChange={(e) => setSourceId(e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm outline-none"
        >
          {sources.map((z) => (
            <option key={z.boardId} value={z.boardId}>
              {z.zoneName ?? z.boardName}
            </option>
          ))}
        </select>
        <button
          onClick={() => setSelected(new Set(sourceTasks.filter((t) => !disabled.has(t.id)).map((t) => t.id)))}
          className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
        >
          تحديد الكل
        </button>
        <button onClick={() => setSelected(new Set())} className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
          إلغاء التحديد
        </button>
        <span className="text-xs text-gray-400">انقر المهام التي تريدها — المهام الباهتة موجودة هنا مسبقاً</span>
        <button onClick={onClose} className="mr-auto rounded-full p-1 text-gray-400 hover:bg-gray-100">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {!sourceId || loading || !data ? (
          <div className="flex h-full items-center justify-center">
            {sources.length === 0 ? (
              <span className="text-sm text-gray-400">لا توجد منطقة أخرى للاستيراد منها بعد. أضف منطقة أولاً.</span>
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
            )}
          </div>
        ) : (
          <TaskFlow
            key={sourceId}
            tasks={data.tasks}
            statuses={data.statuses}
            taskTypes={data.taskTypes}
            dependencies={data.dependencies}
            dependencyFlags={data.dependencyFlags}
            onOpenTask={() => undefined}
            readOnly
            selectMode={{ selected, disabled, onToggle: toggle }}
          />
        )}
      </div>

      <div className="flex items-center justify-center gap-4 border-t border-gray-200 px-4 py-3">
        <span className="text-sm text-gray-500">{selected.size ? `${tasksCount(selected.size)} محددة` : "لم تُحدد مهام"}</span>
        {error && <span className="text-xs text-red-600">{error}</span>}
        <button
          disabled={copying || selected.size === 0}
          onClick={() => void run()}
          className="flex items-center gap-1.5 rounded-md bg-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {copying && <Loader2 className="h-4 w-4 animate-spin" />}
          استيراد المهام المحددة{selected.size ? ` (${selected.size})` : ""}
        </button>
      </div>
    </div>
  );
}
