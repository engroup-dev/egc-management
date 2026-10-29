import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronUp, Flag, Loader2, Send, Trash2, UserPlus, X, CopyPlus } from "lucide-react";
import ConfirmDialog from "../../ui/ConfirmDialog";
import { useClickOutside } from "../../../hooks/tasks/useClickOutside";
import type { AssignablePerson } from "../../../hooks/tasks/useAssignablePeople";
import type { Priority, StatusRow } from "../../../hooks/tasks/useTaskBoard";
import AssigneeCell from "./AssigneeCell";
import { PRIORITIES, PRIORITY_LABELS } from "./PriorityCell";

// Floating action bar for the board's multi-select. Sits bottom-center over
// the list (z-30: under the detail slide-over at z-40 and ConfirmDialog at
// z-50). All it knows is the selection's size and what each action should
// do — TaskTable owns the selection and the board mutations.

interface BulkActionPanelProps {
  selectedCount: number;
  /** Tasks the select-all box would select. */
  totalCount: number;
  /** What I may do to EVERY selected task (an action is offered only if all allow it). */
  canStatus: boolean;
  canEdit: boolean;
  canDelete: boolean;
  statuses: StatusRow[];
  showPriority: boolean;
  employeesById: Map<string, AssignablePerson>;
  allEmployees: AssignablePerson[];
  projectId: string | null;
  /** People assigned to EVERY selected task — what the assign picker shows as ticked. */
  commonAssigneeIds: string[];
  /** Selected tasks that aren't done/closed yet; 0 disables "complete". */
  incompleteCount: number;
  /** "N tasks and M subtasks" wording for the delete confirmation. */
  deleteMessage: string;
  onSelectAll: () => void;
  onClear: () => void;
  onComplete: () => Promise<unknown>;
  onSetStatus: (statusId: string) => Promise<unknown>;
  onSetPriority: (priority: Priority | null) => Promise<unknown>;
  onAssignChange: (add: string[], remove: string[]) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  onPush?: () => void;
  /** "نسخ إلى مناطق…" (zone boards of a project space). */
  onCopyToZones?: () => void;
  /** false while the bar fades out after the selection empties. */
  visible: boolean;
}

