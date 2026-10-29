import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Link2, Loader2, Search, X } from "lucide-react";
import {
  useSyncZoneChain,
  useZoneChainGroups,
  type ChainGroup,
  type ChainResult,
  type ZoneSpan,
} from "../../../hooks/tasks/useZones";
import { extractErrorMessage } from "../../../hooks/tasks/extractErrorMessage";
import { movesSummary, shortDate, zoneColor } from "./zoneLabels";

// "ربط المناطق": Construction Flow's "crews move zone to zone", per task.
// Each chosen task waits for the same task in the previous zone (finish ->
// start, in zone order); an unchosen one runs in parallel across zones (a
// trade with more than one crew). Applying makes the chain links match the
// choice and the current zone order — old chain links are removed, manual
// links are never touched. The footer is the server's dry run of the choice.

interface ChainZonesDialogProps {
  spaceId: string;
  zones: ZoneSpan[];
  onClose: () => void;
  onApplied: () => void;
}

/** The choice the dialog opens with: what is chained now, else every sub-task. */
function initialChoice(groups: ChainGroup[]): Set<string> {
  const chainable = groups.filter((g) => !g.duplicate);
  const current = chainable.filter((g) => g.chain_links > 0);
  return new Set((current.length ? current : chainable.filter((g) => !g.is_summary)).map((g) => g.key));
}

