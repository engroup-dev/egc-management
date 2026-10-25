import { useState } from "react";
import { Download } from "lucide-react";
import ConfirmDialog from "../../ui/ConfirmDialog";
import LoadingSpinner from "../../ui/LoadingSpinner";
import {
  useDownloadDrawingVersion,
  type DrawingStatus,
} from "../../../hooks/operations/drawings/useProjectDrawings";
import { STATUS_LABELS } from "./drawingLabels";

interface Props {
  versionId: string | null;
  fileName: string;
  /** Folder status: anything but "ok" asks for confirmation first. */
  status: string;
  statusNote?: string | null;
  allowed: boolean;
  label?: string;
}

const DownloadDrawingButton = ({ versionId, fileName, status, statusNote, allowed, label }: Props) => {
  const download = useDownloadDrawingVersion();
  const [confirming, setConfirming] = useState(false);
  const disabled = !versionId || !allowed || download.isPending;

  const run = async () => {
    setConfirming(false);
    if (!versionId) return;
    try {
      await download.mutateAsync({ versionId, fileName });
    } catch (e) {
      alert(e instanceof Error ? e.message : "تعذر تنزيل الملف");
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => (status === "ok" ? run() : setConfirming(true))}
        title={!allowed ? "ليست لديك صلاحية التنزيل" : label ?? "تنزيل"}
        aria-label={label ?? "تنزيل"}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-primary transition hover:border-primary hover:bg-primary hover:text-white disabled:cursor-default disabled:opacity-35 disabled:hover:border-gray-200 disabled:hover:bg-transparent disabled:hover:text-gray-400"
      >
        {download.isPending ? <LoadingSpinner size="sm" /> : <Download size={16} />}
      </button>

      <ConfirmDialog
        open={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={run}
        title={`هذه الخرائط ${STATUS_LABELS[status as DrawingStatus] ?? ""}`}
        message={`يجري العمل على إصدار جديد، وقد يكون هذا الملف قديماً، فتنزيله الآن قد يعني العمل على معلومات غير محدّثة.${statusNote ? ` ملاحظة: ${statusNote}` : ""}`}
        confirmLabel="تنزيل على أي حال"
        confirmVariant="warning"
      />
    </>
  );
};

export default DownloadDrawingButton;
