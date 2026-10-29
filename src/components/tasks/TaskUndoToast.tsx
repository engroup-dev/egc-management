import { useEffect, useState } from "react";
import { Redo2, Undo2, Info, CalendarClock } from "lucide-react";
import { setUndoNoticeListener, type UndoNotice } from "../../hooks/tasks/taskUndo";
import { formatDayWithWeekday } from "./board/workingDays";

// Confirmation for Ctrl/Cmd+Z and redo — without it a silent revert is
// indistinguishable from "nothing happened". Errors go through the red
// TaskErrorToast instead; this one is for the normal outcomes.
function describe(notice: UndoNotice): { text: string; icon: "undo" | "redo" | "info" | "schedule" } {
  switch (notice.kind) {
    case "undo":
      return {
        text: `تم التراجع: ${notice.label}${notice.skipped > 0 ? ` (تعذّر ${notice.skipped} لأنها تغيّرت)` : ""}`,
        icon: "undo",
      };
    case "redo":
      return {
        text: `تمت الإعادة: ${notice.label}${notice.skipped > 0 ? ` (تعذّر ${notice.skipped} لأنها تغيّرت)` : ""}`,
        icon: "redo",
      };
    case "stale":
      return { text: `تعذّر التراجع عن «${notice.label}» — تغيّرت المهمة منذ ذلك الحين`, icon: "info" };
    case "empty":
      return { text: notice.direction === "undo" ? "لا يوجد ما يمكن التراجع عنه" : "لا يوجد ما يمكن إعادته", icon: "info" };
    case "linked":
      return { text: `تبدأ بعد «${notice.title}» — رُبطت بها`, icon: "schedule" };
    case "done":
      return { text: `${notice.text} — Ctrl+Z للتراجع`, icon: "info" };
    case "schedule":
      return {
        text: `تم ترحيل ${notice.moved === 1 ? "مهمة واحدة" : `${notice.moved} مهام`}${
          notice.boards > 1 ? ` في ${notice.boards} مناطق` : ""
        }${notice.boardEnd ? ` · نهاية اللوحة ${formatDayWithWeekday(notice.boardEnd)}` : ""}`,
        icon: "schedule",
      };
  }
}

export default function TaskUndoToast() {
  const [notice, setNotice] = useState<UndoNotice | null>(null);

  useEffect(() => {
    setUndoNoticeListener(setNotice);
    return () => setUndoNoticeListener(null);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;
  const { text, icon } = describe(notice);

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] w-full max-w-sm -translate-x-1/2 px-4" dir="rtl">
      <div className="flex items-center gap-2 rounded-lg bg-gray-900 px-3.5 py-2.5 text-sm text-white shadow-2xl">
        {icon === "undo" && <Undo2 className="h-4 w-4 shrink-0" />}
        {icon === "redo" && <Redo2 className="h-4 w-4 shrink-0" />}
        {icon === "info" && <Info className="h-4 w-4 shrink-0" />}
        {icon === "schedule" && <CalendarClock className="h-4 w-4 shrink-0" />}
        <span className="flex-1">{text}</span>
      </div>
    </div>
  );
}
