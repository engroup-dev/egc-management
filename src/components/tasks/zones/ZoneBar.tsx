import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeftRight, ChevronLeft, ChevronRight, Download, Layers, Link2, Plus, Settings2 } from "lucide-react";
import { useSpaceZones, useZoneActions, type ZoneSpan } from "../../../hooks/tasks/useZones";
import { useClickOutside } from "../../../hooks/tasks/useClickOutside";
import Tooltip from "../../ui/Tooltip";
import AddZoneDialog from "./AddZoneDialog";
import ChainZonesDialog from "./ChainZonesDialog";
import { shortDate, shortSpan, zoneColor } from "./zoneLabels";
import type { BoardView } from "../../../pages/tasks/TaskBoardPage";

// The zones of the board's space as tabs, Construction Flow's zone bar: each
// zone is a board bound to a BOQ zone, in board order, with its dates. From
// here: add a zone (optionally a copy of this one), rename / reorder /
// archive it, import tasks from another zone, chain the zones (the same task
// waits for the previous zone — one crew moving floor to floor) and open the
// all-zones timeline. Shown on project spaces and wherever zones exist.

interface ZoneBarProps {
  spaceId: string;
  projectId: string | null;
  currentBoardId: string;
  view: BoardView;
  canCreate: boolean;
  canEdit: boolean;
  /** Top-level tasks of this board, for "copy this zone's tasks". */
  currentRootTaskIds: string[];
  onImport: () => void;
}

const VIEW_SUFFIX: Record<BoardView, string> = { list: "", gantt: "/gantt", flow: "/flow", types: "/types" };

