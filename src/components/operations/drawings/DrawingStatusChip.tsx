import Badge from "../../ui/Badge";
import type { DrawingStatus } from "../../../hooks/operations/drawings/useProjectDrawings";
import { STATUS_LABELS } from "./drawingLabels";

/** Shown only while a folder is under design / modification. */
const DrawingStatusChip = ({ status }: { status: string }) => {
  if (status === "ok") return null;
  return (
    <Badge
      label={STATUS_LABELS[status as DrawingStatus] ?? status}
      variant="warning"
      size="sm"
      dot
    />
  );
};

export default DrawingStatusChip;
