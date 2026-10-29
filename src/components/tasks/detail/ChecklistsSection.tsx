import { useState } from "react";
import { ArrowUpLeft, Plus, X } from "lucide-react";
import type { Checklist, ChecklistItem } from "../../../hooks/tasks/useTaskDetail";

interface ChecklistsSectionProps {
  checklists: (Checklist & { items: ChecklistItem[] })[];
  onAddChecklist: (name: string) => void;
  onAddItem: (checklistId: string, content: string) => void;
  onToggleItem: (itemId: string, checked: boolean) => void;
  onRenameItem?: (itemId: string, content: string) => void;
  onDeleteItem?: (itemId: string) => void;
  /** ↗ — the item becomes a task again (or a new task). */
  onItemToTask?: (itemId: string) => void;
  /** May add checklists and items (edit rights). Default true. */
  canEdit?: boolean;
  /** May tick items (status rights: an assignee can). Default true. */
  canTick?: boolean;
}

function ChecklistBlock({
  checklist,
  onAddItem,
  onToggleItem,
  onRenameItem,
  onDeleteItem,
  onItemToTask,
  canEdit,
  canTick,
}: {
  checklist: Checklist & { items: ChecklistItem[] };
  onAddItem: (checklistId: string, content: string) => void;
  onToggleItem: (itemId: string, checked: boolean) => void;
  onRenameItem?: (itemId: string, content: string) => void;
  onDeleteItem?: (itemId: string) => void;
  onItemToTask?: (itemId: string) => void;
  canEdit: boolean;
  canTick: boolean;
}) {
  const [newItem, setNewItem] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const done = checklist.items.filter((i) => i.is_checked).length;

  const submit = () => {
    const content = newItem.trim();
    if (!content) return;
    onAddItem(checklist.id, content);
    setNewItem("");
  };

  return (
    <div className="rounded-lg border border-gray-100 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{checklist.name}</span>
        {checklist.items.length > 0 && (
          <span className="text-xs text-gray-400">
            {done}/{checklist.items.length}
          </span>
        )}
      </div>
      <div className="space-y-1">
        {checklist.items.map((item) => (
          <div key={item.id} className="group flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-gray-50">
            <input
              type="checkbox"
              checked={item.is_checked}
              disabled={!canTick}
              onChange={(e) => onToggleItem(item.id, e.target.checked)}
              className="h-3.5 w-3.5"
            />
            {editingId === item.id ? (
              <input
                autoFocus
                dir="auto"
                defaultValue={item.content}
                onBlur={(e) => {
                  setEditingId(null);
                  const next = e.target.value.trim();
                  if (next && next !== item.content) onRenameItem?.(item.id, next);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="min-w-0 flex-1 rounded border border-primary/40 px-1 text-sm outline-none"
              />
            ) : (
              <span
                onClick={() => canEdit && onRenameItem && setEditingId(item.id)}
                title={canEdit && onRenameItem ? "انقر لتعديل النص" : undefined}
                className={`flex-1 ${canEdit && onRenameItem ? "cursor-text" : ""} ${
                  item.is_checked ? "text-gray-400 line-through" : "text-gray-700"
                }`}
              >
                {item.content}
              </span>
            )}
            {canEdit && onItemToTask && editingId !== item.id && (
              <button
                onClick={() => onItemToTask(item.id)}
                title={item.source_task_id ? "إرجاعها مهمة" : "تحويلها إلى مهمة"}
                className="rounded p-0.5 text-gray-300 opacity-0 hover:bg-gray-100 hover:text-primary group-hover:opacity-100"
              >
                <ArrowUpLeft className="h-3.5 w-3.5" />
              </button>
            )}
            {canEdit && onDeleteItem && editingId !== item.id && (
              <button
                onClick={() => onDeleteItem(item.id)}
                title="حذف البند"
                className="rounded p-0.5 text-gray-300 opacity-0 hover:bg-gray-100 hover:text-red-600 group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="mt-1 flex items-center gap-1.5 px-1">
          <Plus className="h-3.5 w-3.5 text-gray-300" />
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            onBlur={submit}
            placeholder="إضافة عنصر..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
        </div>
      )}
    </div>
  );
}

// "Subtasks: checklist-style list inside the panel, '+ add subtask'
// inline at the bottom of that list" (clickup-task-ui skill) — this
// component handles the literal checklists (4.10: lightweight, no status/
// due date), separate from real subtasks (SubtasksSection.tsx).
export default function ChecklistsSection({
  checklists,
  onAddChecklist,
  onAddItem,
  onToggleItem,
  onRenameItem,
  onDeleteItem,
  onItemToTask,
  canEdit = true,
  canTick = true,
}: ChecklistsSectionProps) {
  const [newChecklistName, setNewChecklistName] = useState("");
  const [adding, setAdding] = useState(false);

  const submitNew = () => {
    const name = newChecklistName.trim();
    if (name) onAddChecklist(name);
    setNewChecklistName("");
    setAdding(false);
  };

  return (
    <div className="space-y-2">
      {checklists.map((c) => (
        <ChecklistBlock
          key={c.id}
          checklist={c}
          onAddItem={onAddItem}
          onToggleItem={onToggleItem}
          onRenameItem={onRenameItem}
          onDeleteItem={onDeleteItem}
          onItemToTask={onItemToTask}
          canEdit={canEdit}
          canTick={canTick}
        />
      ))}

      {!canEdit ? null : adding ? (
        <input
          autoFocus
          value={newChecklistName}
          onChange={(e) => setNewChecklistName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitNew();
            if (e.key === "Escape") setAdding(false);
          }}
          onBlur={submitNew}
          placeholder="اسم قائمة التحقق..."
          className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none"
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
        >
          <Plus className="h-3.5 w-3.5" />
          إضافة قائمة تحقق
        </button>
      )}
    </div>
  );
}