export default function ZoneBar({
  spaceId,
  projectId,
  currentBoardId,
  view,
  canCreate,
  canEdit,
  currentRootTaskIds,
  onImport,
}: ZoneBarProps) {
  const navigate = useNavigate();
  const { zones, projectEnd, loading } = useSpaceZones(spaceId);
  const actions = useZoneActions(spaceId);
  const [adding, setAdding] = useState(false);
  const [chaining, setChaining] = useState(false);
  const [managing, setManaging] = useState(false);
  const [orderChanged, setOrderChanged] = useState(false);

  const current = zones.find((z) => z.boardId === currentBoardId) ?? null;
  if (loading || (!projectId && zones.length === 0)) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50/60 px-6 py-2 text-sm">
      <span className="flex items-center gap-1 text-xs font-medium text-gray-500">
        <Layers className="h-3.5 w-3.5" />
        المناطق
      </span>

      <div className="flex flex-wrap items-center gap-1.5">
        {zones.map((z, i) => {
          const active = z.boardId === currentBoardId;
          const span = shortSpan(z.firstStart, z.lastDue);
          return (
            <Tooltip
              key={z.boardId}
              label={`${z.zoneName ?? z.boardName} · ${z.taskCount} مهمة، ${z.openCount} مفتوحة${span ? ` · ${span}` : ""}`}
            >
              <Link
                to={`/tasks/board/${z.boardId}${VIEW_SUFFIX[view]}`}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                  active
                    ? "border-primary bg-primary text-white"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                }`}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: zoneColor(i) }} />
                {z.zoneName ?? z.boardName}
                {span && <span className={active ? "text-white/75" : "text-gray-400"}>· {span}</span>}
              </Link>
            </Tooltip>
          );
        })}
        {zones.length === 0 && <span className="text-xs text-gray-400">لا توجد مناطق بعد</span>}
      </div>

      {canCreate && projectId && (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-white"
        >
          <Plus className="h-3.5 w-3.5" />
          منطقة
        </button>
      )}

      {current && canEdit && (
        <ManageZone
          zone={current}
          zones={zones}
          open={managing}
          setOpen={setManaging}
          busy={actions.busy}
          onRename={(name) => actions.renameZone({ zone: current, name })}
          onMove={async (dir) => {
            await actions.moveZone({ zones, boardId: current.boardId, dir });
            setOrderChanged(true);
          }}
          onArchive={async () => {
            await actions.archiveZoneBoard({ boardId: current.boardId });
            const next = zones.find((z) => z.boardId !== current.boardId);
            navigate(next ? `/tasks/board/${next.boardId}${VIEW_SUFFIX[view]}` : `/tasks/space/${spaceId}`);
          }}
        />
      )}

      <div className="mr-auto flex items-center gap-1.5">
        {orderChanged && canEdit && (
          <button
            onClick={() => setChaining(true)}
            className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-700 hover:bg-amber-100"
          >
            تغيّر ترتيب المناطق — حدّث الربط
          </button>
        )}
        {projectEnd && (
          <span className="text-xs text-gray-500">
            نهاية المشروع <span className="font-medium text-gray-700">{shortDate(projectEnd)}</span>
          </span>
        )}
        {canCreate && zones.length > 1 && current && (
          <button
            onClick={onImport}
            className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" />
            استيراد مهام
          </button>
        )}
        {canEdit && zones.length > 1 && (
          <Tooltip label="كل مهمة في منطقة تنتظر انتهاء نفس المهمة في المنطقة السابقة">
            <button
              onClick={() => setChaining(true)}
              className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              <Link2 className="h-3.5 w-3.5" />
              ربط المناطق
            </button>
          </Tooltip>
        )}
        {zones.length > 0 && (
          <Link
            to={`/tasks/space/${spaceId}/zones`}
            className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            الخط الزمني للمناطق
          </Link>
        )}
      </div>

      {adding && projectId && (
        <AddZoneDialog
          spaceId={spaceId}
          projectId={projectId}
          zoneCount={zones.length}
          currentBoardId={current ? currentBoardId : null}
          currentZoneName={current?.zoneName ?? current?.boardName ?? null}
          currentRootTaskIds={currentRootTaskIds}
          onClose={() => setAdding(false)}
          onAdded={(boardId) => {
            setAdding(false);
            navigate(`/tasks/board/${boardId}${VIEW_SUFFIX[view]}`);
          }}
        />
      )}
      {chaining && (
        <ChainZonesDialog
          spaceId={spaceId}
          zones={zones}
          onClose={() => setChaining(false)}
          onApplied={() => {
            setChaining(false);
            setOrderChanged(false);
          }}
        />
      )}
    </div>
  );
}

function ManageZone({
  zone,
  zones,
  open,
  setOpen,
  busy,
  onRename,
  onMove,
  onArchive,
}: {
  zone: ZoneSpan;
  zones: ZoneSpan[];
  open: boolean;
  setOpen: (open: boolean) => void;
  busy: boolean;
  onRename: (name: string) => Promise<void>;
  onMove: (dir: -1 | 1) => Promise<void>;
  onArchive: () => Promise<void>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(zone.zoneName ?? zone.boardName);
  const [armed, setArmed] = useState(false);
  useClickOutside(ref, () => {
    setOpen(false);
    setArmed(false);
  });
  const index = zones.findIndex((z) => z.boardId === zone.boardId);
  const saveName = () => {
    const next = name.trim();
    if (next && next !== (zone.zoneName ?? zone.boardName)) void onRename(next);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setName(zone.zoneName ?? zone.boardName);
          setOpen(!open);
        }}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-white"
        title="إدارة هذه المنطقة"
      >
        <Settings2 className="h-3.5 w-3.5" />
        إدارة المنطقة
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-64 space-y-2 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <label className="block text-xs text-gray-500">اسم المنطقة</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-primary"
          />
          <div className="flex gap-1.5">
            <button
              disabled={busy || index <= 0}
              onClick={() => void onMove(-1)}
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-gray-200 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronRight className="h-3.5 w-3.5" />
              أبكر
            </button>
            <button
              disabled={busy || index < 0 || index >= zones.length - 1}
              onClick={() => void onMove(1)}
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-gray-200 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              لاحقاً
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            disabled={busy || zones.length < 2}
            onClick={() => {
              if (!armed) {
                setArmed(true);
                return;
              }
              void onArchive();
            }}
            className={`w-full rounded-md py-1 text-xs disabled:opacity-40 ${
              armed ? "bg-red-600 text-white" : "border border-red-200 text-red-600 hover:bg-red-50"
            }`}
          >
            {armed ? "اضغط مرة أخرى لأرشفة لوحة المنطقة" : "أرشفة لوحة المنطقة"}
          </button>
          <p className="text-[11px] leading-relaxed text-gray-400">
            الترتيب هنا هو ترتيب العمل بين المناطق. الأرشفة تخفي اللوحة ومهامها ولا تحذف المنطقة من جدول الكميات.
          </p>
        </div>
      )}
    </div>
  );
}
