import { useEffect, useMemo, useRef, useState } from "react";
import { CopyPlus, Loader2, X } from "lucide-react";
import { useCopyTasksToBoards, useSpaceZones, type CopyResult } from "../../../hooks/tasks/useZones";
import { extractErrorMessage } from "../../../hooks/tasks/extractErrorMessage";
import { movesSummary, shortDate, zoneColor } from "./zoneLabels";

// "نسخ إلى مناطق أخرى" for one task or a selection (the detail panel, the
// row menu, the diagram's selection): Construction Flow's "add to other
// zones", but links come along — between the copied tasks, and to the same
// tasks already in the target zone. A zone that already has the task is
// skipped. Each zone row shows the server's dry run.

interface CopyToZonesDialogProps {
  spaceId: string;
  sourceBoardId: string;
  taskIds: string[];
  /** For the title: the task's name, or "N مهام". */
  label: string;
  onClose: () => void;
  onCopied?: () => void;
}

export default function CopyToZonesDialog({ spaceId, sourceBoardId, taskIds, label, onClose, onCopied }: CopyToZonesDialogProps) {
  const { zones, loading } = useSpaceZones(spaceId);
  const { copyTasks } = useCopyTasksToBoards();
  const targets = useMemo(() => zones.filter((z) => z.boardId !== sourceBoardId), [zones, sourceBoardId]);
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [startDate, setStartDate] = useState("");
  // per-zone counts (every other zone), and the effect of the zones ticked
  const [preview, setPreview] = useState<CopyResult | null>(null);
  const [picked, setPicked] = useState<CopyResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const pickId = useRef(0);

  useEffect(() => {
    if (!loading && chosen === null) setChosen(new Set(targets.map((z) => z.boardId)));
  }, [loading, targets, chosen]);

  // one dry run over every zone: per-zone counts for the rows
  const allTargets = useMemo(() => targets.map((z) => z.boardId), [targets]);
  useEffect(() => {
    if (!allTargets.length) return;
    const id = ++requestId.current;
    setPreviewing(true);
    copyTasks({ sourceBoardId, taskIds, targetBoardIds: allTargets, startDate: startDate || null, dryRun: true })
      .then((result) => {
        if (id === requestId.current) setPreview(result);
      })
      .catch((err) => {
        if (id === requestId.current) setError(extractErrorMessage(err));
      })
      .finally(() => {
        if (id === requestId.current) setPreviewing(false);
      });
  }, [allTargets, startDate]);

  const perBoard = useMemo(() => new Map((preview?.boards ?? []).map((b) => [b.board_id, b])), [preview]);
  const pickedZones = useMemo(
    () => targets.filter((z) => chosen?.has(z.boardId) && (perBoard.get(z.boardId)?.copied ?? 1) > 0),
    [targets, chosen, perBoard],
  );
  const willCopy = pickedZones.reduce((n, z) => n + (perBoard.get(z.boardId)?.copied ?? 0), 0);

  useEffect(() => {
    const id = ++pickId.current;
    if (!pickedZones.length) {
      setPicked(null);
      return;
    }
    const timer = setTimeout(() => {
      copyTasks({
        sourceBoardId,
        taskIds,
        targetBoardIds: pickedZones.map((z) => z.boardId),
        startDate: startDate || null,
        dryRun: true,
      })
        .then((result) => {
          if (id === pickId.current) setPicked(result);
        })
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [pickedZones, startDate]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await copyTasks({
        sourceBoardId,
        taskIds,
        targetBoardIds: pickedZones.map((z) => z.boardId),
        startDate: startDate || null,
      });
      onCopied?.();
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" dir="rtl">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold text-gray-900">
            <CopyPlus className="h-4.5 w-4.5 shrink-0 text-primary" />
            <span className="truncate">نسخ «{label}» إلى مناطق أخرى</span>
          </h2>
          <button onClick={onClose} className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
            </div>
          ) : targets.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">لا توجد مناطق أخرى في هذه المساحة.</p>
          ) : (
            targets.map((z) => {
              const b = perBoard.get(z.boardId);
              const index = zones.findIndex((x) => x.boardId === z.boardId);
              const none = !!b && b.copied === 0;
              return (
                <label
                  key={z.boardId}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${none ? "opacity-60" : "cursor-pointer hover:bg-gray-50"}`}
                >
                  <input
                    type="checkbox"
                    disabled={none}
                    checked={!!chosen?.has(z.boardId) && !none}
                    onChange={() =>
                      setChosen((prev) => {
                        const next = new Set(prev ?? []);
                        if (next.has(z.boardId)) next.delete(z.boardId);
                        else next.add(z.boardId);
                        return next;
                      })
                    }
                  />
                  <span className="h-2 w-2 rounded-full" style={{ background: zoneColor(index) }} />
                  <span className="flex-1 truncate text-gray-800">{z.zoneName ?? z.boardName}</span>
                  <span className="text-[11px] text-gray-400">
                    {!b ? "" : none ? "موجودة مسبقاً" : `${b.copied} مهمة${b.skipped ? ` · ${b.skipped} موجودة` : ""}`}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div className="space-y-2 border-t border-gray-100 px-4 py-3">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            تبدأ في
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-md border border-gray-200 px-2 py-0.5 text-xs outline-none"
            />
            {!startDate && <span className="text-gray-400">(نفس التواريخ)</span>}
          </label>
          <p className="text-[11px] text-gray-400">
            الروابط بين المهام المنسوخة، وبينها وبين نفس المهام في المنطقة الهدف، تُنسخ أيضاً.
          </p>
          {picked && !previewing && (
            <p className="text-xs text-gray-600">
              {movesSummary(picked.moved)}
              {picked.project_end_after && <> · نهاية المشروع {shortDate(picked.project_end_after)}</>}
            </p>
          )}
          {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
              إلغاء
            </button>
            <button
              disabled={saving || previewing || willCopy === 0}
              onClick={() => void submit()}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {(saving || previewing) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              نسخ{willCopy ? ` (${willCopy})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
