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

export interface DirectoryColumnWidths {
  title: number;
  source: number;
  status: number;
  priority: number;
  team: number;
  startDate: number;
  dueDate: number;
  completed: number;
}

export const DEFAULT_DIRECTORY_COLUMN_WIDTHS: DirectoryColumnWidths = {
  title: 360,
  source: 160,
  status: 145,
  priority: 110,
  team: 135,
  startDate: 135,
  dueDate: 135,
  completed: 135,
};

const MIN_COLUMN_WIDTHS: Record<keyof DirectoryColumnWidths, number> = {
  title: 180,
  source: 100,
  status: 110,
  priority: 80,
  team: 90,
  startDate: 100,
  dueDate: 100,
  completed: 100,
};

const STORAGE_KEY = "egc_tasks_column_widths_v1";

interface DirectoryColumnContextValue {
  widths: DirectoryColumnWidths;
  setColumnWidth: (colKey: keyof DirectoryColumnWidths, width: number) => void;
  resetWidths: () => void;
  getGridStyle: (options?: {
    showPriority?: boolean;
    showSource?: boolean;
    showCompleted?: boolean;
  }) => CSSProperties;
  isResizing: boolean;
}

const DirectoryColumnContext = createContext<DirectoryColumnContextValue | null>(
  null,
);

export function useDirectoryColumns() {
  return useContext(DirectoryColumnContext);
}

export function DirectoryColumnProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [widths, setWidths] = useState<DirectoryColumnWidths>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_DIRECTORY_COLUMN_WIDTHS, ...parsed };
      }
    } catch {
      // fallback to defaults
    }
    return DEFAULT_DIRECTORY_COLUMN_WIDTHS;
  });

  const [isResizing, setIsResizing] = useState(false);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
    } catch {
      // ignore
    }
  }, [widths]);

  const setColumnWidth = useCallback(
    (colKey: keyof DirectoryColumnWidths, width: number) => {
      const min = MIN_COLUMN_WIDTHS[colKey] ?? 80;
      const finalWidth = Math.max(min, Math.round(width));
      setWidths((prev) => ({
        ...prev,
        [colKey]: finalWidth,
      }));
    },
    [],
  );

  const resetWidths = useCallback(() => {
    setWidths(DEFAULT_DIRECTORY_COLUMN_WIDTHS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const getGridStyle = useCallback(
    ({
      showPriority = true,
      showSource = false,
      showCompleted = false,
    }: {
      showPriority?: boolean;
      showSource?: boolean;
      showCompleted?: boolean;
    } = {}): CSSProperties => {
      const tracks: string[] = [`${widths.title}px`];
      if (showSource) tracks.push(`${widths.source}px`);
      tracks.push(`${widths.status}px`);
      if (showPriority) tracks.push(`${widths.priority}px`);
      tracks.push(
        `${widths.team}px`,
        `${widths.startDate}px`,
        `${widths.dueDate}px`,
      );
      if (showCompleted) tracks.push(`${widths.completed}px`);

      return {
        display: "grid",
        gridTemplateColumns: tracks.join(" "),
        alignItems: "center",
        gap: "1rem",
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
    <DirectoryColumnContext.Provider value={value}>
      {children}
    </DirectoryColumnContext.Provider>
  );
}

/** Resizable Column Header Component with draggable handle on left edge (RTL) */
export function ResizableColumnHeader({
  columnKey,
  children,
  className = "",
}: {
  columnKey: keyof DirectoryColumnWidths;
  children: ReactNode;
  className?: string;
}) {
  const context = useDirectoryColumns();
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const [active, setActive] = useState(false);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!context) return;

      startXRef.current = e.clientX;
      startWidthRef.current = context.widths[columnKey];
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
    context.setColumnWidth(columnKey, DEFAULT_DIRECTORY_COLUMN_WIDTHS[columnKey]);
  }, [columnKey, context]);

  return (
    <div
      className={`group/col relative flex h-full items-center select-none ${className}`}
    >
      <div className="min-w-0 flex-1 truncate">{children}</div>

      {/* Resize Handle on the left edge (divider in RTL) */}
      <div
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        title="اسحب لتغيير عرض العمود (انقر مرتين لإعادة الضبط)"
        className={`absolute -left-2 top-0 bottom-0 z-10 w-4 cursor-col-resize flex items-center justify-center transition-colors ${
          active
            ? "bg-primary/20"
            : "hover:bg-primary/10"
        }`}
      >
        <div
          className={`h-4 w-1 rounded-full transition-colors ${
            active
              ? "bg-primary h-6"
              : "bg-slate-300 group-hover/col:bg-primary/70"
          }`}
        />
      </div>
    </div>
  );
}

