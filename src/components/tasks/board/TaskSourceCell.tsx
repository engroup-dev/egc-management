import { Link } from "react-router-dom";
import Tooltip from "../../ui/Tooltip";

interface TaskSourceCellProps {
  spaceName?: string;
  boardName?: string;
  boardId?: string;
}

export default function TaskSourceCell({ spaceName, boardName, boardId }: TaskSourceCellProps) {
  if (!spaceName && !boardName) return <div />;

  const full = [spaceName, boardName].filter(Boolean).join(" › ");

  return (
    <div className="min-w-0">
      <Tooltip label={full}>
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium">
          {spaceName && <span className="truncate text-slate-400">{spaceName}</span>}
          {spaceName && boardName && <span className="shrink-0 text-slate-300">›</span>}
          {boardId && boardName ? (
            <Link
              to={`/tasks/board/${boardId}`}
              className="truncate font-semibold text-slate-700 hover:text-primary hover:underline transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {boardName}
            </Link>
          ) : (
            boardName && <span className="truncate text-slate-600">{boardName}</span>
          )}
        </span>
      </Tooltip>
    </div>
  );
}
