import { useState } from "react";
import { Layers, Loader2, X } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useSyncZoneChain, useZoneActions, type ChainGroup } from "../../../hooks/tasks/useZones";
import { extractErrorMessage } from "../../../hooks/tasks/extractErrorMessage";

// "+ منطقة" on the zone bar: a new BOQ zone with its own board, last in the
// zone order. Optionally a copy of the current zone's tasks (links, dates and
// checklists come along; ticks are reset) and chained after it, so the same
// tasks in the new zone wait for this one — Construction Flow's "add zone"
// with "copy this zone's tasks", plus the crew rule.

interface AddZoneDialogProps {
  spaceId: string;
  projectId: string;
  zoneCount: number;
  /** The zone the user is on (null on a board that isn't a zone). */
  currentBoardId: string | null;
  currentZoneName: string | null;
  currentRootTaskIds: string[];
  onClose: () => void;
  onAdded: (boardId: string) => void;
}

export default function AddZoneDialog({
  spaceId,
  projectId,
  zoneCount,
  currentBoardId,
  currentZoneName,
  currentRootTaskIds,
  onClose,
  onAdded,
}: AddZoneDialogProps) {
  const { addZone } = useZoneActions(spaceId);
  const { syncChain } = useSyncZoneChain(spaceId);
  const canCopy = !!currentBoardId && currentRootTaskIds.length > 0;
  const [name, setName] = useState(`المنطقة ${zoneCount + 1}`);
  const [copy, setCopy] = useState(canCopy);
  const [chain, setChain] = useState(canCopy);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const boardId = await addZone({
        projectId,
        name: trimmed,
        copyFrom: copy && currentBoardId ? { boardId: currentBoardId, taskIds: currentRootTaskIds } : undefined,
      });
      if (copy && chain) {
        // keep the space's current chain, and chain the new zone's copies
        // (sub-tasks, not their parents — like the chain dialog's default)
        const { data, error: groupsError } = await supabase
          .schema("tasks")
          .rpc("zone_chain_groups", { p_space_id: spaceId });
        if (groupsError) throw groupsError;
        const groups = (data as unknown as ChainGroup[]) ?? [];
        const keys = groups
          .filter((g) => !g.duplicate && (g.chain_links > 0 || (!g.is_summary && g.zones.some((z) => z.board_id === boardId))))
          .map((g) => g.key);
        if (keys.length) await syncChain({ keys, dryRun: false });
      }
      onAdded(boardId);
    } catch (err) {
      setError(extractErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" dir="rtl">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Layers className="h-4.5 w-4.5 text-primary" />
            منطقة جديدة
          </h2>
          <button onClick={onClose} className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="space-y-4 p-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">اسم المنطقة</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              placeholder="مثال: الدور الأول"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <p className="mt-1 text-[11px] text-gray-400">تُضاف إلى مناطق المشروع في جدول الكميات، ولها لوحة مهام خاصة بها.</p>
          </div>
          {canCopy && (
            <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} className="mt-0.5" />
              <span>
                نسخ مهام «{currentZoneName}» إليها
                <span className="block text-[11px] text-gray-400">بالروابط والتواريخ وقوائم التحقق (بدون علامات الإنجاز)</span>
              </span>
            </label>
          )}
          {canCopy && copy && (
            <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={chain} onChange={(e) => setChain(e.target.checked)} className="mt-0.5" />
              <span>
                ربطها بالمناطق
                <span className="block text-[11px] text-gray-400">
                  كل مهمة فيها تنتظر انتهاء نفس المهمة في المنطقة السابقة (فريق واحد ينتقل بين المناطق)
                </span>
              </span>
            </label>
          )}
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
            إلغاء
          </button>
          <button
            disabled={saving || !name.trim()}
            onClick={() => void submit()}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            إضافة المنطقة
          </button>
        </div>
      </div>
    </div>
  );
}