export default function ChainZonesDialog({ spaceId, zones, onClose, onApplied }: ChainZonesDialogProps) {
  const { groups, loading } = useZoneChainGroups(spaceId);
  const { syncChain } = useSyncZoneChain(spaceId);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<ChainResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!loading && selected === null) setSelected(initialChoice(groups));
  }, [loading, groups, selected]);

  const zoneIndex = useMemo(() => new Map(zones.map((z, i) => [z.boardId, i])), [zones]);
  const keys = useMemo(() => (selected ? Array.from(selected) : []), [selected]);

  // dry run of the current choice, debounced
  useEffect(() => {
    if (selected === null) return;
    const id = ++requestId.current;
    setPreviewing(true);
    const timer = setTimeout(() => {
      syncChain({ keys, dryRun: true })
        .then((result) => {
          if (id === requestId.current) {
            setPreview(result);
            setError(null);
          }
        })
        .catch((err) => {
          if (id === requestId.current) setError(extractErrorMessage(err));
        })
        .finally(() => {
          if (id === requestId.current) setPreviewing(false);
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [keys]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? groups.filter((g) => g.title.toLowerCase().includes(q)) : groups;
  }, [groups, search]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const choose = (pick: (g: ChainGroup) => boolean) =>
    setSelected(new Set(groups.filter((g) => !g.duplicate && pick(g)).map((g) => g.key)));

  const apply = async () => {
    setApplying(true);
    setError(null);
    try {
      await syncChain({ keys, dryRun: false });
      onApplied();
    } catch (err) {
      setError(extractErrorMessage(err));
      setApplying(false);
    }
  };

  const changes = preview ? preview.added + preview.removed : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" dir="rtl">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Link2 className="h-4.5 w-4.5 text-primary" />
            ربط المناطق
          </h2>
          <button onClick={onClose} className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="space-y-2 border-b border-gray-100 px-4 py-3 text-xs leading-relaxed text-gray-500">
          <p>
            كل مهمة مختارة في منطقة تبدأ بعد انتهاء نفس المهمة في المنطقة السابقة — فريق واحد ينتقل من منطقة إلى التالية
            حسب ترتيب المناطق:
          </p>
          <div className="flex flex-wrap items-center gap-1">
            {zones.map((z, i) => (
              <span key={z.boardId} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-300">←</span>}
                <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
                  <span className="h-2 w-2 rounded-full" style={{ background: zoneColor(i) }} />
                  {z.zoneName ?? z.boardName}
                </span>
              </span>
            ))}
          </div>
          <p>ألغِ اختيار مهمة لها أكثر من فريق لتعمل في المناطق بالتوازي.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 py-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث في المهام"
              className="w-full rounded-md border border-gray-200 py-1 pl-2 pr-7 text-sm outline-none focus:border-primary"
            />
          </div>
          <button onClick={() => choose(() => true)} className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
            تحديد الكل
          </button>
          <button
            onClick={() => choose((g) => !g.is_summary)}
            className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            المهام الفرعية فقط
          </button>
          <button onClick={() => setSelected(new Set())} className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
            إلغاء الكل
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
            </div>
          ) : groups.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">
              لا توجد مهام مشتركة بين منطقتين بعد. انسخ مهام منطقة إلى الأخرى أولاً (استيراد مهام / منطقة جديدة).
            </div>
          ) : (
            shown.map((g) => {
              const on = !!selected?.has(g.key);
              return (
                <label
                  key={g.key}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                    g.duplicate ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-gray-50"
                  }`}
                  style={{ paddingRight: 8 + g.depth * 16 }}
                >
                  <input type="checkbox" disabled={g.duplicate} checked={on && !g.duplicate} onChange={() => toggle(g.key)} />
                  <span className={`flex-1 truncate ${g.is_summary ? "font-medium text-gray-900" : "text-gray-700"}`}>
                    {g.title}
                  </span>
                  {g.is_summary && (
                    <span
                      className="rounded-full bg-gray-100 px-1.5 text-[10px] text-gray-500"
                      title="ربط مهمة رئيسية يجعل كل مهامها الفرعية في المنطقة التالية تنتظر انتهاءها كلها"
                    >
                      رئيسية
                    </span>
                  )}
                  {g.duplicate ? (
                    <span className="rounded-full bg-red-50 px-1.5 text-[10px] text-red-600">مكررة في إحدى المناطق</span>
                  ) : g.chained ? (
                    <span className="flex items-center gap-0.5 text-[10px] text-green-600">
                      <Check className="h-3 w-3" />
                      مربوطة
                    </span>
                  ) : null}
                  <span className="flex items-center gap-0.5">
                    {g.zones.map((z) => (
                      <span
                        key={z.task_id}
                        className="h-2 w-2 rounded-full"
                        style={{ background: zoneColor(zoneIndex.get(z.board_id) ?? 0) }}
                        title={zones[zoneIndex.get(z.board_id) ?? 0]?.zoneName ?? ""}
                      />
                    ))}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div className="space-y-2 border-t border-gray-100 px-4 py-3">
          <div className="flex min-h-[20px] flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
            {previewing ? (
              <span className="flex items-center gap-1 text-gray-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                جارٍ حساب التأثير…
              </span>
            ) : preview ? (
              <>
                <span>
                  {preview.added > 0 && <>+{preview.added} ربط </>}
                  {preview.removed > 0 && <>−{preview.removed} ربط </>}
                  {changes === 0 && "لا تغيير في الربط"}
                </span>
                <span>· {movesSummary(preview.moved)}</span>
                {preview.project_end_after && (
                  <span>
                    · نهاية المشروع{" "}
                    {preview.project_end_before !== preview.project_end_after && preview.project_end_before && (
                      <span className="text-gray-400 line-through">{shortDate(preview.project_end_before)}</span>
                    )}{" "}
                    <span className="font-medium text-gray-900">{shortDate(preview.project_end_after)}</span>
                  </span>
                )}
              </>
            ) : null}
          </div>
          {preview && preview.skipped.length > 0 && (
            <p className="rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
              تُركت {preview.skipped.length} خطوة لأنها تنشئ حلقة مع روابط أخرى:{" "}
              {preview.skipped.slice(0, 4).map((s) => `«${s.title}»`).join("، ")}
              {preview.skipped.length > 4 ? "…" : ""}
            </p>
          )}
          {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-600">{error}</p>}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">{selected?.size ?? 0} مهمة مختارة</span>
            <div className="flex gap-2">
              <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                إلغاء
              </button>
              <button
                disabled={applying || previewing || !preview || changes === 0}
                onClick={() => void apply()}
                className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                {applying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                تطبيق
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
