import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { CornerDownLeft, Loader2, Maximize2, Plus, X } from "lucide-react";
import { useDirectoryColumns } from "./DirectoryColumnContext";
import { directoryRowGridStyle } from "./DirectoryTaskRow";

export interface InlineCreateTaskRowProps {
  showSource: boolean;
  defaultBoardId: string;
  boards: { key: string; label: string }[];
  onCreate: (boardId: string, title: string) => Promise<unknown> | void;
  onOpenModal: (boardId: string, title?: string) => void;
  onCancel: () => void;
}

export default function InlineCreateTaskRow({
  showSource,
  defaultBoardId,
  boards,
  onCreate,
  onOpenModal,
  onCancel,
}: InlineCreateTaskRowProps) {
  const dirColumns = useDirectoryColumns();
  const [title, setTitle] = useState("");
  const [selectedBoardId, setSelectedBoardId] = useState(defaultBoardId);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (defaultBoardId) {
      setSelectedBoardId(defaultBoardId);
    }
  }, [defaultBoardId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const rowGridStyle = dirColumns
    ? dirColumns.getGridStyle({ showSource, showPriority: true })
    : directoryRowGridStyle({ showSource, showPriority: true });

  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (!trimmed || submitting) return;
    const targetBoardId = selectedBoardId || defaultBoardId || boards[0]?.key;
    if (!targetBoardId) return;

    setSubmitting(true);
    try {
      await onCreate(targetBoardId, trimmed);
      setTitle("");
      // Keep focused for rapid successive entries
      setTimeout(() => {
        inputRef.current?.focus();
      }, 10);
    } catch (err) {
      console.error("Failed to inline-create task:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      style={rowGridStyle}
      className="border-b border-primary/30 bg-primary-superLight/25 px-4 py-2.5 transition-colors select-none"
    >
      {/* 1. Title Column */}
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary shadow-2xs"
          title="مهمة جديدة"
        >
          <Plus className="h-4 w-4" />
        </span>

        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="اكتب اسم المهمة واضغط Enter للإضافة السريعة... (أو Esc للإلغاء)"
            disabled={submitting}
            className="w-full rounded-lg border border-primary/40 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-xs"
          />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !title.trim()}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            title="إضافة ومتابعة المهمة التالية (Enter)"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <span>إضافة</span>
                <CornerDownLeft className="h-3 w-3" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              const targetBoardId = selectedBoardId || defaultBoardId || boards[0]?.key;
              onOpenModal(targetBoardId, title.trim() || undefined);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-600 hover:border-primary/40 hover:text-primary shadow-2xs transition-all"
            title="فتح تفاصيل المهمة في نافذة منبثقة تفصيلية"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">نافذة تفصيلية</span>
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 transition-colors"
            title="إلغاء السطر (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 2. Zone/Source Column (only when viewing all zones) */}
      {showSource && (
        <div className="min-w-0">
          <select
            value={selectedBoardId}
            onChange={(e) => setSelectedBoardId(e.target.value)}
            disabled={submitting}
            className="w-full truncate rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-700 focus:border-primary focus:outline-none shadow-2xs"
            title="اختر المنطقة التي تنتمي إليها هذه المهمة"
          >
            {boards.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 3. Status Column */}
      <div>
        <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
          لم يبدأ
        </span>
      </div>

      {/* 4. Priority Column */}
      <div>
        <span className="text-xs text-slate-400 font-semibold">-</span>
      </div>

      {/* 5. Team Column */}
      <div>
        <span className="text-xs text-slate-400 font-semibold">-</span>
      </div>

      {/* 6. Start Date Column */}
      <div>
        <span className="text-xs text-slate-400 font-semibold">-</span>
      </div>

      {/* 7. Due Date Column */}
      <div>
        <span className="text-xs text-slate-400 font-semibold">-</span>
      </div>
    </div>
  );
}

