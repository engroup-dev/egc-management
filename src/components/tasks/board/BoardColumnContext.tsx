import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export interface BoardColumnWidths {
  title: number;
  status: number;
  priority: number;
  team: number;
  startDate: number;
  duration: number;
  dueDate: number;
  department: number;
  [key: string]: number; // for custom columns: custom_{id}
}

export const DEFAULT_BOARD_COLUMN_WIDTHS: BoardColumnWidths = {
  title: 340,
  status: 130,
  priority: 95,
  team: 110,
  startDate: 110,
  duration: 85,
  dueDate: 110,
  department: 110,
};

const MIN_COLUMN_WIDTHS: Record<string, number> = {
  title: 180,
  status: 90,
  priority: 70,
  team: 80,
  startDate: 80,
  duration: 65,
  dueDate: 80,
  department: 80,
};

const STORAGE_KEY = "egc_tasks_board_column_widths_v1";

interface BoardColumnContextValue {
  widths: BoardColumnWidths;
  setColumnWidth: (colKey: string, width: number) => void;
  resetWidths: () => void;
  getGridStyle: (customColumnCount: number, showPriority?: boolean) => CSSProperties;
  isResizing: boolean;
}

const BoardColumnContext = createContext<BoardColumnContextValue | null>(null);

export function useBoardColumns() {
  return useContext(BoardColumnContext);
}

export function BoardColumnProvider({ children }: { children: ReactNode }) {
  const [widths, setWidths] = useState<BoardColumnWidths>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_BOARD_COLUMN_WIDTHS, ...parsed };
      }
    } catch {
      // fallback
    }
    return DEFAULT_BOARD_COLUMN_WIDTHS;
  });

  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
    } catch {
      // ignore
    }
  }, [widths]);

  const setColumnWidth = useCallback((colKey: string, width: number) => {
    const min = MIN_COLUMN_WIDTHS[colKey] ?? 70;
    const finalWidth = Math.max(min, Math.round(width));
    setWidths((prev) => ({
      ...prev,
      [colKey]: finalWidth,
    }));
  }, []);

  const resetWidths = useCallback(() => {
    setWidths(DEFAULT_BOARD_COLUMN_WIDTHS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const getGridStyle = useCallback(
    (customColumnCount: number, showPriority = true): CSSProperties => {
      const tracks: string[] = [`${widths.title}px`, `${widths.status}px`];
      if (showPriority) tracks.push(`${widths.priority}px`);
      tracks.push(
        `${widths.team}px`,
        `${widths.startDate}px`,
        `${widths.duration}px`,
        `${widths.dueDate}px`,
        `${widths.department}px`,
      );

      for (let i = 0; i < customColumnCount; i++) {
        const customWidth = widths[`custom_${i}`] ?? 120;
        tracks.push(`${customWidth}px`);
      }
      tracks.push("64px"); // action buttons slot

      return {
        display: "grid",
        gridTemplateColumns: tracks.join(" "),
        alignItems: "center",
        gap: "0.75rem",
        minWidth: "max-content",
      };
    },
    [widths],
  );

  const value = useMemo(
    () => ({
      widths,
      setColumnWidth,
      resetWidths,
      getGridStyle,
      isResizing,
    }),
    [widths, setColumnWidth, resetWidths, getGridStyle, isResizing],
  );

  return (
    <BoardColumnContext.Provider value={value}>{children}</BoardColumnContext.Provider>
  );
}

/** Resizable Column Header Component with draggable handle on left edge in RTL */
export function ResizableBoardHeaderCell({
  columnKey,
  children,
  className = "",
}: {
  columnKey: string;
  children: ReactNode;
  className?: string;
}) {
  const context = useBoardColumns();
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const [active, setActive] = useState(false);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!context) return;

      startXRef.current = e.clientX;
      startWidthRef.current = context.widths[columnKey] ?? 100;
      setActive(true);

      const onMouseMove = (moveEvent: MouseEvent) => {
        // In RTL layout, moving mouse to the LEFT (smaller clientX) makes the column wider
        const delta = startXRef.current - moveEvent.clientX;
        const newWidth = startWidthRef.current + delta;
        context.setColumnWidth(columnKey, newWidth);
      };

      const onMouseUp = () => {
        setActive(false);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [columnKey, context],
  );

  const onDoubleClick = useCallback(() => {
    if (!context) return;
    const defaultWidth = DEFAULT_BOARD_COLUMN_WIDTHS[columnKey] ?? 100;
    context.setColumnWidth(columnKey, defaultWidth);
  }, [columnKey, context]);

  return (
    <div className={`group/col relative flex h-full items-center select-none ${className}`}>
      <div className="min-w-0 flex-1 truncate">{children}</div>

      {/* Resize Handle on the left edge (divider in RTL) */}
      <div
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        title="اسحب لتغيير عرض العمود (انقر مرتين لإعادة الضبط)"
        className={`absolute -left-2 top-0 bottom-0 z-10 w-3.5 cursor-col-resize flex items-center justify-center transition-colors ${
          active ? "bg-primary/20" : "hover:bg-primary/10"
        }`}
      >
        <div
          className={`h-4 w-1 rounded-full transition-colors ${
            active ? "bg-primary h-5" : "bg-slate-300 group-hover/col:bg-primary/70"
          }`}
        />
      </div>
    </div>
  );
}