export default function BulkActionPanel({
  selectedCount,
  totalCount,
  canStatus,
  canEdit,
  canDelete,
  statuses,
  showPriority,
  employeesById,
  allEmployees,
  projectId,
  commonAssigneeIds,
  incompleteCount,
  deleteMessage,
  onSelectAll,
  onClear,
  onComplete,
  onSetStatus,
  onSetPriority,
  onAssignChange,
  onDelete,
  onPush,
  onCopyToZones,
  visible,
}: BulkActionPanelProps) {
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Enter: mounts 8px low and transparent, then flips on the next frame so
  // the transition runs. Exit: TaskTable passes visible=false and unmounts
  // it once the transition is over.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Failures are surfaced by the tasks error toast (MutationCache.onError /
  // emitTaskError), so a rejected action just ends the busy state.
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch {
      // already reported
    } finally {
      setBusy(false);
    }
  };

  const hasDoneStatus = statuses.some((s) => s.category === "done");

  return (
    <>
      <div
        dir="rtl"
        className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4"
      >
        <div
          className={`flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-xl transition-all duration-200 ease-out motion-reduce:transition-none ${
            entered && visible ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
          }`}
        >
          <span className="px-1 text-sm font-semibold text-primary">{selectedCount} محددة</span>
          {selectedCount < totalCount && (
            <button onClick={onSelectAll} className="text-xs text-primary hover:underline">
              تحديد الكل ({totalCount})
            </button>
          )}
          <span className="mx-1 h-5 w-px bg-gray-200" />

          <BarButton
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            disabled={busy || !canStatus || !hasDoneStatus || incompleteCount === 0}
            title={!hasDoneStatus ? "لا توجد حالة «منجز» في هذه اللوحة" : incompleteCount === 0 ? "كل المحدد منجز بالفعل" : undefined}
            onClick={() => run(onComplete)}
          >
            إكمال
          </BarButton>

          <StatusMenu statuses={statuses} disabled={busy || !canStatus} onPick={(id) => run(() => onSetStatus(id))} />

          {showPriority && (
            <PriorityMenu disabled={busy || !canEdit} onPick={(p) => run(() => onSetPriority(p))} />
          )}

          <AssigneeCell
            variant="button"
            buttonClassName={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 ${busy || !canEdit ? "pointer-events-none opacity-40" : ""}`}
            buttonContent={
              <>
                <UserPlus className="h-3.5 w-3.5" />
                تعيين
              </>
            }
            assigneeIds={commonAssigneeIds}
            employeesById={employeesById}
            allEmployees={allEmployees}
            projectId={projectId}
            onChange={(next) => {
              const add = next.filter((id) => !commonAssigneeIds.includes(id));
              const remove = commonAssigneeIds.filter((id) => !next.includes(id));
              void run(() => onAssignChange(add, remove));
            }}
          />

          {onPush && (
            <BarButton icon={<Send className="h-3.5 w-3.5" />} disabled={busy || !canEdit} onClick={onPush}>
              إضافة إلى لوحات…
            </BarButton>
          )}

          {onCopyToZones && (
            <BarButton icon={<CopyPlus className="h-3.5 w-3.5" />} disabled={busy} onClick={onCopyToZones}>
              نسخ إلى مناطق…
            </BarButton>
          )}

          <span className="mx-1 h-5 w-px bg-gray-200" />
          <BarButton
            icon={busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            disabled={busy || !canDelete}
            title={canDelete ? undefined : "الحذف متاح لمديري المساحة فقط"}
            danger
            onClick={() => setConfirmingDelete(true)}
          >
            حذف
          </BarButton>
          <button
            onClick={onClear}
            title="إلغاء التحديد"
            aria-label="إلغاء التحديد"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="حذف المهام المحددة؟"
        message={`${deleteMessage} يمكن التراجع بـ Ctrl+Z.`}
        confirmLabel="حذف"
        confirmVariant="error"
        loading={busy}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          void run(async () => {
            await onDelete();
            setConfirmingDelete(false);
          });
        }}
      />
    </>
  );
}

function BarButton({
  icon,
  children,
  onClick,
  disabled,
  danger,
  title,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-40 ${
        danger ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-100"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

// Small menus that open upward — the bar hugs the bottom of the screen.
function UpMenu({
  label,
  icon,
  disabled,
  children,
}: {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
      >
        {icon}
        {label}
        <ChevronUp className="h-3 w-3 text-gray-400" />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-1 max-h-64 w-40 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function StatusMenu({
  statuses,
  disabled,
  onPick,
}: {
  statuses: StatusRow[];
  disabled: boolean;
  onPick: (statusId: string) => void;
}) {
  return (
    <UpMenu label="الحالة" icon={<span className="h-2 w-2 rounded-full bg-gray-400" />} disabled={disabled}>
      {(close) =>
        statuses.map((status) => (
          <button
            key={status.id}
            onClick={() => {
              onPick(status.id);
              close();
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-right text-sm hover:bg-gray-50"
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: status.color ?? "#6B7280" }} />
            <span className="truncate">{status.label_ar}</span>
          </button>
        ))
      }
    </UpMenu>
  );
}

function PriorityMenu({ disabled, onPick }: { disabled: boolean; onPick: (priority: Priority | null) => void }) {
  return (
    <UpMenu label="الأولوية" icon={<Flag className="h-3.5 w-3.5" />} disabled={disabled}>
      {(close) => (
        <>
          {PRIORITIES.map((p) => (
            <button
              key={p}
              onClick={() => {
                onPick(p);
                close();
              }}
              className="block w-full px-3 py-1.5 text-right text-sm hover:bg-gray-50"
            >
              {PRIORITY_LABELS[p]}
            </button>
          ))}
          <button
            onClick={() => {
              onPick(null);
              close();
            }}
            className="block w-full border-t border-gray-100 px-3 py-1.5 text-right text-sm text-gray-400 hover:bg-gray-50"
          >
            بدون أولوية
          </button>
        </>
      )}
    </UpMenu>
  );
}
